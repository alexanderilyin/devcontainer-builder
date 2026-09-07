# Phase 3: `/users/*` CRUD + 5 real auth-method endpoints

*(Implementation complete; the focused Phase 3 scenarios and full suite have
passed against the real cluster. Phases 1-2 of the rest-api work are shipped
and verified
- see `sandbox2/AGENTS.md`'s Status section and `.agents/skills/
http-rest-testing/`, `.agents/skills/fastapi-test-fixture/` for the
mechanism this builds on. Read both skills before starting this.)*

## Context

The original ask (from the conversation that produced Phases 1-2) was a
FastAPI test fixture demonstrating 5 real auth methods - `ApiKey`,
`BasicAuth`, `BearerAuth` (JWT), `OAuth2` (authorization-code flow), and
`OpenIdConnect` - backed by a `/users/` CRUD store where a test user can
be configured with any combination of credentials. Two decisions were
made explicit and should not be revisited without a real reason:

1. **OAuth2/OpenID must be real and self-hosted**, not pointed at
   placeholder `https://example.com/oauth/...` URLs (those were generic
   OpenAPI-template text from the original request, not literal
   instructions). The app implements its own minimal-but-real
   authorization-code flow and OIDC discovery/token/userinfo layer,
   reusing the same JWT signing as BearerAuth - so all 5 schemes are
   genuinely exercised end-to-end by real requests, not 3 real + 2
   documented-only.
2. **No new TypeScript table vocabulary is expected to be needed.**
   `/users/` CRUD should reuse the existing `TYPE|KEY|VALUE` request
   table unchanged - if it doesn't cleanly, that's a signal the design
   has drifted from Phase 1/2's actual mechanism, worth stopping and
   reconsidering rather than pushing through with a new vocabulary.

## New chart source files (`charts/rest-api/files/`)

- **`security.py`** - shared JWT sign/verify helpers (`python-jose[cryptography]`).
  One real signing secret (generated once at pod startup - e.g. `secrets.token_hex(32)`
  in a module-level variable - regenerating per pod restart is fine for
  a disposable test fixture; tokens don't need to survive a restart any
  more than the in-memory state does).
- **`users.py`** - `/users/` CRUD. A user record can carry, independently:
  a bcrypt password hash (`passlib[bcrypt]`) for `BasicAuth`, a generated
  API key for `ApiKey`, and/or bearer-issuance eligibility (a username/
  password pair that `POST /auth/token` accepts to issue a JWT). This is
  the backing credential store every one of the 5 demo endpoints
  validates against - design it first, the other 4 files depend on it.
- **`oauth.py`**:
  - `GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=...`
    - validates the request is well-formed, issues a single-use
    authorization code (short-lived, in-memory), and returns a real
    `302` with a `Location` header (`<redirect_uri>?code=<code>&state=<state>`).
  - `POST /oauth/token` - exchanges a valid code (or, for password-grant
    testing, `BasicAuth`-style client creds is out of scope, keep this
    to authorization_code only) for a real signed JWT access token
    (+ a real signed ID token if `scope` included `openid`, making this
    endpoint double as OIDC's token endpoint - don't build a separate
    one).
  - `GET /.well-known/openid-configuration` - a real, valid OIDC
    discovery document pointing at this app's own `authorization_endpoint`/
    `token_endpoint`/`userinfo_endpoint`/`jwks_uri` (real values, not
    placeholders - even if `jwks_uri` just serves the one symmetric key
    setup allows, keep the document internally consistent).
  - `GET /oauth/userinfo` - `Authorization: Bearer <id-or-access-token>`
    -> real user claims from the token, or 401.
- **`secure.py`** - 5 demo-protected endpoints, one per scheme
  (`GET /auth/api-key/whoami`, `/auth/basic/whoami`,
  `/auth/bearer/whoami`, `/auth/oauth2/whoami`, `/auth/openid/whoami` or
  similar), each validating the presented credential against `users.py`'s
  store and returning the resolved identity on success, a real 401/403
  on failure - the exact status/body to be captured from a real request,
  not assumed.

`main.py` gains `import users, oauth, secure` + 3 more
`app.include_router(...)` calls - no other change.

## TypeScript side - two small, explicitly-scoped extensions to Phase 2's mechanism

1. **Embedding a captured value inside a `HEADER` row's `VALUE`** -
   `Authorization: Bearer <Token>` where `<Token>` was captured from a
   prior `/oauth/token` response. This already works today
   (`substituteCapturedValues` is applied to every table `VALUE` cell,
   not just `FIELD`/path) - Phase 3 doesn't need new capture code, just
   exercises the existing embedded-substitution path against a `HEADER`
   row for the first time. Verify this actually works before assuming
   it does; if it doesn't, that's a real gap in Phase 2's mechanism to
   fix, not something to work around here.
2. **Capturing from a response *header*, not just the JSON body** -
   needed to pull the `code` query-string value out of `/oauth/authorize`'s
   redirect `Location` header (a 302 has no JSON body to query). Extend
   `captureValueFromResponse` (`support/http/capture.ts`) to accept a
   header name instead of/alongside a JMESPath expression - e.g. a new
   step `Given the value of header {string} from the last response is
   known as {string}`, parsing the `code=...` query param out of
   `Location` (or, more generally, capturing the raw header value and
   letting a later step extract the query param via a URL if that's
   cleaner - decide based on what real `/oauth/authorize` output looks
   like, not in the abstract).

## New feature files

- `features/rest/users.feature` - CRUD round trip (create a user with
  a password, get, update, delete), reusing Phase 1/2's `TYPE|KEY|VALUE`
  table unchanged.
- `features/rest/auth.feature`:
  - One scenario per scheme for `ApiKey`/`Basic`/`Bearer`: create a user
    with that credential type, hit the matching `/auth/.../whoami` with
    a valid credential (200, correct identity), then with an invalid one
    (401/403 - real status/body, captured from an actual request).
  - One full authorization-code-flow scenario: `GET /oauth/authorize`
    (capture `code` from the `Location` header) -> `POST /oauth/token`
    (capture `access_token`/`id_token` from the JSON body) -> `GET
    /auth/oauth2/whoami` with `Authorization: Bearer <access_token>`
    (200) -> `GET /oauth/userinfo` with the same token (200, real
    claims) -> `GET /.well-known/openid-configuration` (200, real
    discovery document, asserted via `the command result data has:`
    against real field paths).

## Verification (real, in this order - same discipline as Phases 1-2)

1. `helm lint`/`helm template` - inspect the rendered ConfigMap has all
   4 new files, deployment's pip-install line has the 2 new packages.
2. Manually deploy, and manually exercise every endpoint with real
   `curl` (create a user, get an API key/password/token, hit each
   `/auth/.../whoami`, run the full authorize->token->userinfo flow)
   **before** writing any `.feature` file - capture the real
   status codes/body shapes/header names into the scenarios, don't
   assume them.
3. Write `users.feature`/`auth.feature`, run each in isolation.
4. `npx tsc --noEmit` clean; `npx cucumber-js --dry-run --format
   snippets` clean.
5. `npm test` twice in a row - `kubectl get all -n sandbox2-helm-test` /
   `helm list` both empty afterward, both runs.
6. Update `sandbox2/README.md` (any new divergence - most likely the
   header-capture extension) and `charts/rest-api/README.md` (the
   endpoint list) - don't leave either stale, per this project's
   standing documentation discipline.
