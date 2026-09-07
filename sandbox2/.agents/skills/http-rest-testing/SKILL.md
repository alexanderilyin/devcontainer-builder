---
name: http-rest-testing
description: sandbox2's HTTP domain - RestEndpoint (real Service DNS + fetch()), the TYPE|KEY|VALUE request table (headers/query/JSON body/multipart), response assertions, binary-safe download verification, and dynamic-value capture. Use when writing or debugging a features/rest/*.feature scenario, or support/http/*.ts / step_definitions/http.step.ts.
---

# HTTP testing in sandbox2

See `.agents/skills/bdd-alias-datatable/` first, and
`.agents/skills/kubectl-discovery-polling/` for how the `Service` a
`RestEndpoint` wraps gets discovered. This is the newest domain — real
`fetch()` calls against a real deployed app's real Service DNS name,
reachable directly from the Cucumber process (no `kubectl port-forward`
needed — confirmed this shell has direct pod-network/DNS routing).

## `RestEndpoint`

```gherkin
Given Service known as "<ApiService>":
  | PROPERTY                   | VALUE                 |
  | namespace                  | sandbox2-helm-test    |
  | app.kubernetes.io/instance | sandbox-my-release    |
And RestEndpoint known as "<Api>":
  | PROPERTY | VALUE         |
  | service  | <ApiService> |
  | port     | 8000          |
```
`RestEndpoint.baseUrl` is `http://<service>.<namespace>.svc.cluster.local:<port>`
— its `service` field resolves to the real `Service` **object** (same
mechanism as `Release.chart`), not a string, since it needs the object's
real `.name`/`.namespace`. Its `Given` stays pure construction (no live
check) — there's no cheap read-only analog to "is this URL reachable,"
so the first real validation is the paired `When I send a ...`.

## Making a request

```gherkin
When I send a {word} request to RestEndpoint known as {string} path {string}          # no body/headers/query
When I send a {word} request to RestEndpoint known as {string} path {string} with:     # + a TYPE|KEY|VALUE table
```
Both have `I attempt to send a ...` siblings (wrapping in `attempt()`)
for genuine network-failure negative tests. `{word}` is the HTTP method.
`path` (and every table `VALUE` cell) goes through embedded
`<...>`-substitution against captured values (see below) before the
request is built — this is a no-op on a string with no `<...>` in it, so
it's applied uniformly, not opt-in.

`TYPE` rows in the request table:
| `TYPE` | Meaning |
|---|---|
| `HEADER` | a request header |
| `QUERY` | a query-string parameter |
| `FIELD` | one field of a JSON body - assembled into an object, kept field-by-field like every other table here, never a raw-JSON blob in one cell |
| `BODY` | escape hatch - the whole cell is a literal JSON string, for a body too nested for flat `FIELD` rows |
| `FORM` | a plain multipart text field |
| `FILE` | a real file upload - `VALUE` is a path to a real fixture under `features/fixtures/`, uploaded under its own basename |

`BODY`/`FIELD` rows/`FORM`+`FILE` rows are three mutually exclusive ways
to build one request body — mixing more than one throws. A `FormData`
body (any `FORM`/`FILE` row present) deliberately gets **no** explicit
`Content-Type` header — `fetch()` sets the correct
`multipart/form-data; boundary=...` value itself; setting it manually
omits the boundary and breaks parsing server-side.

## Asserting on the response

Purpose-built `Then`s in `http.step.ts`, not an overload of "the command
exited with `{int}`" (which would read misleadingly for an HTTP status):
```gherkin
Then the response status is {int}
Then the response status is {int}:      # + SOURCE|CONDITION|VALUE rows, SOURCE currently only BODY
Then the response headers has:          # KEY|CONDITION|VALUE - KEYs must be lowercase (fetch() Headers normalizes to lowercase)
Then the response body equals the real bytes of {string}   # byte-exact vs. a real fixture file
```
The response is *also* written into `World.lastCommandResult`
(`EXIT_CODE` = status, `STDOUT` = body-as-UTF8-text) purely so the
existing, unmodified `the command result data has:` step keeps working
for JSON body assertions (JSON is valid YAML, round-trips through
`yaml.load` + JMESPath with zero new code). **Compare a JSON boolean's
lowercase string form** (`true`/`false`) in these tables — the
`True`/`False` convention is for `OPTION|VALUE` CLI flags only, a
different table with a different convention. This exact mix-up has
already caused one real failure.

`bodyBytes: Buffer` on `HttpResponse` is captured once via
`Buffer.from(await res.arrayBuffer())`, with both `body` (UTF-8 decode)
and `bodyBytes` derived from the same read — needed because `res.text()`
alone is lossy for arbitrary binary content and can't prove a download
is byte-identical to what was uploaded.

## Capturing a dynamic value (a server-generated id) for later use

```gherkin
Given the value at "id" from the last response is known as "<NoteId>"
```
`support/http/capture.ts`'s `captureValueFromResponse` (JMESPath against
the last JSON body) + `substituteCapturedValues` (embedded `<...>` scan,
scoped *only* to `World.capturedValues`, not merged with the whole-cell
`resolveAlias` system). **This substitution does not run inside
`KEY|CONDITION|VALUE` assertion tables** — only inside the HTTP request
table. `| id | equals | <NoteId> |` as an assertion compares against the
literal string `"<NoteId>"` and can never pass; this has already caused
one real, confusing failure. If you need to prove a fetched value
matches something captured earlier, assert other real fields instead, or
skip the check if a successful fetch by that id already proves it.

## Verifying a real upload/download round trip

Never assert a download's content against a hardcoded expected string —
use `the response body equals the real bytes of "features/fixtures/<file>"`
against a real fixture checked into the repo, so the test proves the
real bytes round-tripped, not that they match something typed by hand.
