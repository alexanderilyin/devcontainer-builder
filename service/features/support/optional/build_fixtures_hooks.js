import { AfterAll } from "@cucumber/cucumber";
import { uninstallBuildFixtures } from "../build_fixtures.js";

// Deliberately NOT part of the shared features/support/*.js glob - only
// suites that actually need real fixtures import this file, for teardown.
// There's no BeforeAll here (unlike before): each fixture now deploys
// itself, lazily, the first time some scenario's own "Given the test-*
// fixture is deployed" step actually declares it (see fixture.steps.js) -
// which is also how a `.feature` file that only needs one or two fixtures
// avoids paying for the other two. Teardown still has to be a global,
// once-at-the-end hook - Gherkin has no "once after everything" construct
// in any implementation (cucumber-js or otherwise) - so this only tears
// down whichever fixtures actually got deployed in this process.
AfterAll({ timeout: 120_000 }, async function () {
  await uninstallBuildFixtures();
});
