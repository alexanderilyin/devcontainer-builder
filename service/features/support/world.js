import { setWorldConstructor, World } from "@cucumber/cucumber";

export class DevcontainerBuilderWorld extends World {
  constructor(options) {
    super(options);
    this.envOverrides = {};
    this.namedFiles = {};
    this.tempDirs = [];
    this.serverProcess = undefined;
    this.baseUrl = undefined;
    this.startupError = undefined;
    this.response = undefined;
  }
}

setWorldConstructor(DevcontainerBuilderWorld);
