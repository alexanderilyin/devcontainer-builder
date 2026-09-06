import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..", "..");
const serverEntry = path.join(serviceRoot, "dist", "server.js");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Spawns the actual compiled server (`npm run build` must have already run)
// as a real child process listening on a free port, so tests talk to it over
// real HTTP rather than importing it in-process - env vars like
// BUILDKIT_ENDPOINT are only read once at module load, so a fresh process
// per scenario is the only way to vary them between scenarios. Rejects if
// the process exits before it starts listening (e.g. a startup config
// error) - capturedStdout/capturedStderr stay populated on the returned
// process for the rest of the scenario's lifetime, so later steps can
// assert on log output (e.g. a skipped-invalid-config-entry warning).
export async function startServer(envOverrides, cliArgs = []) {
  const port = await getFreePort();
  const env = { ...process.env, PORT: String(port) };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  const child = spawn("node", [serverEntry, ...cliArgs], {
    cwd: serviceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.capturedStdout = "";
  child.capturedStderr = "";
  child.stdout.on("data", (chunk) => {
    child.capturedStdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.capturedStderr += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    const onStdoutForReady = (chunk) => {
      if (chunk.toString().includes("listening on")) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`service process exited before listening (code ${code}): ${child.capturedStderr}`));
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      child.stdout.off("data", onStdoutForReady);
      child.off("exit", onExit);
      child.off("error", onError);
    }
    child.stdout.on("data", onStdoutForReady);
    child.on("exit", onExit);
    child.on("error", onError);
  });

  return { process: child, port, baseUrl: `http://127.0.0.1:${port}` };
}

export function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}
