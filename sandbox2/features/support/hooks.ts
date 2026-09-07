import { execFileSync } from 'node:child_process';
import { BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';

// cucumber-js's own default step timeout (5000ms) is far shorter than a
// legitimate real poll used elsewhere in this suite (up to 2m, for the
// bad-image fast-fail scenario in features/k8s/kubernetes.feature) - a
// latent bug since the polling mechanism (support/poll.ts) was added,
// which never surfaced because every poll happened to resolve on its
// very first tick (Deployment/Service are already stable via --atomic
// before discovery runs, so the first check always passed immediately).
// The first scenario whose poll genuinely needs multiple real ticks
// before succeeding (features/rest/health.feature's readiness-flip
// scenario, which needs several real seconds for the readiness probe to
// actually fail) hit cucumber-js's own timeout mid-poll, well before
// pollUntil's own internal timeout (an explicit, per-step "for up to
// {string}" value) was ever reached. Raised well past the longest real
// poll timeout anywhere in this suite - pollUntil's own timeout stays
// the real, meaningful bound; this just has to not fire first.
setDefaultTimeout(5 * 60 * 1000);

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
