import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { buildDevcontainer } from "./build.js";
import type { BuildRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 8080);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function isValidBuildRequest(value: unknown): value is BuildRequest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.repository !== "string" || v.repository.length === 0) return false;
  if (typeof v.branch !== "string" || v.branch.length === 0) return false;

  if (typeof v.image !== "object" || v.image === null) return false;
  const image = v.image as Record<string, unknown>;
  if (typeof image.registry !== "string" || image.registry.length === 0) return false;
  if (typeof image.name !== "string" || image.name.length === 0) return false;
  if (typeof image.tag !== "string" || image.tag.length === 0) return false;

  if (v.gitCredentials !== undefined) {
    if (typeof v.gitCredentials !== "object" || v.gitCredentials === null) return false;
    const creds = v.gitCredentials as Record<string, unknown>;
    if (typeof creds.username !== "string" || typeof creds.token !== "string") return false;
  }

  return true;
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (req.method !== "POST" || req.url !== "/build") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "invalid JSON body" });
    return;
  }

  if (!isValidBuildRequest(payload)) {
    sendJson(res, 400, {
      error: "missing or invalid fields: repository, branch, image.{registry,name,tag}",
    });
    return;
  }

  try {
    const image = await buildDevcontainer(payload);
    sendJson(res, 200, { image });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : "build failed" });
  }
});

server.listen(PORT, () => {
  console.log(`devcontainer-builder listening on :${PORT}`);
});
