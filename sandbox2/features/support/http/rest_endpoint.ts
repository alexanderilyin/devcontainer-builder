import { DataTable } from '@cucumber/cucumber';
import { Service } from '../k8s/service.js';

const KNOWN_FIELDS = ['service', 'port'] as const;

export class RestEndpoint {
  // NOT a string alias like Directory/File/URL/OCIArtifact - a real
  // Service object, for the same reason Release.chart is: the base URL
  // needs the Service's real .name/.namespace (already known-real via
  // the k8s/discover.ts label-selector mechanism), not a string that's
  // already lost that structure.
  readonly baseUrl: string;

  constructor(fields: Record<string, string>, service: Service) {
    for (const key of Object.keys(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new Error(`RestEndpoint has no field "${key}" (known fields: ${KNOWN_FIELDS.join(', ')})`);
      }
    }
    if (!fields.port) {
      throw new Error('RestEndpoint requires a "port" field');
    }
    if (!/^\d+$/.test(fields.port)) {
      throw new Error(`RestEndpoint "port" must be a positive integer: "${fields.port}"`);
    }
    this.baseUrl = `http://${service.name}.${service.namespace}.svc.cluster.local:${fields.port}`;
  }
}

export function restEndpointFromTable(dataTable: DataTable, resolveService: (alias: string) => Service | undefined): RestEndpoint {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  if (!fields.service) {
    throw new Error('RestEndpoint requires a "service" field');
  }
  const service = resolveService(fields.service);
  if (!service) {
    throw new Error(`No Service registered as "${fields.service}"`);
  }
  return new RestEndpoint(fields, service);
}
