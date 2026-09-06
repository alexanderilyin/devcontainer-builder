import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
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
// Base host only - callers append `:9418/<path>` for git-daemon or
// `:8080/cgi-bin/git-http-backend/<path>` for smart HTTP.
export const GIT_FIXTURE_HOST = `${GIT_SERVER_RELEASE}-test-git-server.${NAMESPACE}.svc.cluster.local`;

// Real repos get a real, content-derived commit SHA, not one a test can
// dictate - scenarios that need to assert on the derived `sha-<short>` tag
// query the fixture's actual current HEAD at test time (same value
// build.ts's `git rev-parse HEAD` would see) instead of hardcoding one.
export function getFixtureHeadShortSha(repoPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["ls-remote", `git://${GIT_FIXTURE_HOST}:9418/${repoPath}`, "HEAD"]);
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
        reject(new Error(`git ls-remote for ${repoPath} returned no HEAD ref: ${output}`));
        return;
      }
      resolve(sha.slice(0, 7));
    });
  });
}

function buildkitdToml() {
  return [REGISTRY_HOST, AUTHED_REGISTRY_HOST]
    .map((host) => `[registry."${host}"]\n  http = true\n  insecure = true\n`)
    .join("");
}

// Deploys two registries BuildKit will actually push to (anonymous and
// auth-enforcing), plus a *separate* disposable BuildKit instance
// configured to trust both as insecure (the production instance in the
// `buildkit` namespace has no such config and should never be touched for
// this). Install order doesn't matter - none of these are contacted until
// an actual build request runs.
export async function installBuildFixtures() {
  await ensureTestNamespace(NAMESPACE);
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
    runHelm(["upgrade", "--install", GIT_SERVER_RELEASE, gitServerChartPath, "-n", NAMESPACE, "--wait", "--timeout", "180s"]),
  ]);

  const buildkitHost = TEST_BUILDKIT_ENDPOINT.replace("tcp://", "");
  await waitUntilReachable([
    { host: REGISTRY_HOST.split(":")[0], port: 5000 },
    { host: AUTHED_REGISTRY_HOST.split(":")[0], port: 5000 },
    { host: buildkitHost.split(":")[0], port: 1234 },
    { host: GIT_FIXTURE_HOST, port: 9418 },
    { host: GIT_FIXTURE_HOST, port: 8080 },
  ]);
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
