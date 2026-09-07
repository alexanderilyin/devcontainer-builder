---
name: fastapi-test-fixture
description: Why and how charts/rest-api (the real FastAPI app used by features/rest/*.feature) is built the way it is - no custom container image, ConfigMap-mounted source with pip-install-at-startup, the checksum/app-config rollout trick, health-probe design, and in-memory/on-disk storage choices. Use when adding a new endpoint/router to charts/rest-api/files/*.py or changing charts/rest-api/templates/*.
---

# The `charts/rest-api` FastAPI test fixture

A real, deployed FastAPI app used to exercise sandbox2's HTTP testing
mechanism (`.agents/skills/http-rest-testing/`). Every design choice
here was deliberate and is worth preserving when extending it.

## No custom container image — deliberate, not a shortcut

This repo has no local `dockerd` (confirmed) — image builds go through a
remote BuildKit builder. Rather than standing up the disposable
BuildKit+registry pipeline the sibling `service/features/` suite uses
(real infra, real overhead, purely to get a custom image pushed), this
chart mounts the app's real `.py` source from a **ConfigMap** onto a
stock `python:3.12-slim`, and installs dependencies for real at pod
startup:
```yaml
args:
  - |
    set -e
    pip install --no-cache-dir fastapi==... "uvicorn[standard]"==... "python-multipart"==...
    exec uvicorn main:app --host 0.0.0.0 --port {{ .Values.service.port }} --app-dir /app
```
Tradeoff, stated plainly: slower pod startup (a real, uncached `pip
install` over the network), no build-time dependency pinning beyond
`values.yaml`'s `pipVersions`. `charts/test-git-server` (repo root) is
the precedent for this exact pattern.

## Adding a new `.py` file

`templates/configmap.yaml` uses `(.Files.Glob "files/*.py").AsConfig` —
any new file under `charts/rest-api/files/*.py` is automatically picked
up in the rendered ConfigMap, **no chart template change needed**. Just:
1. Add the file, define an `APIRouter` if it's a new resource group
   (see `notes.py`/`files.py` as templates — small, focused, one
   resource per file).
2. `main.py` needs `import <module>` + `app.include_router(<module>.router)`.
3. If it needs a new pip package, add it to `values.yaml`'s
   `pipVersions` and the `pip install` line in `templates/deployment.yaml`.

## The `checksum/app-config` rollout trick

Kubernetes does **not** restart a pod just because a referenced
ConfigMap's data changed — the pod template itself is unchanged, so a
plain `helm upgrade` silently no-ops on the running pod. The pod-template
annotation `checksum/app-config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}`
forces a real rollout whenever the *rendered* ConfigMap content changes
— confirmed for real (a no-op `helm upgrade` left the same pod name; a
real one-line source edit produced a new pod name). This covers both
"changed an existing file's content" and "added a new file" identically
— both change what the glob-and-hash renders, so no case-by-case
verification is needed each time, only when the mechanism itself
changes.

## Health probes — designed to actually be exercised, not trivially green

- `/health/startup` — false for a real ~5s (an async startup task, not
  a sleep in the probe handler) before flipping true, so the
  `startupProbe` genuinely blocks on real app state, not an instantly-
  passing check. `startupProbe`'s `periodSeconds`/`failureThreshold`
  budget must absorb the real, uncached `pip install` time — calibrate
  from an actually observed pod start (`kubectl get pod -w`), don't
  guess a number.
- `/health/ready` — normally 200, flippable to 503 via `PUT
  /_test/ready?ready=<bool>` (query param, not a JSON body field — see
  why below). This is the **one** deliberate non-production addition to
  the app, needed so a scenario can actually *witness* "removed from
  Service endpoints, not restarted" end-to-end rather than merely
  asserting it from Kubernetes docs.
- `/health/live` — always 200 currently; no state exists yet whose
  corruption would represent a genuine, restart-worthy deadlock. If a
  future addition needs to test liveness failure for real, it needs a
  similarly deliberate, clearly-commented test-control mechanism — don't
  make `/health/live` fail on something that isn't genuinely
  unrecoverable, that's exactly the anti-pattern k8s's own probe
  guidance warns about (liveness should only restart on a truly
  unrecoverable condition).

`ready` is a **query parameter**, not a JSON body field, specifically
because this framework's `FIELD` request-table rows always send string
values (`"false"`, not JSON `false`) — FastAPI's query-parameter bool
coercion handles `"true"`/`"false"` strings correctly; a JSON body model
field typed `bool` would not, without extra validator work this endpoint
doesn't need.

## Storage: in-memory vs. real bytes on disk

- `notes.py` — pure in-memory `dict`, deliberately. Disposable test
  fixture, doesn't need to survive a restart (same reasoning as
  `charts/test-registry`'s `emptyDir` storage elsewhere in this repo).
- `files.py` — real bytes written to `/data`, a **second**, read-write
  `emptyDir` volume distinct from the read-only ConfigMap-mounted `/app`
  the source itself lives in. Metadata (filename/size/content_type) is
  a separate in-memory index — not derivable from the on-disk bytes
  alone, so it's tracked alongside them, not instead of them.
- File endpoints separate metadata from content as distinct
  representations: `GET /files/{id}` answers "what is this" (JSON),
  `GET /files/{id}/download` answers "give me the actual bytes" (raw,
  with a real `Content-Disposition`) — not one route conflating both.

## Real cluster facts worth not re-deriving

- This shell has direct DNS/network routing to in-cluster Service DNS
  names — no `kubectl port-forward` needed for `fetch()`/`curl` from
  the test process.
- Node's global `FormData`/`Blob`/`File` are real (Node 20+, via
  undici) — no npm dependency needed for multipart client construction.
- FastAPI's file-upload support requires `python-multipart` installed —
  a real, documented FastAPI requirement, not optional.
