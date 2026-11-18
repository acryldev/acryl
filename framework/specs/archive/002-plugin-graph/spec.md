# Feature Specification: Plugin model and dependency graph

**Milestone**: M2 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

`definePlugin` captures a plugin's declarations in a typed, immutable object. `buildGraph` turns a
set of declarations into a validated dependency graph with a deterministic topological order, and
renders it as text, Mermaid, DOT or JSON. Neither needs a running app: the graph is pure data, so
the CLI, the Unplugin build step and the website can all use it.

The context types a plugin sees (`PluginContext`, `Scope`) are specified here as pure type
contracts because `definePlugin` is generic over them. M3 implements them on Cordis.

## User Scenarios & Testing

### User Story 1 - Declare a plugin with typed requirements (P1)

`definePlugin({ id, requires, optional, provides, setup })` infers the token tuples. Inside `setup`,
`ctx.get(Token)` only accepts declared `requires`, `ctx.maybe(Token)` only declared `optional`,
`ctx.provide(Token, value)` only declared `provides` with the right value type.

**Independent Test**: type tests with `// @ts-expect-error` for every illegal access; runtime test that plugin objects are frozen and expose metadata.

### User Story 2 - Order is derived from the declarations (P1)

**Acceptance Scenarios**:

1. **Given** plugins listed as `[agent, memory, config]` where agent requires memory and memory requires config, **Then** `graph.order` is `[config, memory, agent]`.
2. **Given** independent plugins, **Then** order follows registration order (deterministic).
3. **Given** a diamond, **Then** the shared dependency appears once and before both dependents.

### User Story 3 - Invalid graphs fail before anything runs (P1)

Missing required service, duplicate plugin id, duplicate provider, cycle (including a plugin that
requires what it provides), missing peer, peer version mismatch. Each is a typed error with a
precise message; `assertValid()` throws one error or an aggregate.

**Acceptance Scenarios**:

1. **Given** a missing service `model` required by `agent`, **Then** the error names the plugin, the service, and suggests close service names (here `model`).
2. **Given** a cycle `a -> b -> c -> a`, **Then** the error carries `['a','b','c','a']` and its message prints `a -> b -> c -> a`.
3. **Given** an optional dependency that is absent, **Then** the graph is valid (an info diagnostic is recorded).
4. **Given** an optional edge that would close a cycle, **Then** that edge is dropped with a warning and the graph is valid.

### User Story 4 - See the graph (P2)

`graph.toText()`, `toMermaid()`, `toDot()`, `toJSON()`.

### User Story 5 - Peers with version ranges (P2)

`peers: { 'logger': '^1.2.0' }` requires the peer plugin to be present and to satisfy the range
(small built-in semver subset: exact, `^`, `~`, comparators, `||`, hyphen-free).

## Requirements

- **FR-201**: `definePlugin` MUST be generic over `const` token tuples for `requires`, `optional`, `provides` and over an optional Standard Schema `config`.
- **FR-202**: The value returned by `definePlugin` MUST be callable (`plugin(config)` returns a configured instance) and expose `id`, `version`, `meta`.
- **FR-203**: `buildGraph` MUST be pure and operate on plain `GraphInput` objects (no functions) so it can run from JSON.
- **FR-204**: Order MUST be deterministic: Kahn's algorithm, ties broken by registration index.
- **FR-205**: Cycle diagnostics MUST report one concrete cycle path per strongly connected component.
- **FR-206**: Optional edges that would close a cycle MUST be dropped with `W_OPTIONAL_CYCLE_DROPPED`, not fail validation.
- **FR-207**: A service with two providers MUST be `E_DUPLICATE_PROVIDER` (an explicit override mechanism is deferred and documented as not implemented).
- **FR-208**: `buildGraph` MUST accept `external` service names that are already satisfied (used for dynamic installation into a running app).
- **FR-209**: Config schemas MUST use a vendored copy of the Standard Schema interface; core MUST NOT depend on a validation library.
- **FR-210**: Graph build for 1,000 plugins in a chain MUST finish in under 200 ms.
