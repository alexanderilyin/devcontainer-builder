import { DataTable } from '@cucumber/cucumber';
import { discoverByLabels, K8sObjectRef } from './discover.js';

export type Pod = K8sObjectRef;

export function podFromTable(dataTable: DataTable): Pod {
  return discoverByLabels('pod', dataTable);
}
