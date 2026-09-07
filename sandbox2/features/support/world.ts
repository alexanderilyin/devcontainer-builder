import { setWorldConstructor, World as CucumberWorld, IWorldOptions } from '@cucumber/cucumber';
import { Directory } from './directory.js';
import { ChartFile } from './file.js';
import { HelmChart } from './helm_chart.js';
import { HelmRepo } from './helm_repo.js';
import { OciArtifact } from './oci_artifact.js';
import { CommandResult } from './run_command.js';
import { ChartUrl } from './url.js';

export class World extends CucumberWorld {
  charts = new Map<string, HelmChart>();
  repos = new Map<string, HelmRepo>();
  directories = new Map<string, Directory>();
  files = new Map<string, ChartFile>();
  urls = new Map<string, ChartUrl>();
  ociArtifacts = new Map<string, OciArtifact>();
  lastError?: Error;
  lastCommandResult?: CommandResult;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(World);
