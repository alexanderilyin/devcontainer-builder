import { conditionHolds } from './assert_condition.js';

export function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration "${value}" (expected e.g. "5s", "2m", "500ms")`);
  }
  const [, amount, unit] = match;
  const multiplier = unit === 'ms' ? 1 : unit === 's' ? 1000 : 60000;
  return Number(amount) * multiplier;
}

export interface PollRow {
  label: string;
  actual: unknown;
  condition: string;
  expected: string;
  outcome: 'pass' | 'fail';
}

// Re-invokes `evaluate` (a real command, every tick - not a cached
// re-check of the same data) until every "pass" row holds (-> success),
// any "fail" row holds (-> immediate failure, no need to exhaust the
// timeout), or the timeout elapses (-> failure, reporting the last real
// observed state so there's something to investigate).
export async function pollUntil(intervalMs: number, timeoutMs: number, evaluate: () => { rows: PollRow[]; snapshot: string }): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows, snapshot } = evaluate();
    const matchedFailRows = rows.filter((r) => r.outcome === 'fail' && conditionHolds(r.actual, r.condition, r.expected));
    if (matchedFailRows.length > 0) {
      // Leads with the matched VALUE itself (e.g. "ErrImagePull: ..."),
      // not a generic "poll failed" prefix - a scenario needs to assert
      // on *which* bad condition it actually hit, and a real Pod can
      // pass through more than one real transient bad state on the way
      // to its terminal one, so the assertion side has to accept any one
      // of several real possibilities (see "it should have failed with
      // either:" in common.step.ts).
      const detail = matchedFailRows.map((r) => `${r.expected}: "${r.label}" ${r.condition} "${r.expected}" (currently "${r.actual}")`).join('; ');
      throw new Error(`${detail}\nLast observed:\n${snapshot}`);
    }

    const passRows = rows.filter((r) => r.outcome === 'pass');
    if (passRows.length > 0 && passRows.every((r) => conditionHolds(r.actual, r.condition, r.expected))) {
      return;
    }

    if (Date.now() >= deadline) {
      const unmet = passRows.filter((r) => !conditionHolds(r.actual, r.condition, r.expected));
      throw new Error(`Poll timed out after ${timeoutMs}ms - still waiting on: ${unmet.map((r) => `"${r.label}" ${r.condition} "${r.expected}"`).join(', ')}\nLast observed:\n${snapshot}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
