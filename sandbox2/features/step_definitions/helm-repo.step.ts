import yaml from 'js-yaml';
import { DataTable, Given, Then, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { helmRepoFromTable, HelmRepo } from '../support/helm_repo.js';
import { directoryFromTable } from '../support/directory.js';
import { buildArgs, runCommand } from '../support/run_command.js';
import { assertCondition } from '../support/assert_condition.js';
import { query } from '../support/query.js';
import { resolveAlias } from '../support/resolve_alias.js';

Given('Helm Repo known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  // Pure definition only - no `helm repo add` here. Mirrors HelmChart's
  // Given exactly: define first, act later via an explicit When step.
  this.repos.set(alias, helmRepoFromTable(dataTable, (a) => resolveAlias(this, a)));
});

Given('Directory known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.directories.set(alias, directoryFromTable(dataTable));
});

function getRepo(world: World, alias: string): HelmRepo {
  const repo = world.repos.get(alias);
  if (!repo) {
    throw new Error(`No HelmRepo registered as "${alias}"`);
  }
  return repo;
}

When('I add Helm Repo known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const repo = getRepo(this, alias);
  this.lastCommandResult = runCommand('helm', ['repo', 'add', repo.name, repo.url, ...buildArgs(table)]);
});

When('I remove Helm Repo known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const repo = getRepo(this, alias);
  this.lastCommandResult = runCommand('helm', ['repo', 'remove', repo.name, ...buildArgs(table)]);
});

When('I update Helm Repo known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const repo = getRepo(this, alias);
  this.lastCommandResult = runCommand('helm', ['repo', 'update', repo.name, ...buildArgs(table)]);
});

When('I index Directory known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const dir = this.directories.get(alias);
  if (!dir) {
    throw new Error(`No Directory registered as "${alias}"`);
  }
  this.lastCommandResult = runCommand('helm', ['repo', 'index', dir.path, ...buildArgs(table)]);
});

When('I list Helm Repo with:', function (this: World, table: DataTable) {
  this.lastCommandResult = runCommand('helm', ['repo', 'list', ...buildArgs(table)]);
});

// Two separate functions, not one shared function with an optional
// trailing param: cucumber-js inspects a step function's declared arity to
// detect legacy callback-style steps, and a 2nd declared parameter with no
// attached DataTable in the Gherkin gets treated as "wants a callback" -
// it injects a function there instead of leaving it undefined. Distinct
// arities per registration avoids that entirely.
function assertExitCodeOnly(this: World, expectedExitCode: number) {
  if (!this.lastCommandResult) {
    throw new Error('No Helm Repo command has been run yet');
  }
  assertCondition('EXIT_CODE', this.lastCommandResult.EXIT_CODE, 'equals', String(expectedExitCode), { ...this.lastCommandResult });
}

function assertExitCodeAndOutput(this: World, expectedExitCode: number, table: DataTable) {
  assertExitCodeOnly.call(this, expectedExitCode);
  for (const { SOURCE, CONDITION, VALUE } of table.hashes()) {
    assertCondition(SOURCE, this.lastCommandResult![SOURCE as 'STDOUT' | 'STDERR'], CONDITION, VALUE, { ...this.lastCommandResult });
  }
}

Then('the Helm Repo command exited with {int}', assertExitCodeOnly);
Then('the Helm Repo command exited with {int}:', assertExitCodeAndOutput);

Then('the Helm Repo command result data has:', function (this: World, table: DataTable) {
  if (!this.lastCommandResult) {
    throw new Error('No Helm Repo command has been run yet');
  }
  const parsed = yaml.load(this.lastCommandResult.STDOUT);
  for (const { KEY, CONDITION, VALUE } of table.hashes()) {
    assertCondition(KEY, query(parsed, KEY), CONDITION, VALUE, { result: parsed });
  }
});
