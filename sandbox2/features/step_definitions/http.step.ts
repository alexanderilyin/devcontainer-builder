import fs from 'node:fs';
import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { RestEndpoint, restEndpointFromTable } from '../support/http/rest_endpoint.js';
import { sendHttpRequest } from '../support/http/http_request.js';
import { captureHeaderFromResponse, captureQueryParameterFromResponseHeader, captureValueFromResponse } from '../support/http/capture.js';
import { attempt } from '../support/attempt.js';
import { assertCondition } from '../support/assert_condition.js';

function resolveService(world: World, alias: string) {
  return world.services.get(alias);
}

Given('RestEndpoint known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.restEndpoints.set(alias, restEndpointFromTable(dataTable, (a) => resolveService(this, a)));
});

When('I attempt to define RestEndpoint known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.restEndpoints.set(alias, restEndpointFromTable(dataTable, (a) => resolveService(this, a)));
  });
});

function getRestEndpoint(world: World, alias: string): RestEndpoint {
  const endpoint = world.restEndpoints.get(alias);
  if (!endpoint) {
    throw new Error(`No RestEndpoint registered as "${alias}"`);
  }
  return endpoint;
}

// A value the server generated (e.g. a created note's real id) can only
// be known after a response comes back - no bare Given at scenario start
// can supply it. No table - a bare Given, same shape as the sibling
// service/features/ suite's already-proven "the command output is known
// as ..." idiom.
Given('the value at {string} from the last response is known as {string}', function (this: World, jmespath: string, alias: string) {
  captureValueFromResponse(this, jmespath, alias);
});

Given('the value of response header {string} from the last response is known as {string}', function (this: World, headerName: string, alias: string) {
  captureHeaderFromResponse(this, headerName, alias);
});

Given('the query parameter {string} from response header {string} is known as {string}', function (this: World, parameter: string, headerName: string, alias: string) {
  captureQueryParameterFromResponseHeader(this, headerName, parameter, alias);
});

// No-table variant for the common case of a request with no headers/
// query/body - "with:" + an empty TYPE|KEY|VALUE table is pure noise for
// a bare GET.
When('I send a {word} request to RestEndpoint known as {string} path {string}', function (this: World, method: string, alias: string, path: string) {
  return sendHttpRequest(this, getRestEndpoint(this, alias), method, path);
});

When(
  'I send a {word} request to RestEndpoint known as {string} path {string} with:',
  function (this: World, method: string, alias: string, path: string, table: DataTable) {
    return sendHttpRequest(this, getRestEndpoint(this, alias), method, path, table);
  },
);

When('I attempt to send a {word} request to RestEndpoint known as {string} path {string}', function (this: World, method: string, alias: string, path: string) {
  const endpoint = getRestEndpoint(this, alias);
  return attempt(this, () => sendHttpRequest(this, endpoint, method, path));
});

When(
  'I attempt to send a {word} request to RestEndpoint known as {string} path {string} with:',
  function (this: World, method: string, alias: string, path: string, table: DataTable) {
    const endpoint = getRestEndpoint(this, alias);
    return attempt(this, () => sendHttpRequest(this, endpoint, method, path, table));
  },
);

// Two separate functions, not one shared function with an optional
// trailing param - same cucumber-js legacy-callback-detection footgun
// documented in common.step.ts's assertExitCodeOnly/assertExitCodeAndOutput.
function assertResponseStatusOnly(this: World, expected: number) {
  if (!this.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  assertCondition('status', this.lastHttpResponse.status, 'equals', String(expected), { ...this.lastHttpResponse });
}

function assertResponseStatusAndOutput(this: World, expected: number, table: DataTable) {
  assertResponseStatusOnly.call(this, expected);
  for (const { SOURCE, CONDITION, VALUE } of table.hashes()) {
    if (SOURCE !== 'BODY') {
      throw new Error(`Unknown response SOURCE "${SOURCE}" (known sources: BODY)`);
    }
    assertCondition(SOURCE, this.lastHttpResponse!.body, CONDITION, VALUE, { ...this.lastHttpResponse });
  }
}

Then('the response status is {int}', assertResponseStatusOnly);
Then('the response status is {int}:', assertResponseStatusAndOutput);

Then('the response headers has:', function (this: World, table: DataTable) {
  if (!this.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  // fetch()'s Headers normalizes names to lowercase - KEY rows must be
  // written lowercase to match.
  for (const { KEY, CONDITION, VALUE } of table.hashes()) {
    assertCondition(KEY, this.lastHttpResponse.headers[KEY], CONDITION, VALUE, { ...this.lastHttpResponse.headers });
  }
});

// Proves a download is byte-identical to a real fixture, not just that
// some text loosely matches - res.text() alone can't prove this for
// arbitrary binary content.
Then('the response body equals the real bytes of {string}', function (this: World, filePath: string) {
  if (!this.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  const expected = fs.readFileSync(filePath);
  if (!expected.equals(this.lastHttpResponse.bodyBytes)) {
    throw new Error(`Response body (${this.lastHttpResponse.bodyBytes.length} bytes) does not match real file "${filePath}" (${expected.length} bytes)`);
  }
});
