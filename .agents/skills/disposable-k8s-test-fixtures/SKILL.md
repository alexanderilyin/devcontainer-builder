---
name: disposable-k8s-test-fixtures
description: Pattern for BDD/integration tests that need real protocol-level correctness (SSH, git, registry auth, BuildKit) - deploy real, disposable infra via Helm before the suite and tear it down after, instead of mocking. Covers the Service-routing-after-ready race, per-namespace isolation on shared clusters, referencing dynamic fixture addresses from test text, and not hardcoding content-derived values. Use when designing or debugging tests that spin up real Kubernetes-backed fixtures.
---

# Disposable Kubernetes test-fixture pattern

The approach used throughout `service/features/`: real Helm-deployed,
disposable infra (`charts/test-*`) proven manually first, then wired into
`BeforeAll`/`AfterAll` hooks - rather than faking protocols (SSH, git smart
HTTP, registry auth, BuildKit) with stub binaries. Real infra catches real
bugs (see the sibling skills in this directory) that a mock would hide.

## Verify each fixture manually before wiring it into the test framework

For every new fixture: `helm lint` → `helm template` → real
`helm upgrade --install` against the actual cluster → exercise it directly
(`curl`, `git clone`, `docker buildx build --push`, `ssh-keyscan`, ...) →
`helm uninstall` and confirm clean teardown. Only once that round-trip is
proven by hand does it belong in `BeforeAll`/`AfterAll`. Debugging a test
framework's async hook failures is much harder than debugging a plain shell
session against the same cluster.

## `helm --wait` doesn't guarantee the Service is actually reachable yet

A pod passing its own readiness probe and the cluster's Service routing
(kube-proxy/EndpointSlice) having caught up are two different things that
can lag behind each other by a few seconds. Trusting `helm --wait` alone
causes intermittent failures on the *first* request(s) right after install,
even though every fixture involved is legitimately healthy moments later.
Poll real TCP reachability against the Service's actual DNS name/port
before declaring fixtures ready:

```js
// features/support/wait_for_reachable.js
await waitUntilReachable([{ host: "my-fixture.namespace.svc.cluster.local", port: 5000 }]);
```

## One namespace per repo + workspace/user, not a shared `default`

On a cluster other work might also be running on, give test fixtures their
own namespace derived from something stable and collision-resistant (repo
name + CI/workspace owner), auto-created if missing:

```js
const namespace = `${repoName}-${process.env.WORKSPACE_OWNER ?? "local"}`;
```

This also sidesteps `default`'s often-restrictive PodSecurity level (see
the `helm-chart-authoring` skill) by letting you label your own namespace
appropriately.

## Reference dynamic fixture addresses via sentinels in test text, not hardcoded strings

Feature/spec files shouldn't hardcode a namespace-dependent DNS name.
Resolve a small set of symbolic tokens (`"(test registry)"`,
`"(git fixture git)"`, ...) to the real per-run addresses at step-execution
time:

```js
const SENTINELS = { "(test registry)": REGISTRY_HOST, /* ... */ };
function resolveFixtureSentinels(text) {
  return Object.entries(SENTINELS).reduce((s, [k, v]) => s.replaceAll(k, v), text);
}
```

Keeps test scenarios readable and portable across namespaces/environments
without any manual find-and-replace.

## Don't hardcode a value the real fixture actually computes

A real git commit has a real, content-derived SHA you can't dictate; a real
registry push produces a real digest. Rather than pinning fixture content
so its output happens to match a hardcoded expectation (fragile, breaks the
moment the fixture is redeployed), query the fixture for its actual current
state at test time and assert against *that*:

```js
// "(head:<repo path>)" resolves via a real `git ls-remote` against the fixture
const sha = await getFixtureHeadShortSha(repoPath);
```

## Isolate expensive fixture lifecycles from cheap test suites

Not every test file needs every fixture. Keep `BeforeAll`/`AfterAll` hook
files that install real infra out of any glob shared with fast, fixture-free
suites - import them explicitly only in the npm script(s) that need them,
so a quick validation-only test run never pays for a Helm install it
doesn't use.
