# sandbox2

A real (no mocks) BDD harness for Helm, built with `@cucumber/cucumber` +
TypeScript. Every step shells out to the real `helm`/`tar` binaries and
hits real (small, public) chart repositories - nothing here is stubbed.

## Purpose

This isn't just a Helm-chart test suite - it's a reusable pattern for
developing and functionally testing k8s-native applications: real
commands (never mocked), typed objects with real validation, and a small,
consistent table/assertion vocabulary, all in service of keeping
scenarios readable by a human who wasn't there when they were written.
Helm was the first domain this was built out against; the same
define-then-act, alias-reference, and table conventions now extend to
real `kubectl`-driven checks (`Deployment`/`Service`/`Pod` status, events,
logs - see `step_definitions/kubernetes.step.ts`) and to real HTTP
requests against a deployed app's own endpoints (see
`step_definitions/http.step.ts` and `charts/rest-api/`).

## Running

```bash
npm install
npm test              # full suite
npm run test:ff       # stop at the first failure
npm run test:verbose  # full step/table detail even for passing scenarios
npm run test:usage    # per-step-definition duration, slowest first
npm run test:junit    # per-scenario duration, written to report.xml
```

## Layout

```
features/
  helm/            .feature files exercising real `helm` behavior (chart, repo, directory, release)
  k8s/             .feature files exercising real `kubectl` behavior (Deployment/Service/Pod discovery, polling)
  rest/            .feature files exercising a real deployed app's own HTTP endpoints
  fixtures/        real files used by upload/download scenarios (e.g. features/rest/files.feature)
  aliases/         .feature files validating the alias object types themselves
  step_definitions/
    common.step.ts      the type-agnostic Then steps, shared by every object type
    directory.step.ts   Directory-scoped verbs: index, lint, package, dependency
    helm.step.ts         HelmChart-scoped: define/has:, template, show
    helm-repo.step.ts    HelmRepo-scoped: add, remove, update, list
    release.step.ts      Release-scoped: install, upgrade, uninstall, rollback,
                          status, history, test, get, list
    kubernetes.step.ts   Deployment/Service/Pod-scoped: define (real discovery),
                          get, get events, get logs, and (Pod only) poll,
                          poll logs, poll events
    http.step.ts         RestEndpoint-scoped: define, send a request, and the
                          response status/headers assertions
  support/
    aliases/       Directory, File, URL, OCIArtifact + the alias-resolution machinery
    helm/          HelmChart, HelmRepo, Release, chart_ref_args, and real chart-fetching logic
    k8s/           Deployment, Service, Pod, and the shared label-selector discovery logic
    http/          RestEndpoint, the real fetch()-based request/response logic,
                   and dynamic-value capture (capture.ts)
    (top level)    generic infra: assertions, command running, JMESPath querying,
                    polling (poll.ts), World
```

## The core pattern: define, then act

Every object (`HelmChart`, `HelmRepo`, `Directory`, `File`, `URL`,
`OCIArtifact`) is built by a pure `Given <Type> known as "<Alias>":` step -
construction only, no side effects (no real `helm` command runs just from
defining something). Anything that actually *does* something is a
separate, explicit `When` step referencing the alias:

```gherkin
Given Helm Repo known as "<BitnamiHelmRepo>":
  | PROPERTY | VALUE                              |
  | name     | bitnami                            |
  | url      | https://charts.bitnami.com/bitnami |
When I add Helm Repo known as "<BitnamiHelmRepo>" with:
  | OPTION | VALUE |
Then the command exited with 0
```

`HelmChart`/`HelmRepo`/`Directory`/`File`/`URL`/`OCIArtifact` all resolve
their alias fields to a **string** (a path, a URL, a ref). `Release` is
the one exception: its `chart` field resolves to the actual `HelmChart`
**object**, not a string - a chart's real CLI representation depends on
its `chart.kind` (local path vs URL vs OCI vs reference+repo), so
`Release` needs the object itself to build the right command later. It
uses a separate `(alias) => HelmChart | undefined` resolver
(`releaseFromTable` in `support/helm/release.ts`), not the shared
string-only `resolveAlias`.

`Deployment`/`Service`/`Pod` are a different kind of exception: unlike
every other type, their `Given` step performs a real `kubectl get`
(against a `namespace` field plus an open-ended set of label `PROPERTY`
rows - there is no closed `KNOWN_FIELDS` list to validate label keys
against, since a real chart's label set can't be enumerated in advance).
That's still "define, then act", not a departure from it: `Directory`'s
`Given` already does a real check at construction time (`fs.existsSync`)
- it's real, but read-only, never mutating. `kubectl get` is the
identical kind of real-but-read-only check, just against the cluster
instead of the filesystem, so it belongs in `Given` for the same reason.

`RestEndpoint` is a second case of the same `Release.chart` exception:
its `service` field resolves to the real `Service` **object**, not a
string, because its base URL needs that Service's real `.name`/
`.namespace` (already known-real via the `k8s/discover.ts` label-selector
mechanism). Unlike `Deployment`/`Service`/`Pod`, `RestEndpoint`'s `Given`
stays pure construction with no live check - there's no cheap read-only
analog to "is this URL reachable" the way `fs.existsSync` is cheap for a
path, so the first real validation is the paired `When I send a ...
request ...`, same as `Release`.

## `<Alias>` substitution

A table cell written as `<SomeAlias>` (starts with `<`, ends with `>`) gets
resolved against whatever was previously registered under that name,
instead of being read as a literal string - e.g. a `HelmChart`'s `chart`
field can be a `<DirectoryAlias>`/`<FileAlias>`/`<UrlAlias>`/
`<OciArtifactAlias>` instead of a raw path. This is real substitution
(`support/aliases/resolve_alias.ts`), not a naming convention Cucumber
does for you - referencing an alias that was never defined fails with `No
Alias registered as "<Alias>"`.

## Table shapes

Six different header vocabularies, each for a different purpose - don't
mix them up:

| Headers | Used by | Purpose |
|---|---|---|
| `PROPERTY \| VALUE` | `Given <Type> known as "<Alias>":` | Fields to construct an object from |
| `OPTION \| VALUE` | `When I <verb> ... with:` | CLI flags to build a command's argv. Blank `OPTION` = positional arg. `VALUE` of `True`/`False` = boolean flag (present with no value, or omitted entirely) |
| `KEY \| CONDITION \| VALUE` | `... has:` / `... result data has:` | Assertions against parsed structured data (Chart.yaml, `helm repo list -o yaml`, ...) |
| `SOURCE \| CONDITION \| VALUE` | `the command exited with {int}:` | Assertions against a command's raw `STDOUT`/`STDERR` text |
| `KEY\|SOURCE \| CONDITION \| VALUE \| OUTCOME` | `When I poll ... until:` | Same condition-checking as the two rows above, plus a polarity: `OUTCOME` is `pass` (this must hold to succeed) or `fail` (this holding means stop and fail immediately) - see "Polling" below |
| `TYPE \| KEY \| VALUE` | `When I send a {word} request to RestEndpoint ... with:` | Builds a real HTTP request - see "HTTP requests" below |

`the command exited with {int}[:]`, `the command result data has:`, and
`it should have failed with {string}`/`with either:`
(`step_definitions/common.step.ts`) are type-agnostic - they only ever
read `World.lastCommandResult`/`World.lastError`, so every `When` step
across every object type reuses the same `Then`s. Some subcommands'
output genuinely isn't YAML (`helm show readme` is markdown, `helm get
all` has no `-o` flag at all) - those scenarios use the raw-text form,
not `result data has:`. `it should have failed with either:` takes a
single-column `| MESSAGE |` table and passes if the real error message
includes *any* one of the listed candidates - for a failure that can
genuinely land on more than one real message (see "Polling" below).

## `KEY` values are JMESPath

`KEY \| CONDITION \| VALUE` tables resolve `KEY` with
[JMESPath](https://jmespath.org/) (`support/query.ts`) against the parsed
data - a flat key (`apiVersion`) is a normal field lookup, but you can also
project across an array: `[*].name` means "every element's `name`". When
`KEY` resolves to an array, the condition is existential by default (passes
if *any* element matches) except `not_equals`, which is universal (passes
only if *no* element matches - the natural reading of a negated
condition).

## Polling for eventually-consistent state

`Deployment`/`Service` scenarios discover already-stable objects - the
preceding `Release` install used `--atomic`, which blocks until the
rollout is healthy before `helm upgrade` even returns - so a plain
one-shot `When I get ... with:` is safe. A `Pod` has no such guarantee:
it can be `Pending`/`ContainerCreating` for a real, variable amount of
time, and if something is actually wrong (bad image, crash loop), a
fixed single check either fires too early (false negative) or - if
delayed - wastes time before reporting something a human then has to go
investigate. `kubernetes.step.ts`'s `When I poll Pod known as {string}
every {string} for up to {string} until:` (and the `poll logs for
Pod`/`poll events for Pod` siblings) re-run a real `kubectl` command
every interval (`support/poll.ts`'s `pollUntil` - never re-checks stale
data) until either every `pass`-outcome row holds (success), any
`fail`-outcome row holds (immediate failure - no need to exhaust the
timeout on a state that's already terminal-bad), or the timeout elapses
(failure, with the last real observed state in the message). `"3s"`/
`"2m"`-style duration strings are parsed by `parseDuration` (`ms`/`s`/`m`
suffixes). Because which real bad state a poll happens to observe first
can genuinely vary run to run (e.g. a bad image is caught as
`ErrImagePull` on one tick and Kubernetes's own `ImagePullBackOff` on the
next), the paired assertion is usually `Then it should have failed with
either:` (see above), not the single-message form. `attempt()`
(`support/attempt.ts`) is async-aware specifically so `When I attempt to
poll ...` can wrap a poll the same way every other type's `attempt to
define ...` wraps a one-shot constructor failure.

## HTTP requests

`RestEndpoint`'s base URL is a real in-cluster Service DNS name
(`<service>.<namespace>.svc.cluster.local:<port>`) - the Cucumber process
itself has direct network/DNS routing to it (no `kubectl port-forward`
needed), so `When I send a {word} request to RestEndpoint known as
{string} path {string}` (`support/http/http_request.ts`) makes a real
`fetch()` call. A `with:` variant takes a `TYPE|KEY|VALUE` table for a
request with headers/query/body; the bare form (no `with:`, no table) is
for the common case of a request with none of those. Table rows:

| `TYPE` | Meaning |
|---|---|
| `HEADER` | a request header |
| `QUERY` | a query-string parameter |
| `FIELD` | one field of a JSON body - assembled into an object by the step, kept field-by-field like every other table here rather than one row holding a raw JSON blob |
| `BODY` | escape hatch - the whole cell is a literal JSON string, for a body too nested for flat `FIELD` rows |
| `FORM` | a plain multipart text field |
| `FILE` | a real file upload - `VALUE` is a path to a real fixture (typically under `features/fixtures/`), read from disk and uploaded under its own basename |

`BODY`/`FIELD` rows/`FORM`+`FILE` rows are three mutually exclusive ways
to build one request body - a table combining more than one is rejected.
A `FormData` body (any `FORM`/`FILE` row) deliberately gets no explicit
`Content-Type` - `fetch()` sets the correct `multipart/form-data;
boundary=...` value itself. `redirect: 'manual'` is set deliberately, so
a real 3xx is directly observable as a status + `Location` header rather
than silently auto-followed. Every `path` and table `VALUE` also goes
through captured-value substitution (see below) before the request is
built.

The response is asserted with purpose-built `Then`s
(`step_definitions/http.step.ts`) rather than overloading `the command
exited with {int}`, which would read misleadingly for an HTTP call:
`the response status is {int}[:]` (the `:` form takes `SOURCE|CONDITION|
VALUE` rows, `SOURCE` currently only `BODY`), `the response headers
has:` (`KEY|CONDITION|VALUE` against the response headers - `KEY`s must
be written lowercase, since `fetch()`'s `Headers` normalizes to
lowercase), and `the response body equals the real bytes of {string}`
(byte-exact comparison against a real file on disk - never hardcode a
download's expected content as a string when you can compare against
the real fixture that produced it). The response is *also* written into
`World.lastCommandResult` (`EXIT_CODE` = status, `STDOUT` = body as
UTF-8 text) purely so the existing, unmodified `the command result data
has:` step keeps working for JSON body assertions - a JSON body is valid
YAML, so it round-trips through `yaml.load` + JMESPath with zero new
code. This dual-bookkeeping means a `KEY|CONDITION|VALUE` row asserting
a JSON boolean must compare against the lowercase JSON string form
(`true`/`false`), not the `True`/`False` convention `OPTION|VALUE`
tables use for CLI boolean flags - a different table, a different
convention, easy to conflate. For binary safety (proving a download is
byte-identical to what was uploaded, not just loosely similar text),
`HttpResponse` also carries `bodyBytes: Buffer`, captured once via
`res.arrayBuffer()` and derived into both forms - `res.text()` alone is
lossy for arbitrary binary content.

## Dynamic value capture

Most alias data is knowable before the first real command runs (literal
table data, or a live `kubectl get`). A server-generated value - a
created resource's real `id` - is only known *after* a response comes
back:
```gherkin
When I send a POST request to RestEndpoint known as "<Api>" path "/notes/" with:
  | TYPE  | KEY   | VALUE |
  | FIELD | title | Hi    |
Given the value at "id" from the last response is known as "<NoteId>"
When I send a GET request to RestEndpoint known as "<Api>" path "/notes/<NoteId>"
```
`support/http/capture.ts`'s `captureValueFromResponse` (JMESPath against
the last JSON body, reusing `support/query.ts` unchanged) stores the
value in `World.capturedValues`; `substituteCapturedValues` resolves
`<NoteId>` **embedded** anywhere in a string (a path, or a header value
like `Bearer <Token>`) - not just when the whole cell is one alias
reference, the way `resolveAlias` requires. This is a deliberately
separate, narrower system from `resolveAlias` - scoped only to
`World.capturedValues`, not merged with the whole-cell Directory/File/
URL/OCIArtifact resolution, since mixing two "what does `<X>` mean"
systems under one syntax would be genuinely ambiguous. **It does not run
inside `KEY|CONDITION|VALUE` assertion tables** - only inside the HTTP
request table. Writing `| id | equals | <NoteId> |` as an assertion
compares against the literal string `"<NoteId>"` and can never pass; if
you need to prove a fetched value matches something captured earlier,
assert other real fields instead of the id itself.

## Conditions

`equals`, `contains`, `icontains` (case-insensitive `contains`),
`undefined` (field is genuinely absent, not just falsy), `not_equals`
(only really useful against an array - "this value isn't in the list").

## Real-command discipline

- No mocks: `helm pull`/`helm repo add`/`helm package`/etc. are all real
  invocations against real (small, public) repositories.
- `helm pull` results are cached locally (`.cache/helm-pulls/`, gitignored)
  keyed by the exact pull args, since `helm pull` itself has no cache -
  incremental runs skip the network entirely once a ref's been pulled once.
- `charts/nginx-0.1.0.tgz` is regenerated fresh from `charts/nginx/` before
  every run (`support/hooks.ts`, a `BeforeAll` hook) so it can never drift
  from its source.
- `charts/test-dependency/` is a second fixture chart, existing solely to
  declare a real dependency (on the same small `metrics-server` repo used
  elsewhere) for exercising `helm dependency build/list/update` - its
  `Chart.lock` and downloaded `charts/` subdirectory are real, regenerated
  artifacts (gitignored), not something to hand-edit.
- Every scenario that mutates real local `helm` state (repo add/remove) or
  real cluster state (`Release` install/uninstall) does so idempotently
  and self-contained, so the whole suite can be run repeatedly without
  manual cleanup - confirmed by actually running it twice in a row and
  checking `helm list` comes back empty afterward, not just assumed.
- `Release` scenarios deploy into a dedicated `sandbox2-helm-test`
  namespace, not whatever namespace your kubeconfig defaults to, to avoid
  mixing disposable test releases into real infrastructure. `Deployment`/
  `Service`/`Pod` discovery targets that same namespace (passed
  explicitly as a `PROPERTY` row, not inferred).
- `charts/nginx`'s labels (`_helpers.tpl`'s `nginx.labels`) cover every
  "recommended" label from Helm's own chart best-practices guide
  (https://helm.sh/docs/chart_best_practices/labels/) -
  `app.kubernetes.io/name`/`instance`/`managed-by`/`version` and
  `helm.sh/chart`. The two "optional" labels
  (`app.kubernetes.io/component`/`part-of`) are deliberately not added -
  they describe a multi-component/multi-chart application, and nginx here
  is a single standalone chart, so they'd be meaningless placeholder
  values, not real ones. `app.kubernetes.io/version` must be rendered
  with `| quote` (`{{ .Chart.AppVersion | quote }}`) - unquoted, Helm
  renders the bare value `1.27` into the labels YAML block, where YAML
  parses it as a float instead of a string, and `helm upgrade` then fails
  outright (`json: cannot unmarshal number into ... labels of type
  string`) - a real bug this chart hit once, not a hypothetical one.
- Literal `helm install` is genuinely not idempotent (a second install of
  the same name errors) - that's real Helm behavior worth testing
  directly, not something to design around. The rerun-safe idiom is
  `helm upgrade` with `--install`/`--atomic` set (plain `OPTION | VALUE`
  rows, same `True`/`False` convention as everywhere else).
- `charts/rest-api` has no custom-built container image - its real
  Python source is mounted from a ConfigMap (`.Files.Glob` + `AsConfig`)
  onto a stock `python:3.12-slim`, with `pip install ... && exec
  uvicorn ...` run for real at every pod startup. Deliberate tradeoff:
  avoids needing a custom-image build/push pipeline, at the cost of
  slower pod startup and no build-time dependency pinning beyond the
  chart's own `values.yaml` (`pipVersions`). A `checksum/app-config`
  pod-template annotation forces a real rollout whenever the source
  changes, since Kubernetes does not restart a pod just because a
  referenced ConfigMap's data changed - confirmed for real (a no-op
  `helm upgrade` left the same pod name; a real source edit produced a
  new one), for both "existing file's content changed" and "a new file
  was added" (both change what the glob-and-hash render, identically).
  `/files/*` uploads real bytes to a second, writable `emptyDir` volume
  (`/data`), distinct from the read-only ConfigMap-mounted `/app` the
  source itself lives in; file uploads require `python-multipart`
  installed (a real FastAPI requirement, not optional) alongside
  `fastapi`/`uvicorn` in the same pip-install line.
- cucumber-js's own default step timeout (5000ms) is shorter than a
  legitimate real poll used in this suite (up to 2m for the bad-image
  fast-fail scenario) - `support/hooks.ts` raises it globally
  (`setDefaultTimeout`) well past the longest real poll timeout anywhere
  in the suite. This was a real latent bug from the moment polling was
  introduced: every poll happened to resolve on its very first tick
  (Deployment/Service already stable via `--atomic` before discovery
  runs) until the rest-api readiness-flip scenario - the first one that
  genuinely needs several real seconds of waiting - hit it for real.
