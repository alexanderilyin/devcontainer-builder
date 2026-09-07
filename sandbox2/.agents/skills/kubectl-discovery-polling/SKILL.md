---
name: kubectl-discovery-polling
description: sandbox2's kubectl domain - Deployment/Service/Pod discovery by real label selectors, the real-read-only-check-in-Given precedent, and the polling mechanism (pollUntil, pass/fail-fast/timeout OUTCOME semantics) for eventually-consistent state, including a real cucumber-js default-timeout gotcha it exposed. Use when writing or debugging a features/k8s/*.feature scenario, or support/k8s/*.ts / support/poll.ts.
---

# kubectl discovery and polling in sandbox2

See `.agents/skills/bdd-alias-datatable/` first. This extends the same
pattern to real `kubectl`-observed cluster state.

## Discovery by label selector, not by name

`Deployment`/`Service`/`Pod` (`support/k8s/deployment.ts`/`service.ts`/
`pod.ts`, all thin wrappers over the shared `support/k8s/discover.ts`)
are discovered by real Kubernetes labels, not a guessed/computed
resource name:

```gherkin
Given Deployment known as "<NginxDeployment>":
  | PROPERTY                   | VALUE                     |
  | namespace                  | sandbox2-helm-test        |
  | app.kubernetes.io/name     | nginx                     |
  | app.kubernetes.io/instance | sandbox-nginx-k8s-release |
```
`namespace` is the one recognized non-label field; every other row is an
arbitrary label key/value — there is no closed `KNOWN_FIELDS` list to
validate against (unlike `Directory`/`Release`), because a real chart's
label set can't be enumerated in advance. Discovery requires the
selector to match **exactly one** real object — 0 or 2+ matches is a
real, loud error (`Expected exactly one <kind> matching ...`), not a
silent pick-first.

This is a real `kubectl get` at `Given` time — the read-only-check-in-
`Given` precedent `Directory` already established (`fs.existsSync`), now
against the cluster instead of the filesystem.

## Querying a discovered object

`When I get Deployment/Service/Pod known as "<Alias>" with:` (an
`OPTION|VALUE` table → `kubectl get` flags), plus `get events for ...`
and `get logs for ...` (Deployment/Pod only). All three route through
shared `kubectlGet`/`kubectlEvents`/`kubectlLogs` helpers in
`kubernetes.step.ts` that take plain `extraArgs: string[]`, not a
`DataTable` — this is what lets the polling functions (below) reuse the
exact same argv-building instead of duplicating it. `kind` is always
passed lowercase; `kubectlEvents` capitalizes it itself for the
`involvedObject.kind` field-selector value, so no call site has to
remember two different casings for the same type.

## Polling for eventually-consistent state

`Deployment`/`Service` are always discovered *after* an `--atomic`
`helm upgrade`, so they're already stable — a one-shot `get` is safe. A
`Pod` has no such guarantee (it can be `Pending` for a real, variable
time), and a naive fixed check either fires too early or, if delayed,
wastes time before reporting a failure a human then has to investigate.
`support/poll.ts`'s `pollUntil` re-runs a real command every interval
(never re-checks stale data) until:
- every `pass`-`OUTCOME` row holds → **success**
- any `fail`-`OUTCOME` row holds → **immediate failure**, no need to
  exhaust the timeout on a state that's already terminal-bad
- the timeout elapses → **failure**, with the last real observed state
  in the message

```gherkin
When I poll Pod known as "<Pod>" every "3s" for up to "30s" until:
  | KEY                                              | CONDITION | VALUE            | OUTCOME |
  | status.phase                                     | equals    | Running          | pass    |
  | status.containerStatuses[0].state.waiting.reason | equals    | CrashLoopBackOff | fail    |
```
Because a real bad state can genuinely be observed as more than one real
message across ticks (e.g. `ErrImagePull` then Kubernetes's own
`ImagePullBackOff`), pair a fast-fail poll with `Then it should have
failed with either:` (a `| MESSAGE |` table, passes if the real error
includes *any* listed candidate), not the single-message form.

`pollUntil`'s condition-checking reuses `assert_condition.ts`'s exported
`conditionHolds` (boolean) — the same implementation `assertCondition`
uses, not a second one.

## Real gotcha this exposed: cucumber-js's own step timeout

cucumber-js's default step timeout is **5000ms** — shorter than a
legitimate poll used elsewhere in this suite (up to 2 minutes for a
fast-fail scenario). This was a *latent* bug from the moment polling was
added: every poll happened to resolve on its very first tick (nothing
had genuinely needed to wait past one interval) until a scenario that
genuinely needs several real seconds of waiting hit it for real.
`support/hooks.ts` raises the global default (`setDefaultTimeout`) well
past the longest real poll timeout in the suite. If you add a new poll
with a longer real timeout than anything existing, don't assume this is
covered forever — check `hooks.ts`'s value is still comfortably above
your new longest real wait.

## A Service can't route to a Pod it just excluded

Once a Pod is confirmed NotReady (proven via a Pod-status poll), it has
been removed from its Service's endpoints entirely — a request routed
*through the Service* has no backend left to reach and fails to connect,
it does not return the app's real error status. Don't write a follow-up
`RestEndpoint` request expecting a 503 from an already-NotReady pod's
Service; the readiness-gates-traffic behavior is already fully proven by
the poll itself (real k8s's own readinessProbe is what flipped the
status).
