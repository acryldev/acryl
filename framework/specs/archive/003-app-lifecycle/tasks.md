# Tasks: App, Context, Scope and lifecycle

- [x] T301 New error classes
- [x] T302 `internal/cordis.ts` wrapper plus Cordis compatibility test (fiber state numbers, pending, reactivation, isolate)
- [x] T303 `internal/kernel.ts`
- [x] T304 `lifetime.ts` (`Lifetime`, `ScopeImpl`) with scope tests
- [x] T305 `plugin-runtime.ts` (activation, start, stop, dispose, installer)
- [x] T306 `app.ts` (`createApp`, start, stop, rollback, install, snapshots, probe)
- [x] T307 Lifecycle test suite (order, rollback, leaks, errors)
- [x] T308 Registry and hook integration tests
- [x] T309 Reactivation and provider replacement tests
- [x] T310 Dynamic, nested install and isolation tests
- [x] T311 Boundary test: only `internal/cordis.ts` imports `cordis`
- [x] T312 `pnpm run check` green; checkpoint pushed

## Findings during implementation

- **Unawaited service removal** (R8): found because vitest reports unhandled rejections; fixed by awaiting the removal inside the plugin resource stack.
- **Bookkeeping per provider, not per name**: a first version keyed live providers by service name, which would have broken two isolated subtrees providing the same service. Dynamic validation now asks Cordis whether a service is visible from the target context instead of keeping its own table.
- **Exports**: the new error classes were missing from `index.ts` after a failed scripted edit; the lifecycle tests caught it (`instanceof` against `undefined`).
- **Abort timing**: `stop()` now aborts the app signal synchronously, before any hook runs.
- **Blame in nested failures**: a failing nested plugin is reported as the failing plugin (`PluginError.plugin` is the child), not as its parent.
- Scope-local values are a plain chain (R7).
