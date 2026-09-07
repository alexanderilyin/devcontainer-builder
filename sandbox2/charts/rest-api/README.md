# rest-api

A real, deployed FastAPI test-fixture app for exercising sandbox2's HTTP
BDD steps (`support/http/`, `step_definitions/http.step.ts`) against a
real running application, not just Helm/kubectl-observed state. See
`sandbox2/.agents/skills/fastapi-test-fixture/` for the full design
rationale (why no custom container image, the ConfigMap-mounted-source +
pip-install-at-startup tradeoff, health-probe design, storage choices).

## Endpoints (current, Phase 2)

- `GET /health/startup` / `/health/ready` / `/health/live` - k8s probe
  endpoints. `PUT /_test/ready?ready=<bool>` is a deliberate,
  non-production test-control endpoint for flipping readiness on demand.
- `/notes/` - in-memory JSON CRUD (`POST`/`GET`/`GET {id}`/`PUT {id}`/
  `DELETE {id}`).
- `/files/` - real file upload/download (`POST` multipart, `GET`/
  `GET {id}` metadata, `GET {id}/download` raw bytes, `DELETE {id}`) -
  real bytes on a writable `/data` `emptyDir` volume.

Not yet implemented (see `sandbox2/claude/plans/` for the plan):
`/users/*` CRUD and the 5 real auth-method endpoints (ApiKey, Basic,
Bearer/JWT, self-hosted OAuth2, self-hosted OpenID Connect).

## Source layout

`files/*.py` is mounted into the pod from a ConfigMap
(`templates/configmap.yaml`'s `Files.Glob`) - add a new `.py` file and
`include_router()` it from `main.py`, no chart template change needed.
Dependencies are installed for real at pod startup (see
`templates/deployment.yaml`); add a new pip package to both
`values.yaml`'s `pipVersions` and the `pip install` line there.
