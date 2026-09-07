import fs from 'node:fs';
import { DataTable } from '@cucumber/cucumber';

const KNOWN_FIELDS = ['path'] as const;

export class Directory {
  readonly path: string;

  constructor(fields: Record<string, string>) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`Directory has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.path) {
      throw new Error('Directory requires a "path" field');
    }
    if (!fs.existsSync(fields.path) || !fs.statSync(fields.path).isDirectory()) {
      throw new Error(`Directory does not exist: "${fields.path}"`);
    }
    this.path = fields.path;
  }
}

export function directoryFromTable(dataTable: DataTable): Directory {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  return new Directory(fields);
}
