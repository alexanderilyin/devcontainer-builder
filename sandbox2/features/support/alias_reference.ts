export function isAliasReference(value: string): boolean {
  return value.startsWith('<') && value.endsWith('>');
}
