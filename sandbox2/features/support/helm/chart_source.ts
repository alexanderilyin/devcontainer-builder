import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ChartRef } from './helm_chart.js';
import { chartRefToArgs } from './chart_ref_args.js';

function readChartYamlFromArchive(archivePath: string): string {
  // No network needed - shell out to `tar` rather than add a JS tar
  // dependency for one narrow use case, matching this repo's preference
  // for real CLI commands over bespoke JS abstractions.
  const listing = execFileSync('tar', ['tzf', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = listing.split('\n').find((line) => line.trim().endsWith('/Chart.yaml'));
  if (!entry) {
    throw new Error(`No Chart.yaml found inside archive "${archivePath}"`);
  }
  return execFileSync('tar', ['-xzO', '-f', archivePath, entry.trim()], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// `helm pull` has no cache of its own - every call re-downloads the
// tarball, even for an identical ref. Cache the untarred result ourselves,
// keyed by the exact pull args, in a directory that persists across test
// runs (unlike a per-call tmpdir) so incremental runs skip the network
// entirely once a given ref has been pulled once. This is a real cache of
// a real download, not a stub - the first pull for any given ref is still
// a genuine `helm pull`.
const PULL_CACHE_DIR = path.join(process.cwd(), '.cache', 'helm-pulls');

function findChartYaml(dir: string): string | undefined {
  if (!fs.existsSync(dir)) {
    return undefined;
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, 'Chart.yaml'))
    .find((p) => fs.existsSync(p));
}

// Real `helm pull` - a repo/OCI registry fetch, not a fake/stubbed response.
// Covers `url` and `oci` refs directly (both are valid positional args to
// `helm pull`) and `reference` refs either self-contained ("repo-alias/name",
// which only works if that alias is already registered via `helm repo add`)
// or paired with an explicit `--repo <url>` (form 5, which needs no
// pre-registered alias).
function pullChart(pullArgs: string[]): string {
  const cacheKey = createHash('sha256').update(pullArgs.join(' ')).digest('hex').slice(0, 16);
  const cacheDir = path.join(PULL_CACHE_DIR, cacheKey);

  const cached = findChartYaml(cacheDir);
  if (cached) {
    return fs.readFileSync(cached, 'utf8');
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  execFileSync('helm', ['pull', ...pullArgs, '--untar', '-d', cacheDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // `helm pull --untar` on a URL source leaves an extra empty directory
  // named after the downloaded .tgz alongside the real chart directory
  // (observed on Helm v3.21.4) - look for whichever directory actually
  // has a Chart.yaml rather than assuming there's only one directory.
  const chartYamlPath = findChartYaml(cacheDir);
  if (!chartYamlPath) {
    throw new Error(`\`helm pull\` did not produce a directory containing Chart.yaml (in ${cacheDir})`);
  }
  return fs.readFileSync(chartYamlPath, 'utf8');
}

export function readChartYaml(chart: ChartRef): string {
  switch (chart.kind) {
    case 'local-directory':
      return fs.readFileSync(path.join(chart.path, 'Chart.yaml'), 'utf8');
    case 'local-archive':
      return readChartYamlFromArchive(chart.path);
    case 'url':
    case 'oci':
    case 'reference':
      return pullChart(chartRefToArgs(chart));
  }
}
