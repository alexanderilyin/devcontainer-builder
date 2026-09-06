import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runHelm } from "./cluster_cli.js";
import { getTestNamespace, ensureTestNamespace } from "./test_namespace.js";
import { waitUntilReachable } from "./wait_for_reachable.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const chartPath = path.join(repoRoot, "charts", "test-openssh-server");

const RELEASE_NAME = "test-openssh-server";
const NAMESPACE = getTestNamespace(repoRoot);

// Matches the chart's `{{ include "test-openssh-server.fullname" . }}`
// (release name + "-" + chart name) and its Service's in-cluster DNS name.
// Port is deliberately the SSH default (22) - see values.yaml's comment -
// so a plain `ssh://host/path` URL (no port) reaches it.
export const SSH_FIXTURE_HOST = `${RELEASE_NAME}-test-openssh-server.${NAMESPACE}.svc.cluster.local`;

export async function installSshFixture() {
  await ensureTestNamespace(NAMESPACE);
  await runHelm(["upgrade", "--install", RELEASE_NAME, chartPath, "-n", NAMESPACE, "--wait", "--timeout", "180s"]);
  // `helm --wait` only confirms the pod's own readiness probe passed, not
  // that the cluster's Service routing has caught up yet - see
  // build_fixtures.js's installBuildFixtures for the full rationale.
  await waitUntilReachable([{ host: SSH_FIXTURE_HOST, port: 22 }]);
  // A bare TCP connect can succeed slightly before sshd is fully ready to
  // speak the SSH protocol - confirm a real ssh-keyscan succeeds too
  // (getFixtureHostKeyLine already retries) before declaring this fixture
  // ready, since scenarios rely on ssh-keyscan/real SSH clones immediately.
  await getFixtureHostKeyLine();
}

export async function uninstallSshFixture() {
  try {
    await runHelm(["uninstall", RELEASE_NAME, "-n", NAMESPACE, "--wait", "--timeout", "60s"]);
  } catch {
    // Best-effort cleanup - don't fail an otherwise-green test run because
    // teardown of a disposable fixture had trouble (e.g. already removed).
  }
}

const generateKeyPairAsync = promisify(generateKeyPair);
let cachedTestKeyPair;

// A syntactically valid SSH private key for scenarios that only need *some*
// key to offer during auth (which the fixture will reject, since it has no
// matching authorized key configured - see test-openssh-server chart notes).
// Generated once per test run and cached, since scenarios don't need
// distinct keys from each other.
export async function getTestPrivateKey() {
  if (!cachedTestKeyPair) {
    cachedTestKeyPair = await generateKeyPairAsync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
  }
  return cachedTestKeyPair.privateKey;
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
      // ssh-keyscan prefixes with the queried host; SSH's own known_hosts
      // format for a plain hostname entry is "<host> <type> <key>", which is
      // exactly what it already outputs.
      resolve(line.trim());
    });
  });
}

// The fixture's *real* current host key, for "pinned" scenarios that need a
// pin that actually matches - a fake/placeholder pinned key would make the
// clone fail at host-key verification for the wrong reason (a real
// mismatch), not proving "pinned" policy behaves correctly. ssh-keyscan
// needs the SSH *protocol* to be up, not just the TCP port accepting
// connections (see the retry here and in installSshFixture below) - a bare
// TCP connect can succeed slightly before sshd is fully ready to speak SSH.
export async function getFixtureHostKeyLine(host = SSH_FIXTURE_HOST, attempts = 10) {
  // sshd's default MaxStartups throttles/drops a fraction of new
  // unauthenticated connections (ssh-keyscan and every clone attempt both
  // count) once too many land close together - a real BDD run doing
  // several real SSH scenarios in a row can trip this transiently. It
  // clears quickly, so retry generously rather than reconfiguring sshd.
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
