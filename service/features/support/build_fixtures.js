import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runHelm } from "./cluster_cli.js";
import { getTestNamespace, ensureTestNamespace } from "./test_namespace.js";
import { waitUntilReachable } from "./wait_for_reachable.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const registryChartPath = path.join(repoRoot, "charts", "test-registry");
const gitServerChartPath = path.join(repoRoot, "charts", "test-git-server");

const NAMESPACE = getTestNamespace(repoRoot);

const REGISTRY_RELEASE = "test-registry";
const AUTHED_REGISTRY_RELEASE = "test-registry-authed";
const BUILDKIT_RELEASE = "test-buildkit";
const GIT_SERVER_RELEASE = "test-git-server";

// Fullname pattern matches every chart's `{{ .Release.Name }}-{{ .Chart.Name }}`
// helper (see charts/test-*/templates/_helpers.tpl), and the external
// buildkit-service chart's own Service naming (`<release>-buildkit-service`).
export const REGISTRY_HOST = `${REGISTRY_RELEASE}-test-registry.${NAMESPACE}.svc.cluster.local:5000`;
// Requires HTTP basic auth (htpasswd) - the one fixture registry that can
// actually distinguish "right credentials" from "wrong/no credentials",
// which the plain anonymous REGISTRY_HOST can't (it accepts any push).
export const AUTHED_REGISTRY_HOST = `${AUTHED_REGISTRY_RELEASE}-test-registry.${NAMESPACE}.svc.cluster.local:5000`;
export const AUTHED_REGISTRY_USERNAME = "svc-bot";
export const AUTHED_REGISTRY_PASSWORD = "hunter2";
export const TEST_BUILDKIT_ENDPOINT = `tcp://${BUILDKIT_RELEASE}-buildkit-service.${NAMESPACE}.svc.cluster.local:1234`;
// Base host only - callers append `:9418/<path>` for git-daemon,
// `:8080/<path>` for smart HTTP, `:443/<path>` (via fixture_sentinels.js's
// "(git fixture https)") for real TLS, or `ssh://git@<host>/<path>` (via
// "(git fixture ssh)") for real SSH - all four share the same `/<path>`
// convention with no protocol-specific prefix.
export const GIT_FIXTURE_HOST = `${GIT_SERVER_RELEASE}-test-git-server.${NAMESPACE}.svc.cluster.local`;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}:\n${output}`));
    });
  });
}

// Real repos get a real, content-derived commit SHA, not one a test can
// dictate - scenarios that need to assert on the derived `sha-<short>` tag
// query the fixture's actual current HEAD (or another real branch, via
// `ref`) at test time (same value build.ts's `git rev-parse HEAD` would see
// after cloning that branch) instead of hardcoding one. Querying a specific
// branch (not just HEAD) is what lets a scenario prove the request's
// `branch` field actually changed which commit got built - `main` and
// `release` are genuinely different commits on the seeded fixture repos.
export function getFixtureHeadShortSha(repoPath, ref = "HEAD") {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["ls-remote", `git://${GIT_FIXTURE_HOST}:9418/${repoPath}`, ref]);
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`git ls-remote for ${repoPath} exited with code ${code}`));
        return;
      }
      const sha = output.trim().split(/\s+/)[0];
      if (!sha) {
        reject(new Error(`git ls-remote for ${repoPath} returned no ref ${ref}: ${output}`));
        return;
      }
      resolve(sha.slice(0, 7));
    });
  });
}

// --- Real TLS: a self-signed CA + a leaf cert for GIT_FIXTURE_HOST -------
//
// Generated fresh once per test run (openssl, not a library - no new
// dependency) and cached. Modern TLS clients (including git's) check
// subjectAltName, not just CN, so the leaf cert needs a SAN matching the
// fixture's exact real DNS name - only known once the namespace is
// computed, so this can't be a static, committed file.
let cachedTls;
export async function getGitFixtureTls() {
  if (!cachedTls) {
    const dir = await mkdtemp(path.join(tmpdir(), "git-fixture-tls-"));
    const caKey = path.join(dir, "ca-key.pem");
    const caCert = path.join(dir, "ca-cert.pem");
    const serverKey = path.join(dir, "server-key.pem");
    const serverCsr = path.join(dir, "server.csr");
    const serverCert = path.join(dir, "server-cert.pem");
    const sanConf = path.join(dir, "san.cnf");

    await run("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", caKey, "-out", caCert,
      "-days", "2", "-subj", "/CN=devcontainer-builder-test-ca",
    ]);
    // CN has a hard 64-char limit and our real hostname routinely exceeds
    // it - irrelevant anyway, since what actually matters for validation is
    // the SAN extension added below, which has no such length limit.
    await run("openssl", [
      "req", "-newkey", "rsa:2048", "-nodes",
      "-keyout", serverKey, "-out", serverCsr,
      "-subj", "/CN=devcontainer-builder-test-git-server",
    ]);
    await writeFile(sanConf, `subjectAltName=DNS:${GIT_FIXTURE_HOST}\n`);
    await run("openssl", [
      "x509", "-req", "-in", serverCsr,
      "-CA", caCert, "-CAkey", caKey, "-CAcreateserial",
      "-out", serverCert, "-days", "2", "-extfile", sanConf,
    ]);

    cachedTls = {
      caCertPath: caCert,
      serverCert: await readFile(serverCert, "utf8"),
      serverKey: await readFile(serverKey, "utf8"),
    };
  }
  return cachedTls;
}

// --- Real SSH: one authorized keypair + one never-authorized keypair -----
//
// `ssh-keygen` (not Node's crypto module) produces the OpenSSH wire-format
// `.pub` file directly - avoiding a manual SPKI-to-OpenSSH-wire-format
// conversion - which is what the fixture's authorized_keys file needs.
let cachedAuthorizedKeyPair;
export async function getGitFixtureAuthorizedKeyPair() {
  if (!cachedAuthorizedKeyPair) {
    const dir = await mkdtemp(path.join(tmpdir(), "git-fixture-ssh-"));
    const keyPath = path.join(dir, "id_ed25519");
    await run("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", keyPath, "-C", "devcontainer-builder-test"]);
    cachedAuthorizedKeyPair = {
      privateKey: await readFile(keyPath, "utf8"),
      publicKey: (await readFile(`${keyPath}.pub`, "utf8")).trim(),
    };
  }
  return cachedAuthorizedKeyPair;
}

const generateKeyPairAsync = promisify(generateKeyPair);
let cachedUnauthorizedKeyPair;

// A syntactically valid SSH private key that the fixture will always
// reject at the authentication step (never added to authorized_keys) -
// used by scenarios proving host-key-verification behavior (TOFU/pinned)
// independent of whether authentication would ultimately succeed.
export async function getTestPrivateKey() {
  if (!cachedUnauthorizedKeyPair) {
    cachedUnauthorizedKeyPair = await generateKeyPairAsync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
  }
  return cachedUnauthorizedKeyPair.privateKey;
}

function runSshKeyscan(host) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh-keyscan", ["-t", "ed25519", host]);
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("exit", (code) => {
      const line = output.split("\n").find((l) => l && !l.startsWith("#"));
      if (code !== 0 || !line) {
        reject(new Error(`ssh-keyscan exited with code ${code}, output: ${output}`));
        return;
      }
      resolve(line.trim());
    });
  });
}

// The fixture's *real* current host key, for "pinned" scenarios that need a
// pin that actually matches - a fake/placeholder pinned key would make the
// clone fail at host-key verification for the wrong reason (a real
// mismatch) instead of proving "pinned" policy works. sshd's default
// MaxStartups throttles/drops a fraction of new unauthenticated connections
// once too many land close together - a real BDD run doing several real SSH
// scenarios in a row can trip this transiently, hence the generous retry.
export async function getFixtureHostKeyLine(host = GIT_FIXTURE_HOST, attempts = 10) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await runSshKeyscan(host);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastError;
}

let cachedWrongHostKey;

// A real, syntactically valid known_hosts line for GIT_FIXTURE_HOST that
// deliberately does NOT match the fixture's actual host key - a fresh,
// unrelated keypair's public half, reformatted as a known_hosts entry. This
// is the one host-key scenario a placeholder/fake line can't safely stand
// in for: a malformed line would fail for the wrong reason (a parse error),
// not the real "Host key verification failed" mismatch a stale/wrong
// "pinned" config should actually produce.
export async function getWrongHostKeyLine() {
  if (!cachedWrongHostKey) {
    const dir = await mkdtemp(path.join(tmpdir(), "git-fixture-wrong-hostkey-"));
    const keyPath = path.join(dir, "decoy");
    await run("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", keyPath, "-C", "decoy"]);
    const [type, base64] = (await readFile(`${keyPath}.pub`, "utf8")).trim().split(" ");
    cachedWrongHostKey = `${GIT_FIXTURE_HOST} ${type} ${base64}`;
  }
  return cachedWrongHostKey;
}

function buildkitdToml() {
  return [REGISTRY_HOST, AUTHED_REGISTRY_HOST]
    .map((host) => `[registry."${host}"]\n  http = true\n  insecure = true\n`)
    .join("");
}

// Deploys two registries BuildKit will actually push to (anonymous and
// auth-enforcing), a *separate* disposable BuildKit instance configured to
// trust both as insecure (the production instance in the `buildkit`
// namespace has no such config and should never be touched for this), and
// the real git server (git/http/https/ssh, one authorized SSH key). Install
// order doesn't matter - none of these are contacted until an actual build
// request runs.
export async function installBuildFixtures() {
  await ensureTestNamespace(NAMESPACE);
  const [tls, sshKeyPair] = await Promise.all([getGitFixtureTls(), getGitFixtureAuthorizedKeyPair()]);

  await Promise.all([
    runHelm(["upgrade", "--install", REGISTRY_RELEASE, registryChartPath, "-n", NAMESPACE, "--wait", "--timeout", "120s"]),
    runHelm([
      "upgrade",
      "--install",
      AUTHED_REGISTRY_RELEASE,
      registryChartPath,
      "-n",
      NAMESPACE,
      "--set",
      "auth.enabled=true",
      "--set",
      `auth.username=${AUTHED_REGISTRY_USERNAME}`,
      "--set",
      `auth.password=${AUTHED_REGISTRY_PASSWORD}`,
      "--wait",
      "--timeout",
      "120s",
    ]),
    runHelm([
      "upgrade",
      "--install",
      BUILDKIT_RELEASE,
      "buildkit-service",
      "--repo",
      "https://andrcuns.github.io/charts",
      "-n",
      NAMESPACE,
      "--set-string",
      `buildkitdToml=${buildkitdToml()}`,
      "--wait",
      "--timeout",
      "180s",
    ]),
    runHelm([
      "upgrade",
      "--install",
      GIT_SERVER_RELEASE,
      gitServerChartPath,
      "-n",
      NAMESPACE,
      "--set-string",
      `sshAuthorizedKey=${sshKeyPair.publicKey}`,
      "--set-string",
      `tlsCert=${tls.serverCert}`,
      "--set-string",
      `tlsKey=${tls.serverKey}`,
      "--wait",
      "--timeout",
      "180s",
    ]),
  ]);

  const buildkitHost = TEST_BUILDKIT_ENDPOINT.replace("tcp://", "");
  await waitUntilReachable([
    { host: REGISTRY_HOST.split(":")[0], port: 5000 },
    { host: AUTHED_REGISTRY_HOST.split(":")[0], port: 5000 },
    { host: buildkitHost.split(":")[0], port: 1234 },
    { host: GIT_FIXTURE_HOST, port: 9418 },
    { host: GIT_FIXTURE_HOST, port: 8080 },
    { host: GIT_FIXTURE_HOST, port: 443 },
    { host: GIT_FIXTURE_HOST, port: 22 },
  ]);
  // A bare TCP connect on 22 can succeed slightly before sshd is fully
  // ready to speak the SSH protocol - confirm a real ssh-keyscan succeeds
  // too before declaring fixtures ready, since scenarios rely on real SSH
  // clones/ssh-keyscan immediately.
  await getFixtureHostKeyLine();
}

export async function uninstallBuildFixtures() {
  const releases = [REGISTRY_RELEASE, AUTHED_REGISTRY_RELEASE, BUILDKIT_RELEASE, GIT_SERVER_RELEASE];
  await Promise.all(
    releases.map((release) =>
      runHelm(["uninstall", release, "-n", NAMESPACE, "--wait", "--timeout", "60s"]).catch(() => {
        // Best-effort cleanup - don't fail an otherwise-green test run
        // because teardown of a disposable fixture had trouble.
      }),
    ),
  );
}
