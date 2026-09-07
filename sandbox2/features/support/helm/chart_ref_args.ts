import { ChartRef } from './helm_chart.js';

// Turns a ChartRef into the CLI args helm itself expects wherever a chart
// reference is a valid argument (install/upgrade/template/show, and
// internally for pull). The one place this logic used to live twice
// (chart_source.ts's pullChart call sites) - now the single source of
// truth for it.
export function chartRefToArgs(chart: ChartRef): string[] {
  switch (chart.kind) {
    case 'local-directory':
    case 'local-archive':
      return [chart.path];
    case 'url':
    case 'oci':
      return [chart.ref];
    case 'reference':
      return chart.repo ? [chart.name, '--repo', chart.repo] : [chart.name];
  }
}
