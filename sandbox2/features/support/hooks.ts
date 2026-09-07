import { execFileSync } from 'node:child_process';
import { BeforeAll } from '@cucumber/cucumber';

// Regenerates charts/nginx-0.1.0.tgz fresh from charts/nginx/ before every
// run (real `helm package`, not a stub) - a previous version of this file
// was manually packaged once and never re-synced, so "Local Archive Chart"
// could silently test stale content after any edit to the chart source.
// This makes drift impossible: the archive is always exactly what the
// current source would produce. If Chart.yaml's version ever changes, the
// output filename changes too (helm names it <chart>-<version>.tgz) - a
// scenario referencing the old filename will fail loudly instead of
// silently reading stale content.
BeforeAll(function () {
  execFileSync('helm', ['package', 'charts/nginx', '-d', 'charts'], { stdio: ['ignore', 'pipe', 'pipe'] });
});
