import { basename } from "node:path";
import { runKubectl } from "./cluster_cli.js";

function computeNamespaceName(repoRoot) {
  const repoName = basename(repoRoot);
  const owner = process.env.CODER_WORKSPACE_OWNER_NAME ?? process.env.USER ?? "local";
  return `${repoName}-${owner}`;
}

// One namespace per repo+workspace-owner, so concurrent BDD runs from
// different Coder workspaces (or different repos sharing this cluster)
// never collide. Override with TEST_FIXTURES_NAMESPACE if needed.
export function getTestNamespace(repoRoot) {
  return process.env.TEST_FIXTURES_NAMESPACE ?? computeNamespaceName(repoRoot);
}

// Idempotent: creates the namespace with the `privileged` pod-security
// level if it doesn't already exist. `privileged` is required for the test
// BuildKit fixture (build_fixtures.js), which - like the production
// instance - must run with `securityContext.privileged: true`; harmless
// for the other fixtures, which don't need it. Safe to call on every
// fixture install.
export async function ensureTestNamespace(namespace) {
  try {
    await runKubectl(["get", "namespace", namespace]);
  } catch {
    await runKubectl(["create", "namespace", namespace]);
    await runKubectl(["label", "namespace", namespace, "pod-security.kubernetes.io/enforce=privileged"]);
  }
}
