import jmespath from 'jmespath';

// jmespath.search returns `null` for "not found" (a JMESPath convention),
// not `undefined` - normalize so the `undefined` assertCondition works the
// same whether the value came from a flat parsed-YAML lookup or a JMESPath
// expression.
export function query(data: unknown, expression: string): unknown {
  const result = jmespath.search(data, expression);
  return result === null ? undefined : result;
}
