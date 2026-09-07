# Close two known, small test-coverage gaps

*(Nice-to-have, not blocking. Both were flagged during a code review of
the kubectl-polling work and never closed. Small, independent, low-risk
- do either or both whenever convenient, no dependency on Phase 3.)*

## 1. `pollUntil`'s timeout-exhausted branch is unexercised

`support/poll.ts`'s `pollUntil` has three real exit paths: success, a
`fail`-`OUTCOME` row matching (fast-fail), and the timeout elapsing with
no `pass` row ever fully satisfied. The suite has real scenarios proving
the first two (`features/k8s/kubernetes.feature`'s happy-path Pod poll,
and its bad-image fast-fail scenario), but nothing proves the third
branch actually fires and reports correctly - every existing poll either
succeeds quickly or fails fast; none has ever been designed to
genuinely exhaust its timeout.

**Plan**: add a scenario that polls for a condition that will never
become true within a short real timeout (e.g. `status.phase equals
SomeStateThatNeverHappens` with no `fail` row to short-circuit it, timeout
`"10s"`), wrapped in `When I attempt to poll ...`, asserting `Then it
should have failed with "Poll timed out after"`. Keep the timeout short
(seconds, not the 2-minute budgets used elsewhere) so this doesn't slow
the suite down meaningfully - the point is exercising the code path, not
testing real timing precision. Verify the scenario actually takes
approximately its configured timeout (a rough manual timing check during
implementation, not a permanent assertion in the suite - this project's
existing fast-fail scenario already established that pattern: time it
once by hand, don't bake timing assertions into CI).

## 2. `discoverByLabels`'s real `kubectl get` never populates `lastCommandResult`

Every other `When` step in this suite sets `World.lastCommandResult`
after its real command runs, so a scenario can chain a generic `Then the
command exited with {int}` afterward if it wants to inspect the raw
call. `Deployment`/`Service`/`Pod`'s `Given` (`support/k8s/discover.ts`)
runs a real `kubectl get` but never records the result anywhere - if
discovery succeeds, the raw command output is silently discarded; if it
fails, the thrown error message is the only trace.

**Plan**: decide first whether this is actually worth fixing - `Given`
steps are pure-construction by convention everywhere else, and
populating `lastCommandResult` from a `Given` would be a new, arguably
inconsistent precedent (nothing else does this). The more consistent fix
might be: don't touch `Given`, and instead confirm the *error message*
thrown on a failed discovery (`Expected exactly one <kind> matching ...`)
already carries enough real, useful detail (it does - it includes the
real selector, namespace, and match count) rather than assuming
`lastCommandResult` access is actually needed. If a real, concrete use
case for chaining a `Then` after discovery comes up, revisit then, with
that concrete need driving the design rather than doing it speculatively
now.
