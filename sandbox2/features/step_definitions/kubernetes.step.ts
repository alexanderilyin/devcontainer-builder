import { DataTable, Given, When } from '@cucumber/cucumber';
import { World } from '../support/world.js';
import { Deployment, deploymentFromTable } from '../support/k8s/deployment.js';
import { Service, serviceFromTable } from '../support/k8s/service.js';
import { Pod, podFromTable } from '../support/k8s/pod.js';
import { K8sObjectRef } from '../support/k8s/discover.js';
import { buildArgs, CommandResult, runCommand } from '../support/run_command.js';
import { attempt } from '../support/attempt.js';
import { parseDuration, pollUntil } from '../support/poll.js';
import { query } from '../support/query.js';

Given('Deployment known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.deployments.set(alias, deploymentFromTable(dataTable));
});

When('I attempt to define Deployment known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.deployments.set(alias, deploymentFromTable(dataTable));
  });
});

Given('Service known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.services.set(alias, serviceFromTable(dataTable));
});

When('I attempt to define Service known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.services.set(alias, serviceFromTable(dataTable));
  });
});

Given('Pod known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  this.pods.set(alias, podFromTable(dataTable));
});

When('I attempt to define Pod known as {string}:', function (this: World, alias: string, dataTable: DataTable) {
  return attempt(this, () => {
    this.pods.set(alias, podFromTable(dataTable));
  });
});

function getDeployment(world: World, alias: string): Deployment {
  const deployment = world.deployments.get(alias);
  if (!deployment) {
    throw new Error(`No Deployment registered as "${alias}"`);
  }
  return deployment;
}

function getService(world: World, alias: string): Service {
  const service = world.services.get(alias);
  if (!service) {
    throw new Error(`No Service registered as "${alias}"`);
  }
  return service;
}

function getPod(world: World, alias: string): Pod {
  const pod = world.pods.get(alias);
  if (!pod) {
    throw new Error(`No Pod registered as "${alias}"`);
  }
  return pod;
}

// The three verb shapes (get/events/logs) all reduce to
// "kubectl <verb...> -n <namespace> [...]" over a ref's name/namespace -
// centralized here once, taking plain argv (`extraArgs`) rather than a
// DataTable, so both the one-shot `get`/`events`/`logs` steps below
// (which derive extraArgs from a real OPTION|VALUE table via buildArgs)
// and the polling functions further down (which pass a small fixed argv
// of their own, e.g. `['-o', 'json']`) go through the exact same argv
// construction - one implementation of each real command shape, not two.
//
// `kind` is always passed lowercase (kubectl's own CLI convention, e.g.
// "deployment") - kubectlEvents capitalizes it itself for the
// `involvedObject.kind` field-selector value, which needs the exact
// capitalized Kind (`Deployment`), so callers never have to remember to
// pass two different casings for the same type.
function capitalize(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function kubectlGet(ref: K8sObjectRef, kind: string, extraArgs: string[]): CommandResult {
  return runCommand('kubectl', ['get', kind, ref.name, '-n', ref.namespace, ...extraArgs]);
}

function kubectlEvents(ref: K8sObjectRef, kind: string, extraArgs: string[]): CommandResult {
  return runCommand('kubectl', [
    'get',
    'events',
    '-n',
    ref.namespace,
    '--field-selector',
    `involvedObject.name=${ref.name},involvedObject.kind=${capitalize(kind)}`,
    ...extraArgs,
  ]);
}

function kubectlLogs(ref: K8sObjectRef, kind: string, extraArgs: string[]): CommandResult {
  return runCommand('kubectl', ['logs', `${kind}/${ref.name}`, '-n', ref.namespace, ...extraArgs]);
}

When('I get Deployment known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlGet(getDeployment(this, alias), 'deployment', buildArgs(table));
});

When('I get events for Deployment known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlEvents(getDeployment(this, alias), 'deployment', buildArgs(table));
});

When('I get logs for Deployment known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlLogs(getDeployment(this, alias), 'deployment', buildArgs(table));
});

When('I get Service known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlGet(getService(this, alias), 'service', buildArgs(table));
});

When('I get events for Service known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlEvents(getService(this, alias), 'service', buildArgs(table));
});

When('I get Pod known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlGet(getPod(this, alias), 'pod', buildArgs(table));
});

When('I get events for Pod known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlEvents(getPod(this, alias), 'pod', buildArgs(table));
});

When('I get logs for Pod known as {string} with:', function (this: World, alias: string, table: DataTable) {
  this.lastCommandResult = kubectlLogs(getPod(this, alias), 'pod', buildArgs(table));
});

// --- Polling: for state that isn't guaranteed stable the instant it's
// discovered (a Pod, unlike a Deployment/Service already stabilized by
// `--atomic` before discovery runs). Every tick re-runs the real command
// (never re-checks stale data), succeeds the moment every `pass` row
// holds, fails immediately the moment any `fail` row holds (no need to
// exhaust the timeout on a state that's already terminal-bad), and only
// times out when the state is genuinely still pending.

function pollStructured(world: World, intervalStr: string, timeoutStr: string, table: DataTable, run: () => CommandResult): Promise<void> {
  const rows = table.hashes();
  return pollUntil(parseDuration(intervalStr), parseDuration(timeoutStr), () => {
    const result = run();
    world.lastCommandResult = result;
    const parsed = result.EXIT_CODE === '0' ? JSON.parse(result.STDOUT) : undefined;
    return {
      rows: rows.map((r) => ({
        label: r.KEY,
        actual: parsed === undefined ? undefined : query(parsed, r.KEY),
        condition: r.CONDITION,
        expected: r.VALUE,
        outcome: r.OUTCOME as 'pass' | 'fail',
      })),
      snapshot: result.STDOUT || result.STDERR,
    };
  });
}

function pollRawText(world: World, intervalStr: string, timeoutStr: string, table: DataTable, run: () => CommandResult): Promise<void> {
  const rows = table.hashes();
  return pollUntil(parseDuration(intervalStr), parseDuration(timeoutStr), () => {
    const result = run();
    world.lastCommandResult = result;
    return {
      rows: rows.map((r) => ({
        label: r.SOURCE,
        actual: result[r.SOURCE as 'STDOUT' | 'STDERR'],
        condition: r.CONDITION,
        expected: r.VALUE,
        outcome: r.OUTCOME as 'pass' | 'fail',
      })),
      snapshot: result.STDOUT || result.STDERR,
    };
  });
}

function pollPodStatus(world: World, pod: Pod, interval: string, timeout: string, table: DataTable): Promise<void> {
  return pollStructured(world, interval, timeout, table, () => kubectlGet(pod, 'pod', ['-o', 'json']));
}

When('I poll Pod known as {string} every {string} for up to {string} until:', function (this: World, alias: string, interval: string, timeout: string, table: DataTable) {
  return pollPodStatus(this, getPod(this, alias), interval, timeout, table);
});

When('I attempt to poll Pod known as {string} every {string} for up to {string} until:', function (this: World, alias: string, interval: string, timeout: string, table: DataTable) {
  const pod = getPod(this, alias);
  return attempt(this, () => pollPodStatus(this, pod, interval, timeout, table));
});

When('I poll logs for Pod known as {string} every {string} for up to {string} until:', function (this: World, alias: string, interval: string, timeout: string, table: DataTable) {
  const pod = getPod(this, alias);
  return pollRawText(this, interval, timeout, table, () => kubectlLogs(pod, 'pod', []));
});

When('I poll events for Pod known as {string} every {string} for up to {string} until:', function (this: World, alias: string, interval: string, timeout: string, table: DataTable) {
  const pod = getPod(this, alias);
  return pollRawText(this, interval, timeout, table, () => kubectlEvents(pod, 'pod', []));
});
