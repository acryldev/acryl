# 013 plan

Each phase ends green (`pnpm run check`), committed and pushed.

1. **P1 TypeScript on Node, library shape.** `plugins/{instance,http,server}` with `plugin.json`; templates `app` and
   `agent` in TypeScript (`node:http`, `node:test`); the CLI copies listed library plugins; `aimbrace add`.
2. **P2 Settings.** Port `acryl-settings` as `plugins/settings`, with its merge rules and tests.
3. **P3 Extensions.** Port lint, staging with content hash and fresh import, settle and report, rollback to the previous
   version, remove, list, reload, startup pass with trust rules, ledger.
4. **P4 Builder and agent.** `plugins/agent` (model, tools, memory, agent) and `plugins/builder`; the scripted model
   builds a plugin; verify proves install, update, refused update with the previous version kept, removal, restart.
5. **P5 Manifest.** `plugins/manifest` and `aimbrace.yaml` composition; lock with digests.
6. **P6 Save.** Secret scan and git commit; `aimbrace save`.
7. **P7 Docs.** One page per plugin, the getting-started page, and the agent's plugin-writing guide.

## Cordis mini-design (per ACRYL's protocol)

| Plugin | Provides / consumes | Effects and disposal | Config | Events |
|---|---|---|---|---|
| `instance` | provides `appInstance` (value) | none | the instance object is passed by `main.ts` | none |
| `http` | provides `http` (router) | routes registered inside `ctx.effect` by their owners | none | none |
| `server` | injects `http`; provides `server` (url) | the listener, closed by the disposer returned from `apply` | `{ port, hostname }` as plugin config | none |
| `settings` | injects `appInstance`; provides `settings` | settles pending writes on dispose | `{ filename }` | `settings/updated` (emit) |
| `extensions` | injects `appInstance`; provides `extensions` | one child fiber per installed extension, disposed on remove, update and app stop | `{ dir, globalDir? }` | `extensions/changed` (emit) |
| `builder` | injects `extensions`, `tools` | none | none | none |
| `manifest` | none at run time: `app.ts` reads the manifest and mounts its rows | each row is one fiber | the manifest file | none |

Verification per plugin: a real `Context`, mount and dispose, repeated mount, provider replacement where it applies,
and a leak check (no open handles after dispose: `node --test` reports them).
