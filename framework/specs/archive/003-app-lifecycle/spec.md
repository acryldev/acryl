# Feature Specification: App, Context, Scope and lifecycle on Cordis

**Milestone**: M3 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

`createApp` is the composition root. It owns a real Cordis root `Context`, the typed hook map and
the registry store. `start()` validates the graph and every plugin config, installs plugins in
topological order (each plugin is a Cordis fiber), then starts them; `stop()` reverses it.
Scopes are child fibers for tasks and calls. Everything a plugin or scope acquires is released
with it.

## User Scenarios & Testing

### User Story 1 - Start and use an app (P1)

**Acceptance Scenarios**:

1. **Given** plugins listed in reverse dependency order, **When** `app.start()`, **Then** `setup` runs dependencies first and `ctx.get(Dep)` returns the provider's value.
2. **Given** a plugin that declares `provides: [X]` but never provides it, **Then** `start()` rejects with `UnfulfilledProvideError` naming the plugin and service, and the app is rolled back.
3. **Given** `ctx.get` of a service the plugin did not declare, **Then** it throws `UndeclaredAccessError` (the runtime twin of the compile error).
4. **Given** a missing dependency or a cycle, **Then** `start()` rejects with the typed error from M2 before any `setup` ran.
5. **Given** invalid config for a plugin, **Then** `start()` rejects with `ConfigError` (issue paths included) before any `setup` ran; several problems become one `StartupValidationError`.

### User Story 2 - Deterministic lifecycle, reverse teardown, no leaks (P1)

1. **Given** a started app, **When** `stop()`, **Then** hooks `plugin:stop` run in reverse topological order, then plugins are disposed in the same order, and `app.probe()` reports zero plugins, scopes, services, hooks, registry entries, subscribers and fibers.
2. **Given** `setup` throws in plugin 3 of 5, **Then** `start()` rejects with `PluginError(phase 'install')`, plugins 2 and 1 were stopped and disposed in reverse, nothing leaks.
3. **Given** `start` throws, **Then** the same rollback happens including `stop` of already started plugins.
4. **Given** several `stop` or disposer failures, **Then** every one still runs and `stop()` rejects with a `DisposalError` listing all.
5. `stop()` twice is safe; `start()` after `stop()` throws `AppStateError`.

### User Story 3 - Registries owned by plugins (P1)

Entries added through `ctx.registry(token)` vanish when the plugin is disposed; subscribers are told; the `registry:change` hook fires.

### User Story 4 - Scopes (P2)

1. `app.scope('task:42')` or `ctx.scope(...)` returns a `Scope` with an `AbortSignal`, scope-local services, owned resources and child scopes.
2. Disposing a scope aborts its signal first, releases resources newest first, removes registry entries and hook registrations made through it, and disposes child scopes first.
3. `scope.run(fn)` disposes the scope even when `fn` throws; `await using` works; an external `signal` option disposes the scope when aborted.
4. Scope-local services shadow nothing global: `scope.get` looks in the scope chain first, then app services.

### User Story 5 - Provider replacement and reactivation (P2)

Because plugins are Cordis fibers: when a provider is disposed, its dependents are stopped and go `pending`; when a provider of the same service is installed again, dependents run `setup` and `start` again.

### User Story 6 - Dynamic and nested installation, isolation (P2)

1. `app.install(plugin)` after start validates against what is provided now, installs, starts, and returns a `PluginHandle`.
2. `ctx.install(plugin, config, { isolate: [Token] })` inside `setup` installs a child plugin whose isolated services are invisible outside the subtree (Fastify-style encapsulation, on Cordis `isolate`).
3. Disposing a parent disposes nested plugins first.

### User Story 7 - Typed hooks and inspection (P2)

`plugin.definition.hooks` register while installed; `app.hooks` observes lifecycle (`graph:built`, `plugin:install`, `plugin:installed`, `plugin:start`, ... `app:ready`, `app:stopped`, `scope:open`, `scope:close`, `service:provide`, `service:remove`, `registry:change`). `app.graph()` returns the static graph; `app.inspect()` returns the observed tree with states; `app.probe()` is the leak probe.

## Edge Cases

- `use` after `start`: `AppStateError`; use `install`.
- A dynamic plugin whose required service is missing: `MissingDependencyError`, nothing installed.
- A plugin that reactivates after its provider returns while `setup` fails: state `failed`, `plugin:error` hook, error reported through `onError`.
- Scope opened on a disposed parent: `DisposedError`.
- Service value `null` or `undefined`: `InvalidServiceValueError`.
- Providing the same declared service twice: `DuplicateProvideError`.

## Requirements

- **FR-301**: `App` MUST own a Cordis root `Context`; every plugin and scope MUST be a Cordis fiber (`ctx.plugin`).
- **FR-302**: All imports of `cordis` MUST live in `packages/core/src/internal/cordis.ts`.
- **FR-303**: `start` order = graph order; `stop` and dispose order = reverse of installation order, one at a time, awaited.
- **FR-304**: A plugin's resources MUST be released through its own LIFO stack first, then its fiber is disposed (Cordis disposes a fiber's effects in parallel, so ordering is ours to guarantee).
- **FR-305**: Config MUST be validated for every plugin before the first `setup`.
- **FR-306**: `app.probe()` MUST count live plugins, scopes, services, hooks, registry entries, registry subscribers and Cordis fibers.
- **FR-307**: `PluginContext.get`, `maybe` and `provide` MUST enforce the declarations at runtime.
- **FR-308**: Hooks errors in lifecycle hooks propagate (they are part of the contract); registry and service hooks are fire-and-forget with errors routed to `onError`.
- **FR-309**: An `App` is single-use: `created -> starting -> running -> stopping -> stopped`, or `failed`.
