import { Given, When, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import path from "node:path";
import { startServer } from "../support/service_process.js";
import { writeTempFile, writeTempJson } from "../support/tmpfiles.js";
import {
  getTestPrivateKey,
  getGitFixtureAuthorizedKeyPair,
  getGitFixtureTls,
  getFixtureHostKeyLine,
  getWrongHostKeyLine,
  getFixtureHeadShortSha,
  REGISTRY_HOST,
  AUTHED_REGISTRY_HOST,
  TEST_BUILDKIT_ENDPOINT,
  GIT_FIXTURE_HOST,
} from "../support/build_fixtures.js";

function trackTempFile(world, filePath) {
  world.tempDirs ??= [];
  world.tempDirs.push(path.dirname(filePath));
  return filePath;
}

// The "the test-* fixture is deployed" steps (fixture.steps.js) only
// *start* their deployment and stash the promise here, so several
// independent fixtures declared in one Background still deploy in
// parallel instead of Cucumber's step-by-step sequencing serializing them.
// This is the actual, collective wait.
async function awaitPendingFixtures(world) {
  await Promise.all(world.pendingFixtures ?? []);
}

// Generalizes the same "declare a named real resource, reference it by
// name later" pattern "a file at ... containing:" already uses for config
// files (see namedFiles below) - covers real SSH key material and
// content-derived HEAD shas too, so a scenario states up front exactly
// which real value it's about to use instead of a magic string resolved
// invisibly deep inside another step's body. Every one of these awaits
// pending fixtures first, not just "the service is running"/"When the
// service is started" - getFixtureHostKeyLine/getFixtureHeadShortSha do a
// real ssh-keyscan/git ls-remote against the deployed fixture, so a name
// declared *before* "the service is running" (the natural place to put a
// Given) would otherwise race the fixture's own deployment. Harmless when
// already resolved (the common case, once some earlier scenario has fully
// awaited it) - only matters for whichever scenario runs first.
Given("a fresh, never-authorized SSH private key named {string}", async function (name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, await getTestPrivateKey());
});

Given("the test-git-server fixture's real authorized SSH private key named {string}", async function (name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, (await getGitFixtureAuthorizedKeyPair()).privateKey);
});

Given("the test-git-server fixture's real current SSH host key named {string}", async function (name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, await getFixtureHostKeyLine());
});

Given("a stale, non-matching SSH host key for the test-git-server fixture named {string}", async function (name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, await getWrongHostKeyLine());
});

Given("the current HEAD short sha of {string} is known as {string}", async function (repoPath, name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, await getFixtureHeadShortSha(repoPath));
});

Given("the current HEAD short sha of {string} on branch {string} is known as {string}", async function (repoPath, ref, name) {
  await awaitPendingFixtures(this);
  trackNamedValue(this, name, await getFixtureHeadShortSha(repoPath, ref));
});

function trackNamedValue(world, name, value) {
  world.namedValues ??= {};
  world.namedValues[name] = value;
}

// Sorted longest-name-first: some registered names are literal substrings
// of others (e.g. "registry-url" inside "authed-registry-url") - replacing
// the shorter one first would corrupt an unresolved occurrence of the
// longer one before it gets its own turn. This is the *only* substitution
// mechanism left in the suite - the old static URL/host sentinel map
// (fixture_sentinels.js) is gone; every fixture URL/host a scenario wants
// is registered by name via one of the "... is known as ..." steps below,
// same pattern as HEAD-shas and SSH key material above.
function substituteNamedValues(world, text) {
  const entries = Object.entries(world.namedValues ?? {}).sort((a, b) => b[0].length - a[0].length);
  return entries.reduce((result, [name, value]) => result.replaceAll(name, value), text);
}

// Pure string constants - unlike the SSH/HEAD-sha registrations above, none
// of these need awaitPendingFixtures: the value is the same whether or not
// the fixture has actually finished deploying yet, since it's just a DNS
// name/URL shape, not something that requires a live network round-trip to
// produce. "git-host" replaces both the old "(git fixture host)" and "(ssh
// fixture)" sentinels - they were aliases for the same value, kept
// separate only so old scenario text read naturally where it was about SSH
// specifically; no longer useful now that every reference is explicit.
//
// REGISTRY_HOST/AUTHED_REGISTRY_HOST/TEST_BUILDKIT_ENDPOINT/GIT_FIXTURE_HOST
// are undefined until "Given the following fixture releases are
// registered:" (fixture.steps.js) has run in this scenario - this guard
// turns a missing/misordered declaration into a clear error immediately,
// instead of silently registering "undefined" as the named value.
function requireHost(value, stepText) {
  if (value === undefined) {
    throw new Error(
      `fixture releases not registered - add "Given the following fixture releases are registered:" before "${stepText}"`,
    );
  }
  return value;
}

Given("the test-registry fixture's URL is known as {string}", function (name) {
  trackNamedValue(this, name, requireHost(REGISTRY_HOST, "the test-registry fixture's URL is known as"));
});

Given("the test-registry-authed fixture's URL is known as {string}", function (name) {
  trackNamedValue(this, name, requireHost(AUTHED_REGISTRY_HOST, "the test-registry-authed fixture's URL is known as"));
});

Given("the test-buildkit fixture's endpoint is known as {string}", function (name) {
  trackNamedValue(this, name, requireHost(TEST_BUILDKIT_ENDPOINT, "the test-buildkit fixture's endpoint is known as"));
});

Given("the test-git-server fixture's bare host is known as {string}", function (name) {
  trackNamedValue(this, name, requireHost(GIT_FIXTURE_HOST, "the test-git-server fixture's bare host is known as"));
});

Given("the test-git-server fixture's git protocol URL is known as {string}", function (name) {
  trackNamedValue(this, name, `git://${requireHost(GIT_FIXTURE_HOST, "the test-git-server fixture's git protocol URL is known as")}:9418`);
});

Given("the test-git-server fixture's http URL is known as {string}", function (name) {
  trackNamedValue(this, name, `http://${requireHost(GIT_FIXTURE_HOST, "the test-git-server fixture's http URL is known as")}:8080`);
});

Given("the test-git-server fixture's https URL is known as {string}", function (name) {
  trackNamedValue(this, name, `https://${requireHost(GIT_FIXTURE_HOST, "the test-git-server fixture's https URL is known as")}`);
});

Given("the test-git-server fixture's ssh URL is known as {string}", function (name) {
  trackNamedValue(this, name, `ssh://git@${requireHost(GIT_FIXTURE_HOST, "the test-git-server fixture's ssh URL is known as")}`);
});

// Actually starts the real compiled server, using whatever env has been
// accumulated by "configured with"/"credentials are" steps so far - which
// means every one of those must appear *before* this step in a scenario,
// not after. Every ".feature" file using this step has been ordered
// accordingly: config first, then this, then requests. A "configured
// with"/"credentials are" step written after this one is a bug - it would
// silently have no effect, since the spawned process's environment is
// fixed at spawn time.
Given("the service is running", async function () {
  await awaitPendingFixtures(this);
  const { process: proc, baseUrl } = await startServer(this.envOverrides, this.cliArgs);
  this.serverProcess = proc;
  this.baseUrl = baseUrl;
});

// Every scenario in this suite declares "the service is running" (or
// "When the service is started") before ever sending a request - there is
// no lazy/implicit startup fallback here. A request step failing this
// check means a new scenario forgot that declaration; that's a bug in the
// scenario to fix, not something to paper over by silently starting the
// server right here with whatever env happens to be set at that point in
// the step sequence.
function requireBaseUrl(world) {
  if (!world.baseUrl) {
    throw new Error(
      'no server is running - add "Given the service is running" (or "When the service is started") before sending a request',
    );
  }
  return world.baseUrl;
}

Given("the devcontainer-builder service is configured with:", function (dataTable) {
  const rows = dataTable.rowsHash();
  for (const [key, rawValue] of Object.entries(rows)) {
    let value = rawValue === "(unset)" ? undefined : rawValue;
    if (value !== undefined && this.namedFiles?.[value] !== undefined) {
      value = this.namedFiles[value];
    } else if (value !== undefined) {
      value = substituteNamedValues(this, value);
    }
    this.envOverrides[key] = value;
  }
});

// Raw argv tokens, not env vars - lets scenarios prove the CLI flag
// layer of config.ts's precedence chain (CLI > env var > settings file
// > default) independently of the other two sources. `raw()` (not
// `hashes()`/`rowsHash()`) keeps every row's two cells in their literal
// left-to-right order and allows repeated/non-unique first cells, which
// a key-value map wouldn't.
Given("the devcontainer-builder service is started with the following CLI flags:", function (dataTable) {
  this.cliArgs = dataTable.raw().flat();
});

Given("the server has no git credentials configured", function () {
  this.envOverrides.GIT_CREDENTIALS_CONFIG_PATH = undefined;
});

// Opt-in, not ambient: only scenarios that actually end up cloning over
// real HTTPS against the git fixture need this - build.ts rewrites a
// clone URL to https://host/path whenever an HTTPS credential resolves,
// regardless of the request's original scheme, so it's the *resolved*
// transport that matters, not what a request body literally says.
Given("the devcontainer-builder service trusts the test-git-server fixture's TLS certificate authority", async function () {
  const { caCertPath } = await getGitFixtureTls();
  this.envOverrides.GIT_SSL_CAINFO = caCertPath;
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
    ...(row.hostMatch ? { hostMatch: substituteNamedValues(this, row.hostMatch) } : {}),
    ...(row.pathPrefix ? { pathPrefix: row.pathPrefix } : {}),
    registry: substituteNamedValues(this, row.registry),
  }));
  this.envOverrides.REGISTRY_MAPPING_CONFIG_PATH = trackTempFile(this, await writeTempJson(rules));
});

Given("the ambient registry auth is not configured", function () {
  this.envOverrides.DOCKER_CONFIG = undefined;
});

Given(
  "the ambient registry auth is configured for {string} with username {string} and password {string}",
  async function (registry, username, password) {
    const host = substituteNamedValues(this, registry);
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
// Named after the symbolic path's own basename (not a hardcoded
// "config.json") so config.ts's extension-based JSON/YAML dispatch sees
// the real ".json"/".yaml"/".yml" a scenario intends, not always ".json".
Given("a file at {string} containing:", async function (symbolicPath, content) {
  this.namedFiles ??= {};
  this.namedFiles[symbolicPath] = trackTempFile(this, await writeTempFile(content, path.basename(symbolicPath)));
});

// `host` and `pinnedHostKey` (when not itself an exact registered name)
// go through substituteNamedValues - a prior "the test-git-server
// fixture's bare host is known as ..." step registers the host,
// "privateKey"/"pinnedHostKey" cells are looked up in namedValues first -
// a prior "a fresh, never-authorized SSH private key named ..."/"the
// test-git-server fixture's real authorized SSH private key named
// ..."/"...real current SSH host key named ..."/"a stale, non-matching
// SSH host key ... named ..." step declares the real value under that
// name (see above). Falls back to the raw cell value when no such name
// was declared, so a scenario can still supply a literal garbage string
// directly (e.g. the malformed-key test).
Given("the server's git credentials are:", async function (dataTable) {
  const rows = dataTable.hashes();
  const entries = [];
  for (const row of rows) {
    const entry = { host: substituteNamedValues(this, row.host), kind: row.kind };
    if (row.username) entry.username = row.username;
    if (row.token) entry.token = row.token;
    if (row.privateKey) {
      entry.privateKey = this.namedValues?.[row.privateKey] ?? row.privateKey;
    }
    if (row.pinnedHostKey && row.pinnedHostKey !== "(unset)") {
      entry.pinnedHostKey = this.namedValues?.[row.pinnedHostKey] ?? substituteNamedValues(this, row.pinnedHostKey);
    }
    entries.push(entry);
  }
  this.envOverrides.GIT_CREDENTIALS_CONFIG_PATH = trackTempFile(this, await writeTempJson(entries));
});

When("I send a {word} request to {string}", async function (method, path) {
  const baseUrl = requireBaseUrl(this);
  const res = await fetch(`${baseUrl}${path}`, { method });
  this.response = { status: res.status, body: await res.text() };
});

// The doc string is forwarded as the request body - including deliberately
// invalid JSON in validation-negative scenarios - except for registered
// named values (see substituteNamedValues above), substituted with real
// per-run fixture addresses so a scenario can reference them in a request
// body the same way it does in a "server's git credentials are:" table.
When("I send a POST request to {string} with body:", async function (path, docString) {
  const baseUrl = requireBaseUrl(this);
  const body = substituteNamedValues(this, docString);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  this.response = { status: res.status, body: await res.text() };
});

When("the service is started", async function () {
  await awaitPendingFixtures(this);
  try {
    const { process: proc, baseUrl } = await startServer(this.envOverrides, this.cliArgs);
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

// Substitutes any namedValues declared by prior "... is known as ..."
// steps - lets a scenario assert against real fixture URLs/hosts and the
// fixture's real, content-derived HEAD sha instead of values it can't
// actually control, with every real query now an explicit prior step
// rather than invisible inside this assertion.
Then("the resolved image should be {string}", function (expected) {
  const resolved = substituteNamedValues(this, expected);
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
