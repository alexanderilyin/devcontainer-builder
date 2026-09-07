import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { DataTable, Then } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { assertCondition } from '../support/assert_condition.js';
import { query } from '../support/query.js';

// Generic across every object type in this suite - implementation only
// ever reads World.lastError / World.lastCommandResult, never anything
// type-specific, so one registration serves Directory, HelmChart,
// HelmRepo, Release, and any future type alike.

Then('it should have failed with {string}', function (this: World, expectedMessage: string) {
  assert.ok(this.lastError, 'expected the previous step to fail, but it succeeded');
  assert.ok(
    this.lastError!.message.includes(expectedMessage),
    `expected error message to include "${expectedMessage}", got "${this.lastError!.message}"`,
  );
});

// For a failure that can genuinely land on more than one real message -
// e.g. a poll can observe a Pod in more than one real transient bad state
// on the way to its terminal one (ErrImagePull, then ImagePullBackOff) -
// passes if the actual message includes ANY one of the listed candidates.
Then('it should have failed with either:', function (this: World, table: DataTable) {
  assert.ok(this.lastError, 'expected the previous step to fail, but it succeeded');
  const candidates = table.hashes().map((row) => row.MESSAGE);
  const matched = candidates.some((candidate) => this.lastError!.message.includes(candidate));
  assert.ok(matched, `expected error message to include one of [${candidates.join(', ')}], got "${this.lastError!.message}"`);
});

// Two separate functions, not one shared function with an optional
// trailing param: cucumber-js inspects a step function's declared arity to
// detect legacy callback-style steps, and a 2nd declared parameter with no
// attached DataTable in the Gherkin gets treated as "wants a callback" -
// it injects a function there instead of leaving it undefined. Distinct
// arities per registration avoids that entirely.
function assertExitCodeOnly(this: World, expectedExitCode: number) {
  if (!this.lastCommandResult) {
    throw new Error('No command has been run yet');
  }
  assertCondition('EXIT_CODE', this.lastCommandResult.EXIT_CODE, 'equals', String(expectedExitCode), { ...this.lastCommandResult });
}

function assertExitCodeAndOutput(this: World, expectedExitCode: number, table: DataTable) {
  assertExitCodeOnly.call(this, expectedExitCode);
  for (const { SOURCE, CONDITION, VALUE } of table.hashes()) {
    assertCondition(SOURCE, this.lastCommandResult![SOURCE as 'STDOUT' | 'STDERR'], CONDITION, VALUE, { ...this.lastCommandResult });
  }
}

Then('the command exited with {int}', assertExitCodeOnly);
Then('the command exited with {int}:', assertExitCodeAndOutput);

Then('the command result data has:', function (this: World, table: DataTable) {
  if (!this.lastCommandResult) {
    throw new Error('No command has been run yet');
  }
  const parsed = yaml.load(this.lastCommandResult.STDOUT);
  for (const { KEY, CONDITION, VALUE } of table.hashes()) {
    assertCondition(KEY, query(parsed, KEY), CONDITION, VALUE, { result: parsed });
  }
});
