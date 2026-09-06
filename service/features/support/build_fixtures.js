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

// Fullname pattern matches every chart's `{{ .Release.Name }}-{{ .Chart.Name }}`
// helper (see charts/test-*/templates/_helpers.tpl), and the external
// buildkit-service chart's own Service naming (`<release>-buildkit-service`).
// Deliberately `let`, not `const`, and uninitialized until
// `registerFixtureReleases()` runs (see "Given the following fixture
// releases are registered:" in fixture.steps.js) - the release-name
// identifiers themselves are now a Gherkin fact, not a hardcoded literal.
// ESM export bindings are live references, so every consumer here that
// already just reads REGISTRY_HOST/GIT_FIXTURE_HOST/etc. by name
// (ensureXFixtureDeployed, getFixtureHeadShortSha, getGitFixtureTls,
// common.steps.js's "... URL is known as ..." steps) keeps working
// completely unchanged - they're reading the same binding, it's just
// genuinely set from a scenario now instead of computed once at module
// load from a constant nobody could see.
export let REGISTRY_HOST;
// Requires HTTP basic auth (htpasswd) - the one fixture registry that can
// actually distinguish "right credentials" from "wrong/no credentials",
// which the plain anonymous REGISTRY_HOST can't (it accepts any push).
// Username/password are supplied by whoever deploys this fixture (see
// "the test-registry-authed fixture is deployed with username ... and
// password ..." in fixture.steps.js) - the Gherkin text is the source of
// truth for these, not a constant hidden here.
export let AUTHED_REGISTRY_HOST;
export let TEST_BUILDKIT_ENDPOINT;
// Base host only - callers append `:9418/<path>` for git-daemon,
// `:8080/<path>` for smart HTTP, `:443/<path>` for real TLS, or
// `ssh://git@<host>/<path>` for real SSH - all four share the same
// `/<path>` convention with no protocol-specific prefix (see
// common.steps.js's "the test-git-server fixture's ... URL is known as
// ..." steps, which build each of these four forms).
export let GIT_FIXTURE_HOST;

let releaseNames;

// Only computes a host for a release that was actually provided - a file
// that only needs 3 of the 4 fixtures (per the existing per-file audit)
// omits that row from its table, and a template literal would otherwise
// silently stringify `undefined` into a bogus-but-defined host
// ("undefined-test-registry...") instead of leaving it genuinely unset.
// In a combined multi-file run this also means a later file's narrower
// table can't accidentally clobber an earlier file's still-valid value -
// it just leaves whatever was already there alone.
export function registerFixtureReleases(releases) {
  // Only merge keys the table actually provided - `releases` always has
  // all 4 keys present (fixture.steps.js builds it from a fixed shape),
  // but a row this table omits comes through as an *explicit* `undefined`
  // property, and `{ ...releaseNames, ...releases }` would still copy
  // that explicit `undefined` over an earlier file's real value in a
  // combined run. Filtering to defined entries first is what actually
  // gives the "leaves whatever was already there alone" behavior the
  // HOST constants below already have via their own `if (releases.x)` guards.
  const provided = Object.fromEntries(Object.entries(releases).filter(([, value]) => value !== undefined));
  releaseNames = { ...releaseNames, ...provided };
  if (releases.registry) REGISTRY_HOST = `${releases.registry}-test-registry.${NAMESPACE}.svc.cluster.local:5000`;
  if (releases.registryAuthed) AUTHED_REGISTRY_HOST = `${releases.registryAuthed}-test-registry.${NAMESPACE}.svc.cluster.local:5000`;
  if (releases.buildkit) TEST_BUILDKIT_ENDPOINT = `tcp://${releases.buildkit}-buildkit-service.${NAMESPACE}.svc.cluster.local:1234`;
  if (releases.gitServer) GIT_FIXTURE_HOST = `${releases.gitServer}-test-git-server.${NAMESPACE}.svc.cluster.local`;
}

function requireRegisteredReleases() {
  if (!releaseNames) {
    throw new Error(
      'fixture releases not registered - add "Given the following fixture releases are registered:" before this step',
    );
  }
  return releaseNames;
}

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

// --- Per-chart, idempotent, lazy deployment ------------------------------
//
// One memoized function per `test-*` Helm chart, each triggered by its own
// named "Given the test-* fixture is deployed" step (see fixture.steps.js)
// instead of one umbrella that always deploys everything - a `.feature`
// file only pays for (and only declares) the fixtures it actually uses.
// `??=` means calling one of these twice in a process only deploys once;
// the exported constants above (REGISTRY_HOST, GIT_FIXTURE_HOST, etc.)
// resolve to the right DNS name regardless of whether the corresponding
// fixture has actually been deployed yet in this run - deploying is what
// makes that name resolve to something real.

let registryFixture;
export function ensureRegistryFixtureDeployed() {
  registryFixture ??= (async () => {
    const { registry } = requireRegisteredReleases();
    await ensureTestNamespace(NAMESPACE);
    await runHelm(["upgrade", "--install", registry, registryChartPath, "-n", NAMESPACE, "--wait", "--timeout", "120s"]);
    await waitUntilReachable([{ host: REGISTRY_HOST.split(":")[0], port: 5000 }]);
  })();
  return registryFixture;
}

let authedRegistryFixture;
export function ensureAuthedRegistryFixtureDeployed(username, password) {
  authedRegistryFixture ??= (async () => {
    const { registryAuthed } = requireRegisteredReleases();
    await ensureTestNamespace(NAMESPACE);
    await runHelm([
      "upgrade",
      "--install",
      registryAuthed,
      registryChartPath,
      "-n",
      NAMESPACE,
      "--set",
      "auth.enabled=true",
      "--set",
      `auth.username=${username}`,
      "--set",
      `auth.password=${password}`,
      "--wait",
      "--timeout",
      "120s",
    ]);
    await waitUntilReachable([{ host: AUTHED_REGISTRY_HOST.split(":")[0], port: 5000 }]);
  })();
  return authedRegistryFixture;
}

let buildkitFixture;
export function ensureBuildkitFixtureDeployed() {
  buildkitFixture ??= (async () => {
    const { buildkit } = requireRegisteredReleases();
    await ensureTestNamespace(NAMESPACE);
    await runHelm([
      "upgrade",
      "--install",
      buildkit,
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
    ]);
    const buildkitHost = TEST_BUILDKIT_ENDPOINT.replace("tcp://", "").split(":")[0];
    await waitUntilReachable([{ host: buildkitHost, port: 1234 }]);
  })();
  return buildkitFixture;
}

let gitServerFixture;
// `ports` is the literal list of port numbers from the calling Given
// step's data table - every caller declares the same full git/http/https/
// ssh set (what the fixture actually is), not just the protocol that
// caller's own scenarios happen to exercise. That matters because this is
// memoized process-wide: a narrower first caller would otherwise leave a
// later caller's port never actually confirmed reachable.
export function ensureGitServerFixtureDeployed(ports) {
  gitServerFixture ??= (async () => {
    const { gitServer } = requireRegisteredReleases();
    await ensureTestNamespace(NAMESPACE);
    const [tls, sshKeyPair] = await Promise.all([getGitFixtureTls(), getGitFixtureAuthorizedKeyPair()]);
    await runHelm([
      "upgrade",
      "--install",
      gitServer,
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
    ]);
    await waitUntilReachable(ports.map((port) => ({ host: GIT_FIXTURE_HOST, port })));
    // A bare TCP connect on 22 can succeed slightly before sshd is fully
    // ready to speak the SSH protocol - confirm a real ssh-keyscan succeeds
    // too before declaring the fixture ready, since scenarios rely on real
    // SSH clones/ssh-keyscan immediately.
    if (ports.includes(22)) {
      await getFixtureHostKeyLine();
    }
  })();
  return gitServerFixture;
}

// Tears down only whichever of the 4 fixtures actually got deployed in
// this process (tracked by which memoized promise above got set) - not
// unconditionally all 4, since a given run may have only needed some.
export async function uninstallBuildFixtures() {
  // Optional chaining, not a bare `releaseNames.x`: a deploy attempt can
  // fail *after* its memoized promise slot is set (a rejected promise is
  // still a truthy value) but *before* registerFixtureReleases ever ran -
  // e.g. a scenario missing "Given the following fixture releases are
  // registered:" entirely. Teardown must stay best-effort even then, not
  // itself throw and mask the real failure.
  const releases = [];
  if (registryFixture) releases.push(releaseNames?.registry);
  if (authedRegistryFixture) releases.push(releaseNames?.registryAuthed);
  if (buildkitFixture) releases.push(releaseNames?.buildkit);
  if (gitServerFixture) releases.push(releaseNames?.gitServer);

  await Promise.all(
    releases
      .filter(Boolean)
      .map((release) =>
        runHelm(["uninstall", release, "-n", NAMESPACE, "--wait", "--timeout", "60s"]).catch(() => {
          // Best-effort cleanup - don't fail an otherwise-green test run
          // because teardown of a disposable fixture had trouble.
        }),
      ),
  );
}
