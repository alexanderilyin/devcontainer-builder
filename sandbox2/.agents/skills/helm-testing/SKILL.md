---
name: helm-testing
description: sandbox2's Helm-domain conventions - Directory/HelmChart/HelmRepo/Release alias types, chart source resolution (chart_ref_args.ts), the real rerun-safe `helm upgrade --install --atomic` idiom vs. genuinely-non-idempotent `helm install`, and the fixture charts under sandbox2/charts/. Use when writing or debugging a features/helm/*.feature scenario, or a support/helm/*.ts file.
---

# Helm testing in sandbox2

Real `helm`/`tar` invocations against real (small, public) chart
repositories and a real cluster — see `.agents/skills/bdd-alias-datatable/`
first for the general Alias/DataTable pattern this extends.

## The four Helm alias types

- **`Directory`** (`support/aliases/directory.ts`) — a local path. Its
  `Given` does a real, read-only `fs.existsSync` check at construction —
  the precedent every later "real check in Given" exception cites.
- **`HelmChart`** (`support/helm/helm_chart.ts`) — a chart reference of
  one of several `kind`s (`local-directory`, `local-archive`, `url`,
  `oci`, `reference`+repo). `chartRefToArgs()` (`support/helm/chart_ref_args.ts`)
  is the *single* place that switches on `chart.kind` to build the right
  CLI argv fragment — reused by `template`, `show`, `install`/`upgrade`.
  Don't duplicate that switch anywhere else.
- **`HelmRepo`** (`support/helm/helm_repo.ts`) — `repo add`/`remove`/
  `update`/`list`.
- **`Release`** (`support/helm/release.ts`) — the one type whose `chart`
  field resolves to the real `HelmChart` object, not a string (see the
  bdd-alias-datatable skill's "two kinds of resolution" section).

## Real command shapes worth knowing before writing a new scenario

- `helm lint`/`helm package` only accept a **local path** — they take a
  `Directory`, never a `HelmChart` (which can also be a URL/OCI/registry
  reference that `lint`/`package` can't operate on).
- `helm show values`/`chart`/`crds` output YAML directly (parseable via
  the generic `result data has:` step). `helm show readme` is plain
  markdown and `helm get all` has no `-o` flag at all — both of those
  use the raw-text `the command exited with {int}:` form instead.
- `helm template [NAME] [CHART]` / `helm show <sub> [CHART]`: any
  table-supplied positional arg (a blank-`OPTION` row) must come
  *before* the chart args in argv, not after — confirmed by actually
  running it; the wrong order gets the chart's own path parsed as a
  stray extra arg.
- **Literal `helm install` is genuinely not idempotent** — a second
  install of the same release name errors ("cannot re-use a name that
  is still in use"). That's real, correct Helm behavior worth testing
  directly (see `release.feature`'s "Rejecting a duplicate install"),
  not something to design around. The rerun-safe idiom used everywhere
  else in this suite is `helm upgrade` with `--install`/`--atomic` set:
  ```gherkin
  When I upgrade Release known as "<MyRelease>" with:
    | OPTION             | VALUE |
    | --install          | True  |
    | --atomic            | True  |
    | --create-namespace  | True  |
  ```
  `--atomic` blocks until the rollout is healthy (or rolls back on
  failure) — this is *why* `Deployment`/`Service` discovery immediately
  after an `--atomic` upgrade never needs to poll (see
  `.agents/skills/kubectl-discovery-polling/`): by the time `helm
  upgrade` returns, they're already stable. Omit `--atomic` deliberately
  when a scenario specifically needs to observe an unhealthy in-between
  state (see `kubernetes.feature`'s bad-image fast-fail scenario, or
  `health.feature`'s readiness-flip scenario).

## Fixture charts (`sandbox2/charts/`)

- `nginx/` — minimal, off-the-shelf `nginx` image, zero custom logic.
  The default template for a new "just needs a Deployment+Service"
  fixture. Its label set covers every "recommended" label from Helm's
  own chart-best-practices guide — `app.kubernetes.io/version` **must**
  be rendered with `| quote`, see AGENTS.md's sharp-edges list.
- `test-dependency/` — exists *solely* to declare a real dependency (on
  a small public `metrics-server` repo) for exercising `helm dependency
  build/list/update`. Its `Chart.lock` and downloaded `charts/`
  subdirectory are real, regenerated, gitignored artifacts.
- `rest-api/` — a real FastAPI app; see `.agents/skills/fastapi-test-fixture/`
  for why it's built the way it is (no custom image).

`charts/nginx-0.1.0.tgz` is regenerated fresh from `charts/nginx/`
before every run (`support/hooks.ts`, a `BeforeAll` hook, real `helm
package`) so "Local Archive Chart" scenarios can never silently test
stale content.
