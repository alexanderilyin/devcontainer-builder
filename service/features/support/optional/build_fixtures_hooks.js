import { BeforeAll, AfterAll } from "@cucumber/cucumber";
import { installBuildFixtures, uninstallBuildFixtures } from "../build_fixtures.js";

// Deliberately NOT part of the shared features/support/*.js glob - only
// suites that actually need a full real build chain (registry + a
// disposable test BuildKit + a real git server, itself serving
// git/http/https/ssh) import this file.
BeforeAll({ timeout: 300_000 }, async function () {
  await installBuildFixtures();
});

AfterAll({ timeout: 120_000 }, async function () {
  await uninstallBuildFixtures();
});
