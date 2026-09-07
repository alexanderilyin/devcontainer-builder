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

// Empties a Directory's contents for real (except .gitkeep, which exists
// solely so a downloads-style directory can be committed empty and still
// pass the existence check above on a fresh checkout). Used to restore a
// genuine "nothing downloaded yet" precondition before a scenario, rather
// than asserting on state left over from a previous run.
export function purgeDirectory(dir: Directory): void {
  for (const entry of fs.readdirSync(dir.path)) {
    if (entry === '.gitkeep') {
      continue;
    }
    fs.rmSync(`${dir.path}/${entry}`, { recursive: true, force: true });
  }
}
