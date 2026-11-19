# Tasks: Testing package and CLI

- [x] T701 core `App.validate()` (done in core, tests added)
- [x] T702 `@aimbrace/testing` with tests (including a deliberate leak)
- [x] T703 `@aimbrace/cli` Commands registry, io, args, `runCli`
- [x] T704 built-in commands: graph, check, run, plugins, init, commands
- [x] T705 CLI tests through `runCli` and one subprocess test of the built bin
- [x] T706 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- **Hook observers were blind to fire-and-forget hooks.** `kernel.emit` skipped hooks nobody had registered, which also hid `service:provide`, `scope:*` and `registry:change` from `beforeEach` spies. Found by the first `recordHooks` test. `Hooks` now tracks observers (`observed()`, counted by `count()`, removed by `clear()`), and `emit` fires when an observer exists.
- `App.validate()` was added to core so `aimbrace check` can validate the graph and every config without running any `setup`.
- `startTestApp` returns `{ app, hooks }` rather than a derived app object: `AppImpl` uses private fields, so a prototype-derived wrapper cannot call its methods.
- `runCli` never calls `process.exit`, takes `io.signal` for `run`, and returns 0, 1 or 2; the thin `bin/aimbrace.js` sets `process.exitCode`.
- Custom commands run inside a scope of the started app, so `ctx.scope.get(Service)` reads real services, and the app is stopped afterwards even when the command throws.
