interface CheckResult {
  pass: boolean;
  reason: string;
}

function check(actual: unknown, condition: string, expected: string): CheckResult {
  const actualString = String(actual);
  switch (condition) {
    case 'undefined':
      return actual === undefined
        ? { pass: true, reason: '' }
        : { pass: false, reason: `expected field to be undefined, got "${actualString}"` };
    case 'equals':
      return actualString === expected
        ? { pass: true, reason: '' }
        : { pass: false, reason: `expected "${expected}", got "${actualString}"` };
    case 'contains':
      return actualString.includes(expected)
        ? { pass: true, reason: '' }
        : { pass: false, reason: `expected "${actualString}" to contain "${expected}"` };
    case 'icontains':
      return actualString.toLowerCase().includes(expected.toLowerCase())
        ? { pass: true, reason: '' }
        : { pass: false, reason: `expected "${actualString}" to contain "${expected}" (case-insensitive)` };
    case 'not_equals':
      return actualString !== expected
        ? { pass: true, reason: '' }
        : { pass: false, reason: `expected value to not equal "${expected}", but it did` };
    default:
      return { pass: false, reason: `unknown condition "${condition}" (known conditions: equals, contains, icontains, undefined, not_equals)` };
  }
}

// "not_equals" is the one condition where an array check must be universal
// (every element must satisfy it - none may equal the forbidden value)
// rather than existential (at least one matches) - it's a negation, so the
// quantifier has to flip too.
const UNIVERSAL_CONDITIONS = new Set(['not_equals']);

// The boolean-only half of condition-checking, shared by assertCondition
// (below, which throws with a detailed message) and the polling mechanism
// in support/poll.ts (which needs a plain true/false every tick, not an
// exception) - one implementation of "does this actually hold", not two.
export function conditionHolds(actual: unknown, condition: string, expected: string): boolean {
  if (Array.isArray(actual)) {
    const results = actual.map((value) => check(value, condition, expected));
    return UNIVERSAL_CONDITIONS.has(condition) ? results.every((r) => r.pass) : results.some((r) => r.pass);
  }
  return check(actual, condition, expected).pass;
}

// Builds its own message rather than relying on node:assert's automatic
// actual/expected diff rendering, which doesn't identify which table row
// (KEY) failed and can end up showing an unhelpful boolean diff instead of
// the values actually being compared. When `actual` is an array (a
// JMESPath wildcard projection like "[*].name"), the check is existential
// - it passes if *any* element matches - but a failure still lists why
// *every* element failed, never collapsing to a bare true/false.
export function assertCondition(key: string, actual: unknown, condition: string, expected: string, source: Record<string, unknown>): void {
  const fail = (reason: string) => {
    throw new Error(`${reason}\n${formatAvailableFields(source)}`);
  };

  if (Array.isArray(actual)) {
    const results = actual.map((value) => check(value, condition, expected));
    const universal = UNIVERSAL_CONDITIONS.has(condition);
    const overallPass = universal ? results.every((r) => r.pass) : results.some((r) => r.pass);
    if (!overallPass) {
      const relevant = universal ? results.filter((r) => !r.pass) : results;
      const verb = universal ? 'at least one element violated' : 'no element satisfied';
      const detail = relevant.length === 0 ? '  (the list was empty)' : relevant.map((r) => `  - ${r.reason}`).join('\n');
      fail(`"${key}": ${verb} "${condition} ${expected}" (checked ${results.length}):\n${detail}`);
    }
    return;
  }

  const result = check(actual, condition, expected);
  if (!result.pass) {
    fail(`"${key}": ${result.reason}`);
  }
}

const MAX_VALUE_LENGTH = 80;

function formatAvailableFields(source: Record<string, unknown>): string {
  const lines = Object.entries(source).map(([k, v]) => {
    let rendered = typeof v === 'string' ? v : JSON.stringify(v);
    if (rendered.length > MAX_VALUE_LENGTH) {
      rendered = `${rendered.slice(0, MAX_VALUE_LENGTH)}...`;
    }
    return `  ${k}: ${rendered}`;
  });
  return `Available fields:\n${lines.join('\n')}`;
}
