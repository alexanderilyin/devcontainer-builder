import { spawnSync } from 'node:child_process';
import { DataTable } from '@cucumber/cucumber';

// OPTION | VALUE rows to argv: blank OPTION = positional; VALUE === 'True'
// = boolean flag with no value token; VALUE === 'False' = row skipped
// entirely (there's no way to pass "off" for a store-true CLI flag, so
// "False" means "don't include this flag"); anything else = --flag value.
export function buildArgs(table: DataTable): string[] {
  const args: string[] = [];
  for (const { OPTION, VALUE } of table.hashes()) {
    if (VALUE === 'False') {
      continue;
    }
    if (!OPTION) {
      args.push(VALUE);
      continue;
    }
    args.push(OPTION);
    if (VALUE !== 'True') {
      args.push(VALUE);
    }
  }
  return args;
}

export interface CommandResult {
  EXIT_CODE: string;
  STDOUT: string;
  STDERR: string;
}

// spawnSync, not execFileSync: must NOT throw on a nonzero exit code -
// the paired `Then` step asserts the exit code itself. stdio explicitly
// piped (not inherited) - same leak already fixed once for `helm pull`.
export function runCommand(command: string, args: string[]): CommandResult {
  const { stdout, stderr, status } = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    EXIT_CODE: String(status ?? ''),
    STDOUT: (stdout ?? '').trim(),
    STDERR: (stderr ?? '').trim(),
  };
}
