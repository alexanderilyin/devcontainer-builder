"""sandbox2 rest-api test fixture.

A real FastAPI app, not a stub - deployed via ../templates/deployment.yaml
(source mounted from a ConfigMap, dependencies installed at pod startup)
and exercised by sandbox2's HTTP BDD steps. Phase 1 covered the 3 k8s
health-probe endpoints (see ../../../features/rest/health.feature);
Phase 2 adds /files and /notes CRUD (notes.py, files.py - see
../../../features/rest/notes.feature and files.feature); auth (/users,
/auth, /oauth) lands in Phase 3 as more .py files here (auto-picked up by
../templates/configmap.yaml's Files.Glob, no chart change needed).
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response

import files
import notes
import oauth
import secure
import users

# In-memory only, deliberately - this is a disposable test fixture (same
# spirit as charts/test-registry's emptyDir storage), not something that
# needs to survive a pod restart.
_state = {"started": False, "ready": True}


async def _mark_started_after_delay() -> None:
    # Makes /health/startup genuinely false-then-true instead of trivially
    # always 200 - lets a scenario actually observe the startupProbe
    # blocking readiness/liveness checks until this really completes.
    await asyncio.sleep(5)
    _state["started"] = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_mark_started_after_delay())
    yield
    task.cancel()


app = FastAPI(title="sandbox2 rest-api test fixture", lifespan=lifespan)
app.include_router(notes.router)
app.include_router(files.router)
app.include_router(users.router)
app.include_router(oauth.router)
app.include_router(secure.router)


@app.get("/health/startup")
def health_startup(response: Response) -> dict:
    if not _state["started"]:
        response.status_code = 503
    return {"started": _state["started"]}


@app.get("/health/ready")
def health_ready(response: Response) -> dict:
    if not _state["ready"]:
        response.status_code = 503
    return {"ready": _state["ready"]}


@app.get("/health/live")
def health_live() -> dict:
    # Always healthy in Phase 1 - no state exists yet whose corruption
    # would represent a genuine, restart-worthy deadlock.
    return {"live": True}


@app.put("/_test/ready")
def set_ready(ready: bool) -> dict:
    # Deliberate, non-production test-control endpoint - the only way to
    # make readiness (vs. liveness) failure actually observable end to
    # end: a real k8s readiness failure removes the Pod from Service
    # endpoints without restarting it, which a BDD scenario can only
    # witness for real if something can flip readiness false on demand.
    # `ready` is a query param (not a JSON body field) specifically so a
    # plain `true`/`false` string round-trips through FastAPI's own
    # query-bool coercion correctly - this framework's HTTP request table
    # always sends body FIELD values as strings, which would otherwise
    # need real JSON boolean typing this app doesn't need to support yet.
    _state["ready"] = ready
    return {"ready": _state["ready"]}
