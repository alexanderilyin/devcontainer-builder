import yaml from 'js-yaml';
import { DataTable, Given, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { HelmChart, helmChartFromTable } from '../support/helm/helm_chart.js';
import { readChartYaml } from '../support/helm/chart_source.js';
import { chartRefToArgs } from '../support/helm/chart_ref_args.js';
import { assertCondition } from '../support/assert_condition.js';
import { query } from '../support/query.js';
import { buildArgs, runCommand } from '../support/run_command.js';
import { chartFileFromTable } from '../support/aliases/file.js';
import { chartUrlFromTable } from '../support/aliases/url.js';
import { ociArtifactFromTable } from '../support/aliases/oci_artifact.js';
import { resolveAlias } from '../support/aliases/resolve_alias.js';
import { attempt } from '../support/attempt.js';

Given('File known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.files.set(alias, chartFileFromTable(dataTable));
});

When('I attempt to define File known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.files.set(alias, chartFileFromTable(dataTable));
  });
});

Given('URL known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.urls.set(alias, chartUrlFromTable(dataTable));
});

When('I attempt to define URL known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.urls.set(alias, chartUrlFromTable(dataTable));
  });
});

Given('OCIArtifact known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.ociArtifacts.set(alias, ociArtifactFromTable(dataTable));
});

When('I attempt to define OCIArtifact known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.ociArtifacts.set(alias, ociArtifactFromTable(dataTable));
  });
});

Given('Helm Chart known as {string}:', function (this: World, name: string, dataTable: DataTable) {
  this.charts.set(name, helmChartFromTable(dataTable, (alias) => resolveAlias(this, alias)));
});

When('I attempt to define Helm Chart known as {string}:', function (this: World, name: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.charts.set(name, helmChartFromTable(dataTable, (alias) => resolveAlias(this, alias)));
  });
});

Given('Helm Chart known as {string} has:', function (this: World, name: string, dataTable: DataTable) {
  const chart = this.charts.get(name);
  if (!chart) {
    throw new Error(`No HelmChart registered as "${name}"`);
  }
  const parsed = yaml.load(readChartYaml(chart.chart)) as Record<string, unknown>;
  for (const { KEY, CONDITION, VALUE } of dataTable.hashes()) {
    assertCondition(KEY, query(parsed, KEY), CONDITION, VALUE, parsed);
  }
});

function getChart(world: World, alias: string): HelmChart {
  const chart = world.charts.get(alias);
  if (!chart) {
    throw new Error(`No HelmChart registered as "${alias}"`);
  }
  return chart;
}

// `helm template [NAME] [CHART]` - NAME (if the table supplies one via a
// blank-OPTION positional row) must come *before* the chart args, not
// after - real usage, confirmed by actually running it (a table-supplied
// "test-nginx" ended up parsed as CHART, chart's own path as a stray extra
// arg, until this was reordered).
When('I template Helm Chart known as {string} with:', function (this: World, alias: string, table: DataTable) {
  const chart = getChart(this, alias);
  this.lastCommandResult = runCommand('helm', ['template', ...buildArgs(table), ...chartRefToArgs(chart.chart)]);
});

const SHOW_SUBCOMMANDS = ['chart', 'values', 'readme', 'crds', 'all'] as const;

// A single step with a `{word}` parameter (rather than one registration per
// subcommand) so the step text stays a literal string - VS Code's Cucumber
// plugin resolves glue steps by statically scanning source text, so a
// dynamically-interpolated pattern (`` `I show ${sub} ...` `` inside a loop)
// is invisible to it even though cucumber-js itself matches it fine at
// runtime.
When('I show {word} for Helm Chart known as {string} with:', function (this: World, sub: string, alias: string, table: DataTable) {
  if (!(SHOW_SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw new Error(`Unknown "show" subcommand "${sub}" (known subcommands: ${SHOW_SUBCOMMANDS.join(', ')})`);
  }
  const chart = getChart(this, alias);
  this.lastCommandResult = runCommand('helm', ['show', sub, ...buildArgs(table), ...chartRefToArgs(chart.chart)]);
});
