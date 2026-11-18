# Feature Specification: Effect bridge and Unplugin build plugin

**Milestone**: M6 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

Two more hosts for the same plugin contract:

- `@aimbrace/effect` connects AIMBRACE to Effect 4 in both directions. An Effect `Layer` can become
  an AIMBRACE plugin (a Layer's inputs are the plugin's `requires`, its outputs the plugin's
  `provides`, its finalizers run on dispose). Effect programs can read AIMBRACE services and are
  interrupted when an AIMBRACE scope ends.
- `@aimbrace/unplugin` validates the plugin graph at build time and exposes it as virtual modules for
  Vite, Rollup, Rolldown, esbuild, webpack, Rspack, Farm and Bun through one Unplugin definition.

## User Scenarios & Testing

### User Story 1 - Layer to plugin (P1)

`layerPlugin({ id, requires: [[Config, ConfigService]], provides: [[Db, DbService]], layer })` builds the
layer with the AIMBRACE `Config` supplied as the Effect `ConfigService`, exposes the built `DbService` as
AIMBRACE `Db`, and releases the layer's scope (finalizers) when the plugin is disposed.

**Acceptance**: dependent plugins see the service; finalizers run after dependents stop; a failing layer fails `start()` and rolls back cleanly; the tuple types are preserved on the returned plugin.

### User Story 2 - Effect programs read AIMBRACE services (P1)

`createEffectRuntime(get, bindings, owner?)` returns a `ManagedRuntime` whose context holds the
AIMBRACE services as Effect services (`effectService(token)`); disposing the owner disposes the runtime.

### User Story 3 - Effect work ends with the scope (P2)

`runEffect(scope, runtime, effect)` runs an Effect and interrupts its fiber when the scope's signal aborts; Effect finalizers still run.

### User Story 4 - Build-time graph validation (P1)

`aimbrace()` from `@aimbrace/unplugin` loads the project's config at build start, builds the graph, and fails the build with the typed error message (missing service, cycle, duplicate provider) when invalid. `strict: false` downgrades errors to warnings.

### User Story 5 - Virtual modules (P2)

`virtual:aimbrace/graph` (JSON), `virtual:aimbrace/mermaid` (string), `virtual:aimbrace/plugins` (list of plugin metadata) are importable in application code and the website.

### User Story 6 - One definition, many bundlers (P2)

The same plugin is exercised under Rollup, Rolldown and esbuild in tests; Vite, webpack, Rspack, Farm and Bun are exposed by Unplugin and documented but not exercised in CI.

## Requirements

- **FR-601**: `effect` is a peer dependency of `@aimbrace/effect` (`^4.0.1`).
- **FR-602**: `layerPlugin` MUST dispose the Effect runtime (running finalizers) through the plugin's resource stack, newest first.
- **FR-603**: Effect service identifiers are per value type (`ServiceToken<T>`); two tokens with the same `T` are indistinguishable to the Effect type checker, while their runtime keys differ. Documented limitation.
- **FR-604**: `runEffect` MUST pass the scope signal to `runPromise` so interruption is Effect-native.
- **FR-605**: The Unplugin MUST not require a bundler at import time of the core factory (`unplugin` is its only runtime dependency besides `@aimbrace/loader` and `@aimbrace/core`).
- **FR-606**: Virtual module ids follow the `\0` convention and are stable across bundlers.
