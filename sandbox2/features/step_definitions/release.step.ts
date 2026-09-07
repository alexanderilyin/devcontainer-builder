import { DataTable, Given, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { Release, releaseFromTable } from '../support/helm/release.js';
import { chartRefToArgs } from '../support/helm/chart_ref_args.js';
import { buildArgs, runCommand } from '../support/run_command.js';
import { attempt } from '../support/attempt.js';

function resolveChart(world: World, alias: string) {
  return world.charts.get(alias);
}

Given('Release known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.releases.set(alias, releaseFromTable(dataTable, (a) => resolveChart(this, a)));
});

When('I attempt to define Release known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.releases.set(alias, releaseFromTable(dataTable, (a) => resolveChart(this, a)));
  });
});

function getRelease(world: World, alias: string): Release {
  const release = world.releases.get(alias);
  if (!release) {
    throw new Error(`No Release registered as "${alias}"`);
  }
  return release;
}

// Only install/upgrade take a chart ref - uninstall/rollback/status/
// history/test only ever take RELEASE_NAME + -n NAMESPACE (verified
// against real `helm <verb> --help` usage lines for each).
const RELEASE_VERBS = ['install', 'upgrade', 'uninstall', 'rollback', 'status', 'history', 'test'] as const;
const RELEASE_VERBS_WITH_CHART = new Set(['install', 'upgrade']);

// A single step with a `{word}` parameter, not one registration per verb -
// see the comment on the equivalent `show` step in helm.step.ts for why:
// VS Code's Cucumber plugin can't resolve a step text that's only built at
// runtime inside a loop.
When('I {word} Release known as {string} with:', function (this: World, verb: string, alias: string, table: DataTable) {
  if (!(RELEASE_VERBS as readonly string[]).includes(verb)) {
    throw new Error(`Unknown Release verb "${verb}" (known verbs: ${RELEASE_VERBS.join(', ')})`);
  }
  const release = getRelease(this, alias);
  const chartArgs = RELEASE_VERBS_WITH_CHART.has(verb) ? chartRefToArgs(release.chart.chart) : [];
  this.lastCommandResult = runCommand('helm', [verb, release.name, ...chartArgs, '-n', release.namespace, ...buildArgs(table)]);
});

const GET_SUBCOMMANDS = ['all', 'hooks', 'manifest', 'metadata', 'notes', 'values'] as const;
When('I get {word} for Release known as {string} with:', function (this: World, sub: string, alias: string, table: DataTable) {
  if (!(GET_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`Unknown "get" subcommand "${sub}" (known subcommands: ${GET_SUBCOMMANDS.join(', ')})`);
  }
  const release = getRelease(this, alias);
  this.lastCommandResult = runCommand('helm', ['get', sub, release.name, '-n', release.namespace, ...buildArgs(table)]);
});

When('I list Release with:', function (this: World, table: DataTable) {
  this.lastCommandResult = runCommand('helm', ['list', ...buildArgs(table)]);
});
