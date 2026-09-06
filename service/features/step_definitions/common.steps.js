import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../support/service_process.js";
import { ensureServerStarted } from "../support/ensure_server.js";
import { writeTempFile, writeTempJson } from "../support/tmpfiles.js";
import { getTestPrivateKey, getGitFixtureAuthorizedKeyPair } from "../support/build_fixtures.js";
import { resolveFixtureSentinels, resolveDynamicSentinels } from "../support/fixture_sentinels.js";

function trackTempFile(world, filePath) {
  world.tempDirs ??= [];
  world.tempDirs.push(path.dirname(filePath));
  return filePath;
}

// Actually starts the real compiled server (via ensureServerStarted),
// using whatever env has been accumulated by "configured with"/
// "credentials are" steps so far - which means every one of those must
// appear *before* this step in a scenario, not after. Every ".feature"
// file using this step has been ordered accordingly: config first, then
// this, then requests. A "configured with"/"credentials are" step written
// after this one is a bug - it would silently have no effect, since the
// spawned process's environment is fixed at spawn time.
Given("the service is running", async function () {
  await ensureServerStarted(this);
});

Given("the devcontainer-builder service is configured with:", function (dataTable) {
  const rows = dataTable.rowsHash();
  for (const [key, rawValue] of Object.entries(rows)) {
    let value = rawValue === "(unset)" ? undefined : rawValue;
    if (value !== undefined && this.namedFiles?.[value] !== undefined) {
      value = this.namedFiles[value];
    } else if (value !== undefined) {
      value = resolveFixtureSentinels(value);
    }
    this.envOverrides[key] = value;
  }
});

Given("the server has no git credentials configured", function () {
  this.envOverrides.GIT_CREDENTIALS_CONFIG_PATH = undefined;
});

Given("the server's registry mapping rules are empty", async function () {
  this.envOverrides.REGISTRY_MAPPING_CONFIG_PATH = trackTempFile(this, await writeTempJson([]));
});

// hostMatch/pathPrefix are optional per rule (see config.ts) - an empty
// cell for either column comes through as "", which build.ts's truthy
// check (`if (rule.hostMatch && ...)`) already treats identically to the
// field being absent, so it's passed straight through rather than needing
// to be stripped out here.
Given("the server's registry mapping rules are:", async function (dataTable) {
  const rules = dataTable.hashes().map((row) => ({
    ...(row.hostMatch ? { hostMatch: resolveFixtureSentinels(row.hostMatch) } : {}),
    ...(row.pathPrefix ? { pathPrefix: row.pathPrefix } : {}),
    registry: resolveFixtureSentinels(row.registry),
  }));
  this.envOverrides.REGISTRY_MAPPING_CONFIG_PATH = trackTempFile(this, await writeTempJson(rules));
});

Given("the ambient registry auth is not configured", function () {
  this.envOverrides.DOCKER_CONFIG = undefined;
});

Given(
  "the ambient registry auth is configured for {string} with username {string} and password {string}",
  async function (registry, username, password) {
    const host = resolveFixtureSentinels(registry);
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const configPath = trackTempFile(this, await writeTempJson({ auths: { [host]: { auth } } }));
    this.envOverrides.DOCKER_CONFIG = path.dirname(configPath);
  },
);

// Writes a real temp file and remembers it under the symbolic path the
// scenario wrote (e.g. "/config/git-credentials.json") - a later
// "configured with" step referencing that same symbolic path as an env
// var's value gets redirected to the real file, since a scenario can't
// literally write to a container-rooted path like /config from here.
Given("a file at {string} containing:", async function (symbolicPath, content) {
  this.namedFiles ??= {};
  this.namedFiles[symbolicPath] = trackTempFile(this, await writeTempFile(content, "config.json"));
});

// `host` goes through the static fixture sentinels (e.g. "(ssh fixture)" /
// "(git fixture host)"). "(a valid private key)" substitutes a real,
// syntactically-valid ephemeral key generated for this test run - a
// fixture with no matching authorized key rejects it at the auth step, not
// host-key-verification (that distinction is what several scenarios check).
// "(an authorized private key)" substitutes the fixture's real authorized
// key, for scenarios proving a genuinely successful clone/push, not just
// policy branching. "pinnedHostKey" goes through the dynamic sentinels too,
// so "(ssh fixture host key)" resolves to the fixture's *real* current host
// key - a fake/placeholder pin would fail host-key verification for the
// wrong reason (a real mismatch) instead of proving "pinned" policy works.
Given("the server's git credentials are:", async function (dataTable) {
  const rows = dataTable.hashes();
  const entries = [];
  for (const row of rows) {
    const entry = { host: resolveFixtureSentinels(row.host), kind: row.kind };
    if (row.username) entry.username = row.username;
    if (row.token) entry.token = row.token;
    if (row.privateKey === "(a valid private key)") {
      entry.privateKey = await getTestPrivateKey();
    } else if (row.privateKey === "(an authorized private key)") {
      entry.privateKey = (await getGitFixtureAuthorizedKeyPair()).privateKey;
    } else if (row.privateKey) {
      entry.privateKey = row.privateKey;
    }
    if (row.pinnedHostKey && row.pinnedHostKey !== "(unset)") {
      entry.pinnedHostKey = await resolveDynamicSentinels(resolveFixtureSentinels(row.pinnedHostKey));
    }
    entries.push(entry);
  }
  this.envOverrides.GIT_CREDENTIALS_CONFIG_PATH = trackTempFile(this, await writeTempJson(entries));
});

When("I send a {word} request to {string}", async function (method, path) {
  const baseUrl = await ensureServerStarted(this);
  const res = await fetch(`${baseUrl}${path}`, { method });
  this.response = { status: res.status, body: await res.text() };
});

// The doc string is forwarded as the request body - including deliberately
// invalid JSON in validation-negative scenarios - except for fixture
// sentinels (see fixture_sentinels.js), substituted with real per-run
// fixture addresses so a scenario can reference them in a request body the
// same way it does in a "server's git credentials are:" table.
When("I send a POST request to {string} with body:", async function (path, docString) {
  const baseUrl = await ensureServerStarted(this);
  const body = resolveFixtureSentinels(docString);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  this.response = { status: res.status, body: await res.text() };
});

When("the service is started", async function () {
  try {
    const { process: proc, baseUrl } = await startServer(this.envOverrides);
    this.serverProcess = proc;
    this.baseUrl = baseUrl;
    this.startupError = undefined;
  } catch (err) {
    this.serverProcess = undefined;
    this.startupError = err;
  }
});

Then("the service should start successfully", function () {
  assert.equal(this.startupError, undefined, `expected the service to start, but it failed: ${this.startupError?.message}`);
});

Then("the service should fail to start", function () {
  assert.notEqual(this.startupError, undefined, "expected the service to fail to start, but it started successfully");
});

Then("the startup error should mention {string}", function (substring) {
  assert.ok(
    this.startupError?.message.includes(substring),
    `expected startup error to mention ${JSON.stringify(substring)}, got: ${this.startupError?.message}`,
  );
});

Then("the invalid entry should have been logged and skipped", function () {
  assert.match(this.serverProcess.capturedStderr, /skipping invalid .* config entry/);
});

Then("the response status should be {int}", function (expectedStatus) {
  assert.equal(this.response.status, expectedStatus);
});

// Supports "(head:<repo path>)" alongside the static fixture sentinels, so
// a scenario can assert against the fixture's real, content-derived HEAD
// SHA instead of a value it can't actually control.
Then("the resolved image should be {string}", async function (expected) {
  const resolved = await resolveDynamicSentinels(resolveFixtureSentinels(expected));
  const actual = JSON.parse(this.response.body);
  assert.equal(actual.image, resolved);
});

Then("the response body should equal:", function (docString) {
  assert.deepEqual(JSON.parse(this.response.body), JSON.parse(docString));
});

// Partial match: every key/value pair in the doc string must be present
// (and equal) in the actual response body, which may have other fields too.
Then("the response body should include:", function (docString) {
  const actual = JSON.parse(this.response.body);
  const expected = JSON.parse(docString);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `expected response body's "${key}" to equal ${JSON.stringify(value)}, got ${JSON.stringify(actual[key])}`);
  }
});

Then("the response body should contain {string}", function (substring) {
  assert.ok(
    this.response.body.includes(substring),
    `expected response body to contain ${JSON.stringify(substring)}, got: ${this.response.body}`,
  );
});

Then("the response body should not contain {string}", function (substring) {
  assert.ok(
    !this.response.body.includes(substring),
    `expected response body NOT to contain ${JSON.stringify(substring)}, got: ${this.response.body}`,
  );
});

// git/docker/devcontainer subprocess output is run with stdio:"inherit"
// (see run() in build.ts), so it lands on the spawned server process's own
// stdout/stderr, never in the HTTP response body (which only ever gets the
// generic "<cmd> ... exited with code N" message) - use these (not
// "the response body should ...") to assert on what those tools actually
// printed, e.g. distinguishing a host-key-verification failure from an
// auth failure, or confirming a push's actual HTTP status.
function combinedLogs(world) {
  return world.serverProcess.capturedStdout + world.serverProcess.capturedStderr;
}

Then("the service logs should contain {string}", function (substring) {
  assert.ok(
    combinedLogs(this).includes(substring),
    `expected service logs to contain ${JSON.stringify(substring)}, got: ${combinedLogs(this)}`,
  );
});

Then("the service logs should not contain {string}", function (substring) {
  assert.ok(
    !combinedLogs(this).includes(substring),
    `expected service logs NOT to contain ${JSON.stringify(substring)}, got: ${combinedLogs(this)}`,
  );
});
