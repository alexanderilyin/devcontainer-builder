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
Helm is the first domain it's been built out against; the same
define-then-act, alias-reference, and table conventions below are meant
to extend to real `kubectl`-driven checks (Deployment/Pod/Service status,
readiness, events) as that need comes up.

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
  helm/            .feature files exercising real `helm chart`/`helm repo` behavior
  aliases/         .feature files validating the alias object types themselves
  step_definitions/
  support/
    aliases/       Directory, File, URL, OCIArtifact + the alias-resolution machinery
    helm/          HelmChart, HelmRepo, and real chart-fetching logic
    (top level)    generic infra: assertions, command running, JMESPath querying, World
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
Then the Helm Repo command exited with 0
```

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

Four different header vocabularies, each for a different purpose - don't
mix them up:

| Headers | Used by | Purpose |
|---|---|---|
| `PROPERTY \| VALUE` | `Given <Type> known as "<Alias>":` | Fields to construct an object from |
| `OPTION \| VALUE` | `When I <verb> ... with:` | CLI flags to build a command's argv. Blank `OPTION` = positional arg. `VALUE` of `True`/`False` = boolean flag (present with no value, or omitted entirely) |
| `KEY \| CONDITION \| VALUE` | `... has:` / `... result data has:` | Assertions against parsed structured data (Chart.yaml, `helm repo list -o yaml`, ...) |
| `SOURCE \| CONDITION \| VALUE` | `the Helm Repo command exited with {int}:` | Assertions against a command's raw `STDOUT`/`STDERR` text |

## `KEY` values are JMESPath

`KEY \| CONDITION \| VALUE` tables resolve `KEY` with
[JMESPath](https://jmespath.org/) (`support/query.ts`) against the parsed
data - a flat key (`apiVersion`) is a normal field lookup, but you can also
project across an array: `[*].name` means "every element's `name`". When
`KEY` resolves to an array, the condition is existential by default (passes
if *any* element matches) except `not_equals`, which is universal (passes
only if *no* element matches - the natural reading of a negated
condition).

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
- Every scenario that mutates real local `helm` state (repo add/remove)
  does so idempotently and self-contained, so the whole suite can be run
  repeatedly without manual cleanup.
