import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildRequest } from "./types.js";

const BUILDKIT_ENDPOINT = process.env.BUILDKIT_ENDPOINT;
const BUILDX_BUILDER_NAME = process.env.BUILDX_BUILDER_NAME ?? "devcontainer-builder-remote";

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

// `docker buildx create --driver remote` talks straight to the remote
// BuildKit daemon over TCP - no local dockerd is needed. `--use` makes it
// the active builder so plain `docker build` (which the devcontainer CLI
// shells out to) is transparently routed through it.
async function ensureRemoteBuilder(): Promise<void> {
  if (!BUILDKIT_ENDPOINT) {
    throw new Error("BUILDKIT_ENDPOINT is not configured");
  }

  try {
    await run("docker", ["buildx", "inspect", BUILDX_BUILDER_NAME]);
  } catch {
    await run("docker", [
      "buildx",
      "create",
      "--name",
      BUILDX_BUILDER_NAME,
      "--driver",
      "remote",
      BUILDKIT_ENDPOINT,
    ]);
  }

  await run("docker", ["buildx", "use", BUILDX_BUILDER_NAME]);
}

// Git credentials go into a scratch `.netrc` (never argv or the remote URL)
// so they never show up in `ps` output or shell history/logs.
async function withNetrcEnv<T>(
  hostname: string,
  username: string,
  password: string,
  fn: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const scratchHome = await mkdtemp(join(tmpdir(), "git-creds-"));
  const netrcPath = join(scratchHome, ".netrc");
  await writeFile(netrcPath, `machine ${hostname}\nlogin ${username}\npassword ${password}\n`);
  await chmod(netrcPath, 0o600);

  try {
    return await fn({ ...process.env, HOME: scratchHome, GIT_TERMINAL_PROMPT: "0" });
  } finally {
    await rm(scratchHome, { recursive: true, force: true });
  }
}

export async function buildDevcontainer(req: BuildRequest): Promise<string> {
  await ensureRemoteBuilder();

  const workDir = await mkdtemp(join(tmpdir(), "devcontainer-build-"));
  const repoDir = join(workDir, "repo");
  const image = `${req.image.registry}/${req.image.name}:${req.image.tag}`;

  try {
    const cloneArgs = ["clone", "--branch", req.branch, "--single-branch", "--depth", "1", req.repository, repoDir];

    if (req.gitCredentials) {
      const hostname = new URL(req.repository).hostname;
      await withNetrcEnv(hostname, req.gitCredentials.username, req.gitCredentials.token, (env) =>
        run("git", cloneArgs, env),
      );
    } else {
      await run("git", cloneArgs, { ...process.env, GIT_TERMINAL_PROMPT: "0" });
    }

    await run("devcontainer", ["build", "--workspace-folder", repoDir, "--image-name", image, "--push"]);

    return image;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
