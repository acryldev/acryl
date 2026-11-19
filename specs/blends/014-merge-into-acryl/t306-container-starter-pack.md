# T306 - container starter pack

`aimbrace init --agent` writes a `Dockerfile` (node 24 slim, non-root, data in `/data`) and a `.dockerignore`. The one code change: `AIMBRACE_HOST` (read only in `selectInstance`) sets the interface; without it the app listens on loopback as before.

Verified 2026-10-12 with a real DeepSeek model in a container:
1. `docker run -p ...:3100 -v data:/data -e AIMBRACE_MODEL_*` served `GET /` and `/health`.
2. `POST /ask` made the agent write and install a `clock` plugin (`list_plugins > write_plugin > install_plugin`); `GET /time` answered.
3. `docker restart`: `/time` still answered, the plugin `active`.
4. `docker rm` and a new container on the same volume: `/time` still answered from the staged copy in `/data`, and `/extensions` reports `stale: true` because the editable source in `/app/extensions` is gone.

Findings for the hosting layer:
- The running copy lives in the volume; the editable source does not. For a per-user container, `extensions/` (the builder's folder) should also sit under `/data`, or a later agent session cannot edit the plugin it wrote. Not changed here: it is an app layout choice (`app.ts` puts it under the project root) and wants the WebBoxes owner's view.
- The gate in a container has no human at a terminal: the extensions row's `approval` parameter (trust `ask`) is the hook for a web UI, and is the same open item as T304.
- Network is not isolated (Node 24 permission model has none); the container's own network policy has to do it.
