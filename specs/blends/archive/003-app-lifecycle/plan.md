# Plan: App, Context, Scope and lifecycle

## Source layout (packages/core/src)

```text
internal/cordis.ts     the only module that imports 'cordis'
internal/kernel.ts     Kernel: Cordis root, hooks, registry store, live runtimes, providers map, ids, onError
lifetime.ts            Lifetime (BaseContext implementation), ScopeImpl
plugin-runtime.ts      PluginRuntime, PluginContextImpl, installer (install, resolveConfig)
app.ts                 createApp, App, AppState, snapshots, probe
errors.ts              + PluginError, UndeclaredAccessError, MissingServiceError, UnfulfilledProvideError,
                         DuplicateProvideError, InvalidServiceValueError, AppStateError, StartupValidationError
```

`Kernel.installer` is injected by `app.ts` so `lifetime.ts` and `plugin-runtime.ts` do not import each other (ESM class-extends cycles).

## Design decisions

1. **Plugins are fibers.** `{ name, inject: [requires], apply }` goes to `ctx.plugin`. `apply` runs our activation and never throws into Cordis (errors are captured on the runtime), so Cordis logging does not own error handling.
2. **Per-activation resources.** Each activation creates a `PluginContextImpl` with its own `DisposerStack`, `AbortController`, hook scope and registry views. A Cordis unload (provider vanished) releases it; a reload creates a new one.
3. **Release order.** Explicit dispose: run `stop` if started, release stack (LIFO), then dispose the fiber. Cordis-initiated unload: the same stack release runs from a fiber effect.
4. **Scope-local services are a plain chain, not Cordis services.** Cordis can scope a service only by isolating it before a fiber is created, which cannot express "provide a task-local value later, concurrently, in sibling scopes". Scope-local values are a small `Map` chain (scope, parent scope, ... then app services). Plugins installed into a scope still use real Cordis injection. Recorded in `research.md` R7.
5. **Install order bookkeeping.** `Kernel.installOrder` lists every runtime (root, dynamic, nested) in installation sequence, parent before child. Start iterates it forward, teardown backward.
6. **Dynamic validation.** `app.install` validates with `buildGraph([meta], { external: providedNow })` plus duplicate id, duplicate provider and peer checks against live runtimes.
7. **Failure semantics.** Start failure rolls back (stop started, dispose installed, reverse order); the original error is thrown, rollback failures go to `onError`.

## Verification

Tests use the real Cordis runtime: ordering, rollback, leak probe after every scenario, reactivation, isolation, scope disposal order, abort, concurrency of sibling scopes.
