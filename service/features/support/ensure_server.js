import { startServer } from "./service_process.js";

// Lazily spawns the server on the first request a scenario makes, using
// whatever env has been accumulated by "configured with"/"credentials are"
// steps so far - those always run (as Givens) before any When step.
export async function ensureServerStarted(world) {
  if (!world.serverProcess) {
    const { process: proc, baseUrl } = await startServer(world.envOverrides);
    world.serverProcess = proc;
    world.baseUrl = baseUrl;
  }
  return world.baseUrl;
}
