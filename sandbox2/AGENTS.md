# AGENTS.md — sandbox2

Canonical reference for any agent (Claude Code, Codex, or otherwise)
working in `sandbox2/`. Read this before touching anything here. Deep
dives per domain live in `.agents/skills/` — this file is the map, the
skills are the territory.

## What this is

A real (no-mocks) BDD test harness for Helm charts, kubectl-discovered
k8s resources, and a real deployed app's own HTTP endpoints, built with
`@cucumber/cucumber` + TypeScript. Every step shells out to a real
binary (`helm`, `kubectl`) or makes a real `fetch()` call — nothing here
is stubbed, and every non-obvious design decision in this codebase was
verified by actually running something, not assumed. See `README.md`'s
"Purpose" section for the full framing: this is a *reusable pattern* for
developing/testing k8s-native applications, not just a Helm-chart test
suite.

**Read `README.md` in full before making any change.** It is the
authoritative, up-to-date spec of every convention below — this file is
an orientation map onto it, not a replacement for it. If this file and
`README.md` ever disagree, `README.md` wins; fix this file to match.

## Running it

```bash
cd sandbox2
npm install
npm test              # full suite
npm run test:ff       # stop at first failure
npm run test:verbose  # full step/table detail even for passing scenarios
npm run test:usage    # per-step-definition duration, slowest first
```

Requires a real, reachable k8s cluster (`kubectl`/`helm` configured
against it) — there is no offline/mocked mode. Cluster-touching
scenarios deploy into a dedicated `sandbox2-helm-test` namespace.

## The core pattern: define, then act

Every object is built by a pure `Given <Type> known as "<Alias>":`
step — construction only. Anything that runs a real command is a
separate `When` step referencing the alias:

```gherkin
Given Helm Repo known as "<BitnamiHelmRepo>":
  | PROPERTY | VALUE                              |
  | name     | bitnami                            |
  | url      | https://charts.bitnami.com/bitnami |
When I add Helm Repo known as "<BitnamiHelmRepo>" with:
  | OPTION | VALUE |
Then the command exited with 0
```

Every alias type is a `Map<string, T>` field on `World`
(`features/support/world.ts`) keyed by the literal alias string
(including the `<...>` brackets — `world.charts.get('<NginxHelmChart>')`,
not a stripped `NginxHelmChart`).

**Named exceptions to "pure construction"** (all deliberate, all
documented in `README.md`, don't add another one without naming it the
same way):
- `Release.chart`, `RestEndpoint.service` — resolve to the real object
  (`HelmChart`, `Service`), not a string, because their real CLI/URL
  representation depends on structure a plain string would have already
  lost.
- `Deployment`/`Service`/`Pod`'s `Given` performs a real, read-only
  `kubectl get` — justified as the same category as `Directory`'s real
  `fs.existsSync` check, not a new kind of exception.
- `RestEndpoint`'s `Given` stays pure (no live check) — there's no cheap
  read-only analog to "is this URL reachable," so the first real
  validation is the paired `When`.

For the full alias/DataTable methodology (all 6 table vocabularies,
JMESPath `KEY` queries, the capture/embedded-substitution mechanism,
generic `Then` reuse) see **`.agents/skills/bdd-alias-datatable/`** —
this is the single most important skill in this directory, read it
before writing any new `.feature` file.

## Layout

```
features/
  helm/    real `helm` behavior (chart, repo, directory, release)
  k8s/     real `kubectl` behavior (Deployment/Service/Pod discovery, polling)
  rest/    real HTTP behavior against the rest-api fixture app
  aliases/ alias-construction validation (the negative-path "Given ... has no field X" tests)
  fixtures/  real files used by upload/download scenarios (features/rest/files.feature)
  step_definitions/  one file per domain (directory/helm/helm-repo/release/kubernetes/http/common)
  support/
    aliases/  Directory, File, URL, OCIArtifact + resolve_alias.ts
    helm/     HelmChart, HelmRepo, Release, chart_ref_args, real chart-fetch logic
    k8s/      Deployment, Service, Pod + discover.ts (shared label-selector logic)
    http/     RestEndpoint, http_request.ts (real fetch()), capture.ts (dynamic values)
    (top level)  generic infra: assert_condition.ts, query.ts (JMESPath), run_command.ts,
                 poll.ts, attempt.ts, hooks.ts, world.ts
charts/
  nginx/         minimal off-the-shelf-image fixture (Deployment/Service/test-hook Pod)
  test-dependency/  exists solely to exercise `helm dependency build/list/update`
  rest-api/      real FastAPI test fixture — see .agents/skills/fastapi-test-fixture/
```

## Domain skills (read the relevant one before working in that area)

- **`.agents/skills/bdd-alias-datatable/`** — the core methodology. Read
  first, always.
- **`.agents/skills/helm-testing/`** — `Release`/`HelmChart`/`HelmRepo`,
  the `--atomic` rerun-safe idiom, real chart-source resolution.
- **`.agents/skills/kubectl-discovery-polling/`** — label-selector
  discovery, the polling mechanism (`pollUntil`, pass/fail-fast/timeout),
  and a real cucumber-js gotcha it exposed.
- **`.agents/skills/http-rest-testing/`** — `RestEndpoint`, the
  `TYPE|KEY|VALUE` request table, multipart uploads, dynamic-value
  capture.
- **`.agents/skills/fastapi-test-fixture/`** — how and why
  `charts/rest-api` is built the way it is (no custom image, health
  probes, in-memory/on-disk storage).

## Real-command discipline (non-negotiable, don't relax these)

- No mocks, ever. If a check can't be made real, don't add it — flag it
  instead.
- Every scenario that mutates real state (repo add/remove, Release
  install/uninstall) is self-contained and idempotent — full preamble
  redeclared per scenario, uninstalled at the end, no cross-scenario or
  cross-file shared state.
- Idempotency is *proven*, not assumed: run the suite twice in a row and
  check `kubectl get all -n sandbox2-helm-test` / `helm list` both come
  back empty afterward, every time you touch cluster-affecting code.
- Cluster-touching work goes in `sandbox2-helm-test`, never a shared or
  default namespace.
- Ground every non-trivial value (a log substring, an event reason, a
  field path) in real captured output before writing it into a `.feature`
  file. Never guess a value because it seems plausible.

## Known sharp edges (hit once each already, don't rediscover them)

- **cucumber-js's default step timeout is 5000ms**, far shorter than
  legitimate real polls this suite uses (up to 2 minutes) —
  `support/hooks.ts` raises it globally via `setDefaultTimeout`. If a
  new long-running step times out mysteriously, this is why; don't
  lower it, and don't add per-step overrides instead of understanding
  this.
- **A step function's declared arity matters to cucumber-js** — a
  shared function with an optional trailing `DataTable` param gets a
  function injected instead of `undefined` when no table is attached.
  Always register two distinctly-shaped functions (see
  `common.step.ts`'s `assertExitCodeOnly`/`assertExitCodeAndOutput`) —
  never one function with an optional last parameter.
- **Loop-generated step text is invisible to static tooling** (VS
  Code's Cucumber extension scans source text for literal `Given`/
  `When`/`Then` calls) — a `for (const verb of [...]) { When(\`...${verb}...\`, ...) }`
  loop works fine at runtime but shows every generated step as
  "undefined" in the editor. Prefer one step with a `{word}` Cucumber
  Expression parameter + runtime validation over a loop of literal-text
  registrations.
- **A Helm label value that looks like a number must be `| quote`d.**
  `app.kubernetes.io/version: {{ .Chart.AppVersion }}` renders the bare
  value into YAML, which parses `1.27` as a float, not a string, and
  `helm upgrade` fails outright decoding it into a `map[string]string`.
  Always `{{ .Chart.AppVersion | quote }}`.
- **A Service can't route to a Pod it has just excluded.** Once a Pod
  is confirmed NotReady, a request routed through its Service has no
  backend to reach — it fails to connect, it does not return the app's
  real error status. Don't write a scenario that expects otherwise;
  assert the readiness state directly (`kubectl`/Pod polling), not via
  a request that structurally can't arrive.
- **`attempt()` (`support/attempt.ts`) is async-aware** — every
  `attempt(this, () => ...)` call site must `return` it (not just call
  it), or cucumber-js won't wait for it to settle.

## Status

- **Phase 1** (health-probe endpoints, `RestEndpoint`/HTTP mechanism,
  `charts/rest-api` skeleton) — shipped, verified.
- **Phase 2** (`/files/*`, `/notes/*` CRUD, dynamic-value capture,
  multipart upload, binary-safe response bodies) — shipped, verified
  (66/66 scenarios, twice in a row, cluster confirmed clean both times).
- **Phase 3** (`/users/*` + 5 real auth methods — ApiKey/Basic/Bearer/
  self-hosted OAuth2/OIDC) — implemented and covered by real scenarios in
  `features/rest/users.feature` and `features/rest/auth.feature`; rerun the
  full suite twice before calling it verified. Full plan at
  `docs/claude/plans/0001-phase3-users-and-auth.md`. Two small,
  independent, not-yet-closed test-coverage gaps are tracked at
  `docs/claude/plans/0002-test-coverage-gaps.md`.
