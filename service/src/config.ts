import { readFileSync } from "node:fs";

export type GitCredentialEntry =
  | { host: string; kind: "https"; username: string; token: string }
  | { host: string; kind: "ssh"; privateKey: string; pinnedHostKey?: string };

export interface RegistryMappingRule {
  hostMatch?: string;
  pathPrefix?: string;
  registry: string;
}

export type SshHostKeyPolicy = "tofu" | "pinned";

function isGitCredentialEntry(value: unknown): value is GitCredentialEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.host !== "string" || v.host.length === 0) return false;

  if (v.kind === "https") {
    return typeof v.username === "string" && typeof v.token === "string";
  }
  if (v.kind === "ssh") {
    if (typeof v.privateKey !== "string" || v.privateKey.length === 0) return false;
    return v.pinnedHostKey === undefined || typeof v.pinnedHostKey === "string";
  }
  return false;
}

function isRegistryMappingRule(value: unknown): value is RegistryMappingRule {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.registry !== "string" || v.registry.length === 0) return false;
  if (v.hostMatch !== undefined && typeof v.hostMatch !== "string") return false;
  if (v.pathPrefix !== undefined && typeof v.pathPrefix !== "string") return false;
  return true;
}

// Reads an operator-authored JSON array from disk (Helm-mounted Secret or
// ConfigMap). A missing/unset path is a supported "feature not configured"
// state -> empty list. An unreadable/malformed *file* fails fast (crash at
// startup, same as a bad BUILDKIT_ENDPOINT would surface immediately) since
// this is deployment-time misconfiguration, not per-request input. One bad
// *entry* inside an otherwise-valid array is logged and skipped rather than
// taking down the whole service, mirroring how a single bad BuildRequest
// field doesn't crash the process either.
function loadJsonArrayConfig<T>(
  path: string | undefined,
  isValidEntry: (value: unknown) => value is T,
  label: string,
): T[] {
  if (!path) return [];

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`failed to read ${label} config at ${path}: ${err instanceof Error ? err.message : err}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`failed to parse ${label} config at ${path}: ${err instanceof Error ? err.message : err}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} config at ${path} must be a JSON array`);
  }

  const entries: T[] = [];
  for (const [index, item] of parsed.entries()) {
    if (isValidEntry(item)) {
      entries.push(item);
    } else {
      console.error(`skipping invalid ${label} config entry at index ${index}`);
    }
  }
  return entries;
}

function loadSshHostKeyPolicy(): SshHostKeyPolicy {
  const raw = process.env.SSH_HOST_KEY_POLICY;
  if (raw === "pinned") return "pinned";
  if (raw !== undefined && raw !== "tofu") {
    throw new Error(`SSH_HOST_KEY_POLICY must be "tofu" or "pinned", got ${JSON.stringify(raw)}`);
  }
  return "tofu";
}

export interface ServiceConfig {
  gitCredentials: GitCredentialEntry[];
  registryMappingRules: RegistryMappingRule[];
  sshHostKeyPolicy: SshHostKeyPolicy;
}

export function loadServiceConfig(): ServiceConfig {
  return {
    gitCredentials: loadJsonArrayConfig(
      process.env.GIT_CREDENTIALS_CONFIG_PATH,
      isGitCredentialEntry,
      "git credentials",
    ),
    registryMappingRules: loadJsonArrayConfig(
      process.env.REGISTRY_MAPPING_CONFIG_PATH,
      isRegistryMappingRule,
      "registry mapping",
    ),
    sshHostKeyPolicy: loadSshHostKeyPolicy(),
  };
}
