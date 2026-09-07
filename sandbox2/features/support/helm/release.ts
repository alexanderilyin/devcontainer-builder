import { DataTable } from '@cucumber/cucumber';
import { HelmChart } from './helm_chart.js';

const KNOWN_FIELDS = ['chart', 'name', 'namespace'] as const;

export class Release {
  // NOT a string alias like Directory/File/URL/OCIArtifact - a real
  // HelmChart object. Its CLI representation depends on chart.kind (local
  // path vs URL vs OCI vs reference+repo), so Release needs the object
  // itself, resolved via a dedicated (alias) => HelmChart callback, not
  // the string-only resolveAlias used everywhere else.
  readonly chart: HelmChart;
  readonly name: string;
  readonly namespace: string;

  constructor(fields: Record<string, string>, chart: HelmChart) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`Release has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.name) {
      throw new Error('Release requires a "name" field');
    }
    if (!fields.namespace) {
      throw new Error('Release requires a "namespace" field');
    }
    this.chart = chart;
    this.name = fields.name;
    this.namespace = fields.namespace;
  }
}

export function releaseFromTable(dataTable: DataTable, resolveChart: (alias: string) => HelmChart | undefined): Release {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  if (!fields.chart) {
    throw new Error('Release requires a "chart" field');
  }
  const chart = resolveChart(fields.chart);
  if (!chart) {
    throw new Error(`No HelmChart registered as "${fields.chart}"`);
  }
  return new Release(fields, chart);
}
