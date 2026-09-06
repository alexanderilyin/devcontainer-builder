import { createConnection } from "node:net";

function tcpConnects(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 2000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// `helm --wait` only confirms each pod's own readiness probe passed - it
// says nothing about whether the cluster's Service routing (kube-proxy/
// EndpointSlice propagation) has actually caught up cluster-wide yet, and
// that can lag behind pod readiness by a few seconds. Poll each fixture's
// real Service address until a raw TCP connect actually succeeds before
// declaring fixtures ready, rather than trusting helm alone.
export async function waitUntilReachable(targets, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (const { host, port } of targets) {
    for (;;) {
      if (await tcpConnects(host, port)) break;
      if (Date.now() > deadline) {
        throw new Error(`fixture at ${host}:${port} did not become reachable within ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}
