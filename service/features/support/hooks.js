import { After } from "@cucumber/cucumber";
import { rm } from "node:fs/promises";
import { stopServer } from "./service_process.js";

After(async function () {
  await stopServer(this.serverProcess);
  for (const dir of this.tempDirs ?? []) {
    await rm(dir, { recursive: true, force: true });
  }
});
