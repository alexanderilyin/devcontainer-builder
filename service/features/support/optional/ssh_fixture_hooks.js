import { BeforeAll, AfterAll } from "@cucumber/cucumber";
import { installSshFixture, uninstallSshFixture } from "../ssh_fixture.js";

// Deliberately NOT part of the shared features/support/*.js glob - only
// suites that actually need a live SSH host import this file, so
// health/request_validation-style runs never pay the helm install/uninstall
// cost (tens of seconds against a real cluster) for scenarios that don't
// need it.
BeforeAll({ timeout: 240_000 }, async function () {
  await installSshFixture();
});

AfterAll({ timeout: 120_000 }, async function () {
  await uninstallSshFixture();
});
