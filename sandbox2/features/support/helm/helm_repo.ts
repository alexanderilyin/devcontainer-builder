import { DataTable } from '@cucumber/cucumber';
import { isAliasReference } from '../aliases/alias_reference.js';

const KNOWN_FIELDS = ['name', 'url'] as const;

export class HelmRepo {
  // "name" here is the real `helm repo add <name> <url>` alias - it's what
  // a HelmChart's "reference" kind (e.g. "bitnami/nginx") expects to find
  // already registered, distinct from the World alias this object itself
  // is known as (e.g. "<BitnamiHelmRepo>").
  readonly name: string;
  readonly url: string;

  constructor(fields: Record<string, string>) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`HelmRepo has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.name) {
      throw new Error('HelmRepo requires a "name" field');
    }
    if (!fields.url) {
      throw new Error('HelmRepo requires a "url" field');
    }
    this.name = fields.name;
    this.url = fields.url;
  }
}

// Same alias-resolution shape as HelmChart's helmChartFromTable, and the
// same reason this takes a plain callback instead of World directly:
// world.ts imports HelmRepo for its `repos` map type, so importing World
// back into this module would be circular.
export function helmRepoFromTable(dataTable: DataTable, resolveAlias: (alias: string) => string | undefined): HelmRepo {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  if (fields.url && isAliasReference(fields.url)) {
    const resolved = resolveAlias(fields.url);
    if (resolved === undefined) {
      throw new Error(`No Alias registered as "${fields.url}"`);
    }
    fields.url = resolved;
  }
  return new HelmRepo(fields);
}
