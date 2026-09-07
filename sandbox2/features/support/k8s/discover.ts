import { DataTable } from '@cucumber/cucumber';
import { runCommand } from '../run_command.js';

export interface K8sObjectRef {
  name: string;
  namespace: string;
}

// Unlike Directory/Release, there's no closed KNOWN_FIELDS list here -
// "namespace" is the one recognized non-label field; every other row is
// an arbitrary label key/value used to build the `-l` selector, since a
// real chart's label set isn't something this framework can enumerate in
// advance the way a fixed property set can.
//
// This runs a real `kubectl get` at construction time - but it's
// read-only, the same kind of real check Directory already does via
// fs.existsSync, just against the cluster instead of the filesystem.
export function discoverByLabels(kind: string, dataTable: DataTable): K8sObjectRef {
  const fields = Object.fromEntries(dataTable.hashes().map(({ PROPERTY, VALUE }) => [PROPERTY, VALUE]));
  const { namespace, ...labels } = fields;
  if (!namespace) {
    throw new Error(`${kind} requires a "namespace" field`);
  }
  const labelKeys = Object.keys(labels);
  if (labelKeys.length === 0) {
    throw new Error(`${kind} requires at least one label field to select a resource by`);
  }
  const selector = labelKeys.map((key) => `${key}=${labels[key]}`).join(',');

  const list = runCommand('kubectl', ['get', kind, '-n', namespace, '-l', selector, '-o', 'name']);
  if (list.EXIT_CODE !== '0') {
    throw new Error(`kubectl get ${kind} failed: ${list.STDERR}`);
  }
  const matches = list.STDOUT.split('\n').filter(Boolean);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${kind} matching "${selector}" in namespace "${namespace}", found ${matches.length}`);
  }
  // `-o name` prints "deployment.apps/foo" / "service/foo" - the name is
  // always the part after the last "/".
  return { name: matches[0].split('/').pop()!, namespace };
}
