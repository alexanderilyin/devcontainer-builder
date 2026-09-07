import { DataTable } from '@cucumber/cucumber';
import { discoverByLabels, K8sObjectRef } from './discover.js';

export type Deployment = K8sObjectRef;

export function deploymentFromTable(dataTable: DataTable): Deployment {
  return discoverByLabels('deployment', dataTable);
}
