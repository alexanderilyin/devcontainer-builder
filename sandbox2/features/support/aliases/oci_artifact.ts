import { DataTable } from '@cucumber/cucumber';

const KNOWN_FIELDS = ['ref'] as const;

export class OciArtifact {
  readonly ref: string;

  constructor(fields: Record<string, string>) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`OCIArtifact has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.ref) {
      throw new Error('OCIArtifact requires a "ref" field');
    }
    if (!fields.ref.startsWith('oci://')) {
      throw new Error(`OCIArtifact ref must start with "oci://": "${fields.ref}"`);
    }
    this.ref = fields.ref;
  }
}

export function ociArtifactFromTable(dataTable: DataTable): OciArtifact {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  return new OciArtifact(fields);
}
