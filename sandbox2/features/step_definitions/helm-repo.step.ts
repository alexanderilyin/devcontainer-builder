import { DataTable, Given, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { helmRepoFromTable, HelmRepo } from '../support/helm/helm_repo.js';
import { buildArgs, runCommand } from '../support/run_command.js';
import { resolveAlias } from '../support/aliases/resolve_alias.js';
import { attempt } from '../support/attempt.js';

Given('Helm Repo known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  // Pure definition only - no `helm repo add` here. Mirrors HelmChart's
  // Given exactly: define first, act later via an explicit When step.
  this.repos.set(alias, helmRepoFromTable(dataTable, (a) => resolveAlias(this, a)));
});

When('I attempt to define Helm Repo known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.repos.set(alias, helmRepoFromTable(dataTable, (a) => resolveAlias(this, a)));
  });
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

When('I list Helm Repo with:', function (this: World, table: DataTable) {
  this.lastCommandResult = runCommand('helm', ['repo', 'list', ...buildArgs(table)]);
});
