import { DataTable, Given, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { Directory, directoryFromTable, purgeDirectory } from '../support/aliases/directory.js';
import { buildArgs, runCommand } from '../support/run_command.js';
import { attempt } from '../support/attempt.js';

Given('Directory known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.directories.set(alias, directoryFromTable(dataTable));
});

When('I attempt to define Directory known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.directories.set(alias, directoryFromTable(dataTable));
  });
});

function getDirectory(world: World, alias: string): Directory {
  const dir = world.directories.get(alias);
  if (!dir) {
    throw new Error(`No Directory registered as "${alias}"`);
  }
  return dir;
}

When('I index Directory known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const dir = getDirectory(this, alias);
  this.lastCommandResult = runCommand('helm', ['repo', 'index', dir.path, ...buildArgs(table)]);
});

// `helm lint`/`helm package` only accept a local path - they operate on a
// Directory, never a HelmChart (which can also be a URL/OCI/reference).
When('I lint Directory known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const dir = getDirectory(this, alias);
  this.lastCommandResult = runCommand('helm', ['lint', dir.path, ...buildArgs(table)]);
});

When('I package Directory known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const dir = getDirectory(this, alias);
  this.lastCommandResult = runCommand('helm', ['package', dir.path, ...buildArgs(table)]);
});

// No "with:" table - purging is a pure filesystem operation, not a `helm`
// invocation, so there's no argv to build.
When('I purge Directory known as {string}', function (this: World, alias: string) {
  purgeDirectory(getDirectory(this, alias));
});

const DEPENDENCY_VERBS = ['build', 'list', 'update'] as const;

// A single step with a `{word}` parameter, not one registration per verb -
// see the comment on the equivalent `show` step in helm.step.ts for why:
// VS Code's Cucumber plugin can't resolve a step text that's only built at
// runtime inside a loop.
When('I {word} dependencies for Directory known as {string} with:', function (this: World, verb: string, alias: string, table: DataTable) {
  if (!(DEPENDENCY_VERBS as readonly string[]).includes(verb)) {
    throw new Error(`Unknown "dependency" verb "${verb}" (known verbs: ${DEPENDENCY_VERBS.join(', ')})`);
  }
  const dir = getDirectory(this, alias);
  this.lastCommandResult = runCommand('helm', ['dependency', verb, dir.path, ...buildArgs(table)]);
});
