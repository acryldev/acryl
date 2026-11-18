# Feature Specification: AIMBRACE - an application composition runtime on Cordis

**Feature Branch**: `main` (maintainer workflow, no feature branches)
**Created**: 2026-10-06
**Status**: M0-M9 done; M10 pivoted 2026-10-06 (see `tasks.md` milestone ledger).
Pivot: the website shipped in the sibling repo; `specs/010-scaffolder-rebuild`
replaces the framework direction with in-aimbrace scaffolding (`aimbrace init`
plus in-repo templates) on raw Cordis. `docs/aimbrace_spec.md` no longer
governs new work.
**Input**: `docs/aimbrace_spec.md` (the architecture brief) and the user request: "create our own framework based on Cordis, using Cordis, Effect, Fastify, Hookable, Unplugin and Hono as reference libraries, plan with spec-kit, execute the milestones, push every checkpoint, document it and publish an explainer website".

## Summary

AIMBRACE is a TypeScript **application composition runtime**. An application is a set of
plugins. Each plugin declares what it `requires`, `provides` and hooks into; the runtime
turns those declarations into a typed dependency graph, installs plugins in topological
order inside encapsulated Cordis contexts, runs a deterministic lifecycle, and tears
everything down in reverse. A plugin is written once and runs under any host adapter.

The repository must deliver a working framework (not a design document): the core
package, host adapters, reference plugins, a CLI, documentation and a public website.

## User Scenarios & Testing

### User Story 1 - Compose an app from typed plugins (Priority: P1)

A developer defines service tokens and plugins, passes them to `createApp`, and starts it.
The runtime orders installation by the dependency graph regardless of the order the plugins
were listed, and a plugin cannot read a service it did not declare.

**Why this priority**: this is the product. Everything else builds on it.

**Independent Test**: `packages/core` tests: plugins listed in reverse order still install in
dependency order; reading an undeclared service is a compile error (type test) and a
runtime error; `provides` not fulfilled by `setup` fails `start()` with a named error.

**Acceptance Scenarios**:

1. **Given** plugins A (requires B) and B, **When** the app starts, **Then** B installs before A and A's `ctx.get(B)` returns B's value.
2. **Given** a missing required service, **When** the app starts, **Then** `start()` rejects with a `MissingDependencyError` naming plugin, service and the plugins that could provide it, and no plugin was installed.
3. **Given** a dependency cycle, **When** the app starts, **Then** `start()` rejects with a `DependencyCycleError` that prints the cycle path.

### User Story 2 - Deterministic lifecycle and leak-free disposal (Priority: P1)

Stopping the app stops plugins in reverse dependency order, and everything a plugin
acquired (services, hooks, registry entries, timers, listeners) is released.

**Independent Test**: tests record install/start/stop/dispose order and assert quiescence
(zero hooks, zero registry entries, zero services) after `stop()`.

**Acceptance Scenarios**:

1. **Given** a started app, **When** `stop()` is called, **Then** `stop` hooks run in reverse topological order and then every plugin fiber is disposed in the same order.
2. **Given** a plugin whose `setup` throws, **When** the app starts, **Then** previously installed plugins are rolled back in reverse order and the error identifies the failing plugin.

### User Story 3 - Registries instead of plugin-to-plugin coupling (Priority: P1)

Plugins contribute to a typed `Registry<T>` (tools, routes, commands, providers) and other
plugins enumerate it without knowing the contributors. Entries disappear when the
contributing plugin or scope is disposed.

**Independent Test**: three plugins add tools, a fourth lists them; disposing one plugin
removes only its entries and notifies subscribers.

### User Story 4 - Temporal scopes for tasks and calls (Priority: P2)

Inside a running app, code opens a child **Scope** (for example one agent task, or one HTTP
request). The scope carries its own services, abort signal and resources, and releasing the
scope releases them all, including when it fails or is cancelled.

**Independent Test**: open a task scope, provide a task-local service, register a tool,
start a timer; dispose the scope; assert all three are gone and the signal aborted.

### User Story 5 - Typed hooks (Priority: P2)

Plugins observe and extend runtime behaviour through a typed hook map (lifecycle hooks are
built in; plugins declare their own), with serial and parallel dispatch and automatic
unregistration on disposal.

### User Story 6 - One plugin, many hosts (Priority: P2)

The same plugin set runs under: a CLI host, an HTTP host on Hono, an HTTP host on Fastify,
an Effect program (`Layer` interop), and a build-time Unplugin that validates and exports the
graph. Plugins register routes/commands through neutral registries, not host APIs.

**Independent Test**: one `hello` plugin that contributes a route is served by both the Hono
and the Fastify host with identical responses (contract test).

### User Story 7 - Inspect and visualise the graph (Priority: P2)

A developer can print the plugin graph (text, Mermaid, DOT, JSON), see the observed runtime
tree with fiber states, and run `aimbrace graph` / `aimbrace check` from the CLI.

### User Story 8 - Reference AI plugins and runnable examples (Priority: P3)

Model, memory, tools and agent plugins demonstrate the architecture end to end, including a
task scope per agent run with a token budget and cancellation, using a deterministic mock
model so examples run offline.

### User Story 9 - Documentation and public website (Priority: P2)

`docs/` explains concepts, guides and the API. A public site (repo `aimbrace/aimbrace.github.io`)
presents the project and renders the documentation, deployed by GitHub Pages.

## Edge Cases

- A plugin provides a service another plugin already provides (duplicate provider): error by default, explicit `override` allowed.
- Optional dependency absent: plugin installs and `ctx.maybe(Token)` is `undefined`.
- Plugin config fails validation: `start()` fails before any `setup` runs for that plugin, with Standard Schema issue paths.
- `use()` after the app started: installs dynamically, graph is re-validated against what is already provided.
- Two apps in one process do not share services, registries or hooks.
- Disposal while a plugin `setup` is still pending (async): the setup is awaited then rolled back.

## Requirements

### Functional Requirements

- **FR-001**: `service<T>(name)` MUST create a typed token; two tokens with the same name in one app MUST be an error.
- **FR-002**: `definePlugin` MUST accept `id`, `version?`, `requires`, `optional`, `provides`, `peers?`, `config?` (Standard Schema), `hooks?`, `setup`, `start?`, `stop?`.
- **FR-003**: The `setup` context type MUST only allow `get` for declared `requires`, `maybe` for declared `optional`, and `provide` for declared `provides`.
- **FR-004**: The runtime MUST build and validate the dependency graph before installing anything and MUST expose it as data (`app.graph()`).
- **FR-005**: Installation MUST be in topological order with ties broken by registration order (deterministic); `start` the same; `stop` and disposal in reverse.
- **FR-006**: Every resource a plugin acquires through the context MUST be bound to the plugin's Cordis fiber and released when it is disposed.
- **FR-007**: `Registry<T>` entries added through a context MUST be removed when that context's scope ends.
- **FR-008**: A `Scope` MUST expose an `AbortSignal`, support nested scopes, and implement `Symbol.asyncDispose`.
- **FR-009**: Hooks MUST be typed, support `hook`, `hookOnce`, `callHook` (serial), `callHookParallel`, and return an unregister function.
- **FR-010**: `@aimbrace/core` MUST depend at runtime only on `cordis` and `hookable`, and MUST NOT import any Node-only module.
- **FR-011**: Plugin config MUST be validated with a Standard Schema before `setup`.
- **FR-012**: Host adapters (`http`, `hono`, `fastify`, `effect`, `unplugin`, `cli`) MUST depend on core only through its public API.
- **FR-013**: The CLI MUST provide `graph`, `check` and `run`.
- **FR-014**: The repository MUST contain the documentation set under `docs/` and the website source in the `aimbrace/aimbrace.github.io` repository.

### Key Entities

- **ServiceToken<T>**: name + phantom type. The unit of dependency.
- **Plugin**: declarative composition unit (id, requires, optional, provides, hooks, setup, start, stop).
- **Registry<T>** / **RegistryToken<T>**: a collection contributed to by many plugins.
- **Scope**: a disposable, abortable child context with a name and parent.
- **Graph**: nodes (plugins), edges (requires service), order, diagnostics.
- **App**: composition root owning a Cordis root Context, the hook map and the lifecycle.

## Success Criteria

- **SC-001**: `pnpm run check` (lint, build, typecheck, tests) is green on `main`.
- **SC-002**: A new plugin author can build a working plugin from `docs/guides/write-a-plugin.md` alone.
- **SC-003**: The same example plugin passes a contract test under Hono and Fastify.
- **SC-004**: After `app.stop()` the leak probe reports zero live services, hooks and registry entries in every test.
- **SC-005**: The website builds, deploys from `main`, and every docs page is reachable from its navigation.
