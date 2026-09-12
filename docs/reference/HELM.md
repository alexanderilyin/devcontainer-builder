<title>Helm chart</title>

# Helm chart

[`charts/devcontainer-builder`](https://github.com/alexanderilyin/devcontainer-builder/tree/main/charts/devcontainer-builder)
deploys a single-replica `Deployment` + `ClusterIP` `Service` — no
autoscaling or `Ingress` by design; this is an in-cluster-only caller
service, not a public one. Every value below is the chart's own real
[`values.yaml`](https://github.com/alexanderilyin/devcontainer-builder/blob/main/charts/devcontainer-builder/values.yaml).

```bash
helm lint charts/devcontainer-builder
helm template charts/devcontainer-builder -f my-values.yaml
```

## `image`

| Key | Default | Notes |
|---|---|---|
| `image.repository` | `ghcr.io/example/devcontainer-builder` | Placeholder — set to a real, pushed image. |
| `image.tag` | `"0.1.0"` | |
| `image.pullPolicy` | `IfNotPresent` | |

## `service`

| Key | Default | Notes |
|---|---|---|
| `service.port` | `8080` | Also becomes the container's `PORT` env var. |

## `buildkit`

| Key | Default | Notes |
|---|---|---|
| `buildkit.endpoint` | `""` | e.g. `tcp://buildkit-buildkit-service.buildkit.svc.cluster.local:1234`. Unset means readiness never passes — see [`/health/ready`](API.md#get-healthready). |

## `registryAuth`

Ambient registry push credentials — used whenever a `/build` request
doesn't supply its own `registryCredentials`.

| Key | Default | Notes |
|---|---|---|
| `registryAuth.existingSecret` | `""` | Name of an existing `kubernetes.io/dockerconfigjson`-shaped Secret. |
| `registryAuth.dockerConfigJson` | `""` | Inline docker-config-JSON string, rendered into a chart-managed Secret if `existingSecret` is unset. |

Unconfigured means an empty `{"auths":{}}` — pushes rely entirely on
whatever the target registry allows anonymously, or on a per-request
`registryCredentials` override.

## `gitCredentials`

Server-side default git credentials — see
[Configuration](CONFIGURATION.md#gitcredentialsentries-registrymappingrules)
for the entry shape and [Credential handling](../concepts/credential-handling.md)
for how they're used.

| Key | Default | Notes |
|---|---|---|
| `gitCredentials.enabled` | `true` | `false` omits `GIT_CREDENTIALS_CONFIG_PATH` and its volume entirely, rather than pointing at an empty list. |
| `gitCredentials.existingSecret` | `""` | Name of an existing Secret containing a `git-credentials.json` key (same array shape as `entries`). |
| `gitCredentials.entries` | `[]` | Inline entries, rendered into a chart-managed Secret if `existingSecret` is unset. |

## `sshHostKeyPolicy`

| Key | Default | Notes |
|---|---|---|
| `sshHostKeyPolicy` | `tofu` | `tofu` or `pinned` — see [Configuration](CONFIGURATION.md#ssh_host_key_policy). |

## `registryMapping`

Server-side repo → registry routing rules, used to resolve
`image.registry` when a request omits it.

| Key | Default | Notes |
|---|---|---|
| `registryMapping.enabled` | `true` | `false` omits `REGISTRY_MAPPING_CONFIG_PATH` and its volume entirely. |
| `registryMapping.existingConfigMap` | `""` | Name of an existing ConfigMap containing a `registry-mapping.json` key. |
| `registryMapping.rules` | `[]` | Inline rules, rendered into a chart-managed ConfigMap if `existingConfigMap` is unset. |

## `settingsFile`

The unified [settings file](CONFIGURATION.md#the-settings-file).

| Key | Default | Notes |
|---|---|---|
| `settingsFile.content` | `""` | Inline JSON/YAML content, rendered into a chart-managed ConfigMap and mounted at `SERVICE_CONFIG_PATH`. Empty omits the env var/volume entirely. |
| `settingsFile.filename` | `settings.json` | Must match `content`'s real format — `config.ts` picks its parser by extension (`.json`, `.yaml`, `.yml`). |

## Escape hatches: `extraArgs`, `extraEnv`, `extraVolumes`, `extraVolumeMounts`

| Key | Default | Notes |
|---|---|---|
| `extraArgs` | `[]` | Appended to the container's entrypoint args, e.g. `["--ssh-host-key-policy", "pinned"]`. |
| `extraEnv` | `[]` | Appended after the chart's own env entries — a plain `[{name: ..., value: ...}]` list. |
| `extraVolumes` / `extraVolumeMounts` | `[]` | Appended after the chart's own volumes/mounts — e.g. mounting a caller-provided ConfigMap holding a CA cert, paired with `extraEnv` pointing `GIT_SSL_CAINFO` at it. |

## `podSecurityContext`, `resources`, `scratchVolume`, `updateStrategy`, `replicaCount`

| Key | Default | Notes |
|---|---|---|
| `replicaCount` | `1` | |
| `updateStrategy` | `{}` | Empty means Kubernetes' own default (`RollingUpdate`). |
| `podSecurityContext.fsGroup` | `2000` | Must match the image's `builder` user's gid (`Dockerfile`'s `useradd --uid 2000 builder`) so group-readable mounted Secret/ConfigMap files are actually readable by the non-root process. |
| `resources.requests` | `cpu: 250m`, `memory: 256Mi` | |
| `resources.limits` | `cpu: "1"`, `memory: 1Gi` | |
| `scratchVolume.sizeLimit` | `5Gi` | An `emptyDir` mounted at `/tmp` — every per-request scratch clone/credential directory (see [Credential handling](../concepts/credential-handling.md)) lives here. |
