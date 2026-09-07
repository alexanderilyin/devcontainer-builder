import { World } from '../world.js';
import { query } from '../query.js';

export function captureValueFromResponse(world: World, jmespath: string, alias: string): void {
  if (!world.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  const parsed = JSON.parse(world.lastHttpResponse.body);
  const value = query(parsed, jmespath);
  if (value === undefined) {
    throw new Error(`No value found at "${jmespath}" in the last response body`);
  }
  world.capturedValues.set(alias, String(value));
}

// Scoped deliberately to capturedValues only - not merged with
// resolve_alias.ts's Directory/File/URL/OCIArtifact resolution. Mixing
// two different "what does <X> mean" systems under one syntax would be
// genuinely ambiguous (what if the same name existed in both?); a
// captured value and a Directory/File alias are different enough
// concepts that keeping them in separate, non-overlapping systems is
// clearer than unifying them.
export function substituteCapturedValues(world: World, text: string): string {
  return text.replace(/<[^<>]+>/g, (match) => {
    const value = world.capturedValues.get(match);
    if (value === undefined) {
      throw new Error(`No captured value known as "${match}"`);
    }
    return value;
  });
}
