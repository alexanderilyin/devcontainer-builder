<title>HTTP API</title>

# HTTP API

Three routes, no authentication of its own (the service is meant to sit
behind cluster-internal networking — see the Helm chart's
[`Service`](HELM.md#service)). Every response is `application/json`.
Any other method/path returns `404 {"error":"not found"}`.

## `GET /health/live`

Liveness probe. Always `200 {"status":"ok"}` once the process is
listening — checks nothing beyond that.

## `GET /health/ready`

Readiness probe.

| Status | Body | When |
|---|---|---|
| `200` | `{"status":"ready"}` | `BUILDKIT_ENDPOINT` is configured |
| `503` | `{"status":"not ready","reason":"BUILDKIT_ENDPOINT not configured"}` | it isn't |

This is a presence check, not a live connectivity probe against
BuildKit — see [Architecture](../concepts/architecture.md#health-endpoints).

## `POST /build`

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `repository` | `string` | yes | Non-empty. `https://`, `ssh://`, or git's own SCP-style `[user@]host:path` shorthand. |
| `branch` | `string` | no | Defaults to `main`. Omitted or a non-empty string only. |
| `image.registry` | `string` | no | Non-empty if given. Wins over any server-side [mapping rule](CONFIGURATION.md#registry-mapping-rule). |
| `image.name` | `string` | no | Non-empty if given. Defaults to the repository path's last segment, `.git` stripped. |
| `image.tag` | `string` | no | Non-empty if given. Defaults to `sha-<short HEAD sha>`. |
| `gitCredentials.username` | `string` | no* | Required together with `token` if `gitCredentials` is present. |
| `gitCredentials.token` | `string` | no* | Always HTTPS-shaped — see [Credential handling](../concepts/credential-handling.md#git-credentials). |
| `registryCredentials.registry` | `string` | no* | Required together with `username`/`password` if `registryCredentials` is present. Non-empty. |
| `registryCredentials.username` | `string` | no* | Non-empty. |
| `registryCredentials.password` | `string` | no* | Non-empty. |

`image`/`gitCredentials`/`registryCredentials` may each be omitted
entirely; once present, their own required sub-fields apply (marked
`no*` above). Unknown top-level fields are tolerated, not rejected.

=== "Minimal"

    ```json
    { "repository": "https://github.com/example/example-devcontainer.git" }
    ```

=== "Fully specified"

    ```json
    {
      "repository": "git@github.example.com:org/repo.git",
      "branch": "release",
      "image": { "registry": "ghcr.io/example", "name": "custom-name", "tag": "v1.2.3" },
      "gitCredentials": { "username": "svc-bot", "token": "ghp_example" },
      "registryCredentials": { "registry": "ghcr.io/example", "username": "svc-bot", "password": "hunter2" }
    }
    ```

### Responses

| Status | Body | When |
|---|---|---|
| `200` | `{"image": "<registry>/<name>:<tag>"}` | The clone and build+push both succeeded. |
| `400` | `{"error": "invalid JSON body"}` | The request body isn't valid JSON at all. |
| `400` | `{"error": "missing or invalid fields: repository (required); branch, image.{registry,name,tag}, gitCredentials.{username,token}, registryCredentials.{registry,username,password} (all optional)"}` | The parsed body isn't a JSON object, or fails the shape check above. |
| `400` | `{"error": "unable to parse git repository URL: <repository>"}` | `repository` doesn't match any accepted URL form. |
| `400` | `{"error": "no registry resolved for repository <repository>: provide image.registry or configure a matching registry mapping rule"}` | No `image.registry` given and no [mapping rule](CONFIGURATION.md#registry-mapping-rule) matched. |
| `400` | `{"error": "SSH host key policy is \"pinned\" but no pinned key configured for host <host>"}` | The resolved SSH credential has no `pinnedHostKey` under `sshHostKeyPolicy: pinned`. |
| `500` | `{"error": "<command> <args...> exited with code <n>"}` | A real clone or build failure. |

!!! note "400 vs. 500"
    A `400` always means the *request itself* was unusable — nothing was
    ever attempted, or a required piece of configuration to even attempt
    it (a registry, a host key pin) was missing. A `500` always means a
    real external command was actually run and failed — the request was
    well-formed, but cloning or building it didn't work. See
    [`BuildRequestError`](../concepts/architecture.md#request-lifecycle-post-build)
    for the code-level distinction.

!!! warning "A 500's body is the real command and exit code, not the real error text"
    Subprocess stdout/stderr is inherited straight through to this
    service's own process output (`stdio: "inherit"`, never captured) —
    so a real `500` body looks like
    `{"error":"git clone --branch main --single-branch --depth 1 <url> <dir> exited with code 128"}`,
    not the actual `fatal: repository not found` (or a registry's real
    401 body) that caused it. That real text is only in this service's
    own pod logs. See
    [0002](../decisions/0002-credentials-never-touch-argv-or-urls.md)'s
    own consequence note on why this wasn't captured more granularly.
