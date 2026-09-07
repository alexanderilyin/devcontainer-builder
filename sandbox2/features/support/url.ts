import { DataTable } from '@cucumber/cucumber';

const KNOWN_FIELDS = ['value'] as const;

// Named "ChartUrl" internally (not "URL") to avoid shadowing Node/TS's own
// global URL type - which this class's own validation needs to use for
// real. The Gherkin-facing step text still says exactly "URL known as ...".
export class ChartUrl {
  readonly value: string;

  constructor(fields: Record<string, string>) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`URL has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.value) {
      throw new Error('URL requires a "value" field');
    }
    let parsed: URL;
    try {
      parsed = new URL(fields.value);
    } catch {
      throw new Error(`URL is not well-formed: "${fields.value}"`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`URL must be http(s): "${fields.value}"`);
    }
    this.value = fields.value;
  }
}

export function chartUrlFromTable(dataTable: DataTable): ChartUrl {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  return new ChartUrl(fields);
}
