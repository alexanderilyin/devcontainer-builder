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

export function captureHeaderFromResponse(world: World, headerName: string, alias: string): void {
  if (!world.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  const value = world.lastHttpResponse.headers[headerName.toLowerCase()];
  if (value === undefined) {
    throw new Error(`No response header named "${headerName}" was found`);
  }
  world.capturedValues.set(alias, value);
}

export function captureQueryParameterFromResponseHeader(world: World, headerName: string, parameter: string, alias: string): void {
  if (!world.lastHttpResponse) {
    throw new Error('No HTTP request has been sent yet');
  }
  const headerValue = world.lastHttpResponse.headers[headerName.toLowerCase()];
  if (headerValue === undefined) {
    throw new Error(`No response header named "${headerName}" was found`);
  }
  const value = new URL(headerValue).searchParams.get(parameter);
  if (value === null) {
    throw new Error(`No query parameter named "${parameter}" was found in response header "${headerName}"`);
  }
  world.capturedValues.set(alias, value);
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
