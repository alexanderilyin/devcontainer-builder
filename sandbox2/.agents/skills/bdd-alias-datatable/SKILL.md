---
name: bdd-alias-datatable
description: The core "define, then act" + typed Alias objects + DataTable methodology used throughout sandbox2's .feature files - how to write and read a scenario, the 6 table header vocabularies, JMESPath KEY queries, the generic Then steps, and the dynamic-value-capture/embedded-substitution mechanism. Use when writing or reviewing ANY .feature file in sandbox2, or designing a new alias type or table shape.
---

# The sandbox2 Alias/DataTable pattern

This is how every `.feature` file in sandbox2 is written. It is not
generic Cucumber advice — it is this specific project's convention,
evolved over many rounds of review. Follow it exactly; don't improvise a
new shape when an existing one already fits.

## Define, then act

Every real object gets a name (an "Alias") via a pure `Given <Type>
known as "<Alias>":` step — construction and validation only, never a
mutating command. Anything that actually runs a real command is a
separate, explicit `When` step that references the alias by name:

```gherkin
Given Directory known as "<NginxChartDirectory>":
  | PROPERTY | VALUE          |
  | path     | ./charts/nginx |
And Helm Chart known as "<NginxHelmChart>":
  | PROPERTY | VALUE                 |
  | chart    | <NginxChartDirectory> |
And Release known as "<NginxRelease>":
  | PROPERTY  | VALUE                 |
  | chart     | <NginxHelmChart>      |
  | name      | sandbox-nginx-release |
  | namespace | sandbox2-helm-test    |
When I upgrade Release known as "<NginxRelease>" with:
  | OPTION             | VALUE |
  | --install          | True  |
  | --atomic            | True  |
  | --create-namespace  | True  |
Then the command exited with 0
```

A table cell written as `<SomeAlias>` (starts with `<`, ends with `>`)
is real substitution against a previously-registered alias, resolved by
`support/aliases/resolve_alias.ts` — not a Cucumber naming convention.
Referencing an alias that was never defined fails loudly (`No Alias
registered as "<Alias>"`), it does not silently treat the literal string
as a value.

**Every alias type is one `Map<string, T>` field on `World`**
(`features/support/world.ts`), keyed by the literal alias string
*including* the `<...>` brackets. A new alias type = one new file under
`support/<domain>/`, one new `Map` field on `World`, and a `Given`/
`When I attempt to define ...` pair in the matching `step_definitions/*.step.ts`
file, following an existing type's shape (`Directory`,
`HelmChart`, `Release` are good templates, roughly in increasing order
of how special their resolution is).

## Two kinds of alias resolution

Most types resolve to a plain **string** (a path, URL, ref) via the
shared `resolveAlias()`. A few resolve to the real **object** instead,
because a string would have already lost structure the type needs later:
`Release.chart` needs the actual `HelmChart` (its real CLI args depend
on `chart.kind`), `RestEndpoint.service` needs the actual `Service` (its
base URL needs the object's real `.name`/`.namespace`). These use a
bespoke `(alias) => T | undefined` resolver passed into the type's own
`xFromTable()` function, not the shared `resolveAlias`. Don't invent a
third resolution mechanism — every new type fits one of these two.

## The 6 DataTable header vocabularies

Don't mix these up, and don't invent a 7th without a real, concrete need
(each of the 6 that already exist was added because an existing one
genuinely didn't fit, not for variety):

| Headers | Used by | Purpose |
|---|---|---|
| `PROPERTY \| VALUE` | `Given <Type> known as "<Alias>":` | Fields to construct an object from |
| `OPTION \| VALUE` | `When I <verb> ... with:` | CLI flags → argv. Blank `OPTION` = positional. `VALUE` of `True`/`False` = boolean flag present/absent |
| `KEY \| CONDITION \| VALUE` | `... has:` / `... result data has:` | Assertions against parsed structured data (JMESPath `KEY`) |
| `SOURCE \| CONDITION \| VALUE` | `the command exited with {int}:` | Assertions against raw `STDOUT`/`STDERR` text |
| `KEY/SOURCE \| CONDITION \| VALUE \| OUTCOME` | `When I poll ... until:` | Same condition-checking, plus polarity: `pass` (must hold to succeed) or `fail` (holding means stop and fail immediately) |
| `TYPE \| KEY \| VALUE` | `When I send a {word} request ... with:` | Builds a real HTTP request (`HEADER`/`QUERY`/`FIELD`/`BODY`/`FORM`/`FILE`) |

`OPTION|VALUE`'s `True`/`False` convention is **only** for CLI boolean
flags via `buildArgs()` — do not use capitalized `True`/`False` in a
`KEY|CONDITION|VALUE` table comparing against a real JSON boolean; JSON
`true` stringifies lowercase, and `assertCondition` does plain string
comparison. This exact mistake has already caused one real, confusing
test failure — don't repeat it.

## JMESPath `KEY` queries

`KEY|CONDITION|VALUE` tables resolve `KEY` via
[JMESPath](https://jmespath.org/) (`support/query.ts`) against the
parsed body (`yaml.load` on the raw text — JSON is valid YAML, so this
works unmodified for both `helm ... -o yaml` output and HTTP JSON
response bodies). A flat key (`apiVersion`) is a normal lookup; `[*].name`
projects across an array. A quoted identifier
(`metadata.labels."app.kubernetes.io/version"`) accesses a literal key
containing characters JMESPath's bare-identifier syntax doesn't allow
(dots, slashes). When `KEY` resolves to an array, the condition is
existential by default (passes if *any* element matches) except
`not_equals`, which is universal (passes only if *no* element matches).

## Conditions

`equals`, `contains`, `icontains` (case-insensitive), `undefined` (field
genuinely absent, not falsy), `not_equals`. All implemented once in
`support/assert_condition.ts`, exported both as a throwing
`assertCondition` (used by every one-shot `Then`) and a boolean
`conditionHolds` (used by the polling mechanism) — one implementation of
"does this hold," not two. Extend this file, don't duplicate its logic,
if a new condition is ever genuinely needed.

## Generic `Then` steps — reuse these, don't write new ones for a new domain

`step_definitions/common.step.ts` holds the type-agnostic assertions
(`the command exited with {int}[:]`, `the command result data has:`,
`it should have failed with {string}`/`with either:`) — they only ever
read `World.lastCommandResult`/`World.lastError`, so **every** domain
(helm, kubectl, HTTP) reuses them unchanged by populating those two
fields, rather than each domain inventing its own status/body assertion.
The one time a domain added its own `Then`s instead
(`the response status is {int}[:]`, `the response headers has:` in
`http.step.ts`) was because reusing "the command exited with" would have
read misleadingly for an HTTP status code — a deliberate, narrow,
explicitly-justified exception, not the default move. Prefer reuse;
justify explicitly in a comment when you don't.

## Dynamic values: capturing a response value, then using it later

Most alias data is either literal (from a table) or a live read (a
`kubectl get`) — known *before* the first real command of a scenario
runs. A server-generated id (a created resource's real `id`) is only
known *after* a response comes back. `support/http/capture.ts` handles
this:

```gherkin
When I send a POST request to RestEndpoint known as "<Api>" path "/notes/" with:
  | TYPE  | KEY   | VALUE |
  | FIELD | title | Hi    |
Given the value at "id" from the last response is known as "<NoteId>"
When I send a GET request to RestEndpoint known as "<Api>" path "/notes/<NoteId>"
```

`<NoteId>` here is resolved by `substituteCapturedValues` — a *different*,
narrower mechanism than `resolveAlias`, scanning for `<...>` occurrences
**embedded** anywhere in a string (a path, a header value like `Bearer
<Token>`), not just when the whole cell is exactly one alias reference.
It only resolves against `World.capturedValues`, deliberately not merged
with the whole-cell `resolveAlias` system — mixing two "what does `<X>`
mean" systems under one syntax would be genuinely ambiguous. **This
substitution does not apply inside `KEY|CONDITION|VALUE` assertion
tables** — only inside the HTTP request table (`sendHttpRequest`'s own
argument processing). Writing `| id | equals | <NoteId> |` as an
assertion compares against the *literal string* `"<NoteId>"` and will
never pass — this has already caused one real, confusing test failure.
If you need to prove a fetched value matches something captured earlier,
assert other real fields instead (title/body/etc.), or don't add the
check at all if it's redundant with what a successful fetch by that id
already proves.

## Writing a new scenario: checklist

1. Does an existing alias type already cover what you need? Reuse it.
2. Preamble is self-contained — redeclare `Directory`/`HelmChart`/
   `Release`/etc. fresh in every scenario, never rely on state from
   another scenario or file.
3. Every table cell is a real field or a real alias reference — never a
   hardcoded value the real system actually computes (an id, a hash, a
   generated name) when you could capture or query it instead.
4. End cluster-touching scenarios with the real cleanup step
   (`uninstall`), even ones that fail partway — check
   `kubectl get all -n sandbox2-helm-test` / `helm list` after a run,
   not just the exit code.
5. Run it for real before considering it done. Run the whole suite twice
   in a row before considering *cluster-touching* work done — idempotency
   is proven, not assumed.
