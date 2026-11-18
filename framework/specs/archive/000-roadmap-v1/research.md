# Research: decisions behind the AIMBRACE roadmap

## R1. Wrap Cordis; do not reimplement it

**Decision**: `@aimbrace/core` builds `App` on a real Cordis `Context`. Plugins become Cordis
plugins (`{ name, inject, apply }`), services use `ctx.provide(name)` and `ctx.set(name, value)`.

**Evidence** (spike against `cordis@4.0.0-rc.10`):

- A plugin whose `inject` names a missing service stays `PENDING` (state 0) and activates when the provider appears (state 2).
- Disposing the provider returns the consumer to `PENDING`, so reactivation is free.
- `ctx.isolate('database')` gives a child context its own `database` namespace; the root does not see it. This is the basis for Fastify-style encapsulation.
- Effects (`ctx.effect`) are collected on the fiber and disposed in reverse order, including async disposers.

**Gap found**: when a provider is disposed, Cordis disposes the provider's effects before the dependents finish unloading (observed order: `db:dispose`, then `agent:dispose`). AIMBRACE therefore drives shutdown itself: `stop` in reverse topological order, then dispose fibers one by one in reverse order, awaiting each. Cordis alone is not enough for the "reverse of startup" guarantee.

## R2. Static graph on top of dynamic injection

Cordis resolves dependencies dynamically (names, at runtime). The brief asks for a first-class
typed graph. Decision: two layers.

1. **Static**: `definePlugin` metadata yields a `Graph` before anything runs: validation, ordering, exporters.
2. **Dynamic**: Cordis `inject` guarantees safety at runtime (PENDING until satisfied, reactivation after provider replacement).

Nested plugins installed from inside `setup` via `ctx.use()` are not part of the static graph;
they appear in the observed tree (`app.inspect()`), built from the `plugin:install` hook.

## R3. Typed service tokens vs Cordis's global `Context` augmentation

Cordis types services by merging into the `Context` interface (global). AIMBRACE uses value
tokens (`service<T>(name)`) so types flow through function arguments and different apps never
collide in the type system. The token name is the Cordis service name underneath; tokens are
registered once per app and a duplicate name with a different token object is an error.

## R4. Where each reference library is used literally

| Library | Used as a dependency? | How |
|---|---|---|
| cordis | yes (core) | substrate |
| hookable | yes (core) | `Hooks<T>` wraps `Hookable` |
| unplugin | yes (`@aimbrace/unplugin`) | build-time graph validation plus virtual module `virtual:aimbrace/graph` for Vite/Rollup/esbuild/webpack/Rolldown |
| hono | yes (`@aimbrace/hono`) | HTTP host |
| fastify | yes (`@aimbrace/fastify`) | HTTP host with plugin encapsulation mapping |
| effect | yes (`@aimbrace/effect`) | Layer interop |

## R5. Version pins

`cordis@4.0.0-rc.10` is the latest tag on npm (`next` is `4.0.0-beta.5`). Pin exactly.
`hookable@6.1.2`, `unplugin@3.4.0`, `hono@4.13.x`, `fastify@5.12.x`, `effect@4.0.1`.
TypeScript 6.0.3 is used instead of 7.x because the declaration-bundling toolchain still targets the JS compiler API.

## R6. Repository naming

Package scope `@aimbrace`. The brief uses `@acryl/*` as placeholder names; they are replaced by `@aimbrace/*` here.

## R7. Scope-local values are a plain chain, not Cordis services

Cordis scopes a service by isolation: `ctx.isolate(name)` must be applied to the context *before*
the fiber that will provide or consume the service is created. A task scope needs the opposite:
"open a scope now, provide a task-local `Budget` later, concurrently, in several sibling scopes".
Providing the same service name from sibling fibers in one namespace is an error in Cordis
(`service ... has been registered`), and isolating lazily would make child scopes created earlier
blind to values provided later.

**Decision**: `Scope.provide/get/maybe` use a small per-scope `Map` chain (scope, parent scope, ...,
then the app's Cordis services). It is not injectable into plugins and has no lifecycle graph, so it
is context-local state (comparable to `AsyncLocalStorage`), not a second DI container. Plugins
installed into a scope still use real Cordis injection, and `install(..., { isolate })` uses real
Cordis isolation for encapsulated subtrees.

## R8. Cordis service removal is asynchronous

The function returned by `ctx.provide` removes the service, then waits for dependents to unload,
then touches the owning fiber's store. A caller that drops the returned promise and disposes the
fiber immediately makes Cordis throw an unhandled `TypeError` (found by an unhandled-rejection report
in the reactivation tests). AIMBRACE awaits every service removal before a fiber is disposed.

## R9. Pivot from a composition runtime to a scaffolder (constitution 2.0.0)

**Decision**: scaffolding ships inside the aimbrace CLI (`aimbrace init`) with a fixed set of templates on raw Cordis. No new repository, no new package, no new binary name. The
runtime packages (`@aimbrace/*`) stay in the repository, frozen, and are not imported by any new work.

**Why**: an independent review (`specs/010-scaffolder-rebuild/review.md`) found that the runtime was about
7,000 lines of shipped source with its own kernel, registry, hooks, graph and error taxonomy, while the thing a
new user needs is a working project. The composition model is Cordis itself; a second model on top of it adds
maintenance without a user. Templates that import Cordis directly show the same ideas with no framework to learn
or version. The original six-library ranking was read as "combine six runtimes" when the useful reading was
"scaffold projects that use them".

**Consequences**: no `@aimbrace/*` dependency in any template; frozen packages get no new features; cutover of the
old packages is a later spec. Amendment recorded in the constitution header and the version line.
