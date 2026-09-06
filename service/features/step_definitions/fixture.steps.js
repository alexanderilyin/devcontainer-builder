import { Given } from "@cucumber/cucumber";
import {
  registerFixtureReleases,
  ensureRegistryFixtureDeployed,
  ensureAuthedRegistryFixtureDeployed,
  ensureBuildkitFixtureDeployed,
  ensureGitServerFixtureDeployed,
} from "../support/build_fixtures.js";

// The Helm release-name identifiers themselves, genuinely sourced from
// this table rather than a hardcoded constant - see
// build_fixtures.js's registerFixtureReleases. Must run before any of the
// "is deployed"/"... is known as ..." steps below in the same scenario;
// cheap enough (plain object assignment, no network/async work) to just
// declare fresh in every file's Background rather than memoize.
Given("the following fixture releases are registered:", function (dataTable) {
  const rows = dataTable.rowsHash();
  registerFixtureReleases({
    registry: rows["test-registry"],
    registryAuthed: rows["test-registry-authed"],
    buildkit: rows["test-buildkit"],
    gitServer: rows["test-git-server"],
  });
});

// Deliberately synchronous, not `async` - these steps *start* their
// fixture's deployment (the async work begins immediately regardless of
// whether anyone awaits it yet) and stash the promise on the World rather
// than awaiting it here. Cucumber runs a scenario's Given steps strictly
// sequentially, so awaiting inline here would serialize independent
// fixtures' `helm upgrade --install` calls one after another instead of
// letting them run in parallel like before this file existed. The actual
// wait happens once, collectively, at "the service is running"/"When the
// service is started" (see awaitPendingFixtures in common.steps.js) -
// the first point that genuinely needs everything ready.
function trackFixture(world, promise) {
  (world.pendingFixtures ??= []).push(promise);
}

Given("the test-registry fixture is deployed", function () {
  trackFixture(this, ensureRegistryFixtureDeployed());
});

Given("the test-registry-authed fixture is deployed with username {string} and password {string}", function (username, password) {
  trackFixture(this, ensureAuthedRegistryFixtureDeployed(username, password));
});

Given("the test-buildkit fixture is deployed, trusting test-registry and test-registry-authed as insecure registries", function () {
  trackFixture(this, ensureBuildkitFixtureDeployed());
});

Given("the test-git-server fixture is deployed, serving:", function (dataTable) {
  const ports = dataTable.hashes().map((row) => Number(row.port));
  trackFixture(this, ensureGitServerFixtureDeployed(ports));
});
