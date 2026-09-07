import { DataTable } from '@cucumber/cucumber';
import { discoverByLabels, K8sObjectRef } from './discover.js';

export type Service = K8sObjectRef;

export function serviceFromTable(dataTable: DataTable): Service {
  return discoverByLabels('service', dataTable);
}
