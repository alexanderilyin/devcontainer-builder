# rest-api

A real, deployed FastAPI test-fixture app for exercising sandbox2's HTTP
BDD steps (`support/http/`, `step_definitions/http.step.ts`) against a
real running application, not just Helm/kubectl-observed state. See
`sandbox2/.agents/skills/fastapi-test-fixture/` for the full design
rationale (why no custom container image, the ConfigMap-mounted-source +
pip-install-at-startup tradeoff, health-probe design, storage choices).

## Endpoints (current, Phase 3)

- `GET /health/startup` / `/health/ready` / `/health/live` - k8s probe
  endpoints. `PUT /_test/ready?ready=<bool>` is a deliberate,
  non-production test-control endpoint for flipping readiness on demand.
- `/notes/` - in-memory JSON CRUD (`POST`/`GET`/`GET {id}`/`PUT {id}`/
  `DELETE {id}`).
- `/files/` - real file upload/download (`POST` multipart, `GET`/
  `GET {id}` metadata, `GET {id}/download` raw bytes, `DELETE {id}`) -
  real bytes on a writable `/data` `emptyDir` volume.

- `/users/` - in-memory user CRUD with password, API-key, and bearer-token
  credentials. Generated API keys are returned only on create/rotation.
- `/auth/api-key/whoami` - `X-API-Key` authentication.
- `/auth/basic/whoami` - HTTP Basic authentication.
- `/auth/token` and `/auth/bearer/whoami` - password-backed bearer JWT.
- `/auth/oauth2/whoami` - OAuth2 access-token validation.
- `/auth/openid/whoami` - OIDC ID-token validation.
- `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/oauth/jwks`, and
  `/.well-known/openid-configuration` - self-hosted authorization-code and
  OIDC endpoints. The disposable fixture accepts explicit username/password
  query parameters on `/oauth/authorize` because the BDD client has no browser
  session flow.

## Source layout

`files/*.py` is mounted into the pod from a ConfigMap
(`templates/configmap.yaml`'s `Files.Glob`) - add a new `.py` file and
`include_router()` it from `main.py`, no chart template change needed.
Dependencies are installed for real at pod startup (see
`templates/deployment.yaml`); add a new pip package to both
`values.yaml`'s `pipVersions` and the `pip install` line there. Phase 3 pins
`bcrypt`, `cryptography`, and `python-jose[cryptography]` alongside the
existing FastAPI dependencies.
