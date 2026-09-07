import { setWorldConstructor, World as CucumberWorld, IWorldOptions } from '@cucumber/cucumber';
import { Directory } from './aliases/directory.js';
import { ChartFile } from './aliases/file.js';
import { OciArtifact } from './aliases/oci_artifact.js';
import { ChartUrl } from './aliases/url.js';
import { HelmChart } from './helm/helm_chart.js';
import { HelmRepo } from './helm/helm_repo.js';
import { CommandResult } from './run_command.js';

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
