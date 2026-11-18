# Implementation Plan: AIMBRACE roadmap

**Branch**: `main` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

## Summary

Deliver the framework in eleven milestones (M0-M10). Each milestone after M0 has its own
spec-kit folder `specs/NNN-name/` with `spec.md`, `plan.md`, `tasks.md`, written before the
implementation and closed by updating its task ledger. Every milestone ends with a green
`pnpm run check` and a pushed checkpoint.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (strict), ESM, Node `>=22.12` (developed on 24)
**Primary Dependencies**: `cordis@4.0.0-rc.10` (exact pin, release candidate), `hookable@6.1.2`; adapters add `hono`, `@hono/node-server`, `fastify`, `effect@4`, `unplugin`
**Storage**: none in core (reference memory plugin is in-process)
**Testing**: vitest 5 against the real Cordis runtime; type tests with `expectTypeOf`
**Target Platform**: Node, Bun, Deno for core (Web primitives only); adapters document their own targets
**Project Type**: pnpm monorepo of libraries plus examples; the website lives in its own repository
**Performance Goals**: install of 1,000 trivial plugins under 500 ms; graph build is O(V+E)
**Constraints**: core runtime dependencies are `cordis` and `hookable` only; no decorators; no codegen
**Scale/Scope**: eleven published packages, four reference plugins, two examples

## Constitution Check

| Principle | Plan answer |
|---|---|
| I core knows nothing | `@aimbrace/core` exports no host concept; a test scans its imports |
| II build on Cordis | Plugins are Cordis fibers; services are Cordis `provide/set`; scopes are fibers; no second DI |
| III typed graph | `definePlugin` generic over `requires/optional/provides`; `PluginContext` type narrows access |
| IV disposers | Registry and hook registrations go through `fiber.effect`; leak probe test |
| V typed hooks | `Hooks<T>` over Hookable; `HookExtensions` merge point for plugin hooks |
| VI many hosts | neutral `@aimbrace/http` contract; Hono and Fastify hosts share one contract suite |
| VII small | dependency budget test in CI (`scripts/check-deps.mjs`) |
| VIII inference | no decorators or codegen anywhere |
| IX lifecycle tests | each package has a lifecycle suite |
| X honest docs | task ledgers and `docs/status.md` updated with each milestone |

## Architecture

```text
 APPLICATION   examples/*  (agent-cli, http-agent)
 PLUGINS       plugins/*   (model, memory, tools, agent)  +  user plugins
 HOSTS         packages/{http,hono,fastify,cli,effect,unplugin}
 ENGINE        packages/{loader,testing}  (config, manifest loading, test harness)
 CORE          packages/core  (service, plugin, registry, hooks, scope, lifecycle, graph, reflect)
 SUBSTRATE     cordis (Context, fibers, isolate, effects)  +  hookable  +  Web primitives
```

### Mapping of reference projects to code

| Project | Idea adopted | Where it lands |
|---|---|---|
| Cordis | Context, fibers, isolation, effects, inject-driven PENDING/reactivation | `core/src/app.ts`, `core/src/scope.ts` (thin typed layer over `Context`) |
| Effect | typed requirements algebra, layers, scoped resources | `PluginContext<R,O,P>` types; `@aimbrace/effect` (`layerToPlugin`, `provideFromContext`) |
| Fastify | plugin graph, ordering, encapsulation, version peers | `core/src/graph.ts` (`peers`), `use(plugin, { isolate })`; `@aimbrace/fastify` |
| Hookable | typed hooks, serial/parallel, unregister | `core/src/hooks.ts` wraps `Hookable` |
| Unplugin | one abstract plugin, many adapters; build-time plugin | `@aimbrace/http` contract + hosts; `@aimbrace/unplugin` |
| Hono | minimal core, Web-standard request/response | `@aimbrace/http` handler type is `(Request) => Response`; `@aimbrace/hono` |

## Project Structure

```text
aimbrace/
  docs/                    concepts, guides, API reference, ADRs, status
  specs/                   000-roadmap + one folder per milestone (spec-kit)
  packages/
    core/                  @aimbrace/core
    testing/               @aimbrace/testing
    loader/                @aimbrace/loader
    http/                  @aimbrace/http
    hono/                  @aimbrace/hono
    fastify/               @aimbrace/fastify
    effect/                @aimbrace/effect
    unplugin/              @aimbrace/unplugin
    cli/                   @aimbrace/cli   (bin: aimbrace)
  plugins/
    model/ memory/ tools/ agent/
  examples/
    agent-cli/ http-agent/
  scripts/                 repo maintenance (dependency budget, graph print)
```

## Milestones

| # | Milestone | Spec folder | Exit evidence |
|---|---|---|---|
| M0 | Bootstrap: constitution, roadmap, workspace tooling, CI | `000-roadmap` | `pnpm install` + empty `check` green; pushed |
| M1 | Core primitives: service tokens, hooks, registry, errors, disposal utilities | `001-core-primitives` | unit tests; type tests |
| M2 | Plugin model and dependency graph: `definePlugin`, validation, topo order, exporters | `002-plugin-graph` | graph tests incl. cycles, peers |
| M3 | App, Context, Scope, lifecycle on Cordis | `003-app-lifecycle` | lifecycle and leak tests; rollback tests |
| M4 | Config and loader | `004-config-loader` | schema errors; manifest load test |
| M5 | Neutral HTTP contract plus Hono and Fastify hosts | `005-http-hosts` | contract suite passes under both |
| M6 | Effect bridge and Unplugin build plugin | `006-effect-unplugin` | layer round trip; virtual module build test |
| M7 | Testing package and CLI | `007-testing-cli` | CLI integration tests |
| M8 | Reference AI plugins and examples | `008-ai-plugins` | examples run in CI offline |
| M9 | Documentation set | `009-docs` | docs index complete, links checked |
| M10 | Website and release hygiene | `010-website` | site deployed from `aimbrace.github.io` |

## Complexity Tracking

| Risk | Mitigation |
|---|---|
| Cordis 4 is a release candidate; API may change | exact pin, wrapper isolates all Cordis calls in `core/src/internal/cordis.ts`, upgrade test |
| Typed `requires` tuples are hard for TS inference | `const` generic parameters, type tests, fallback overloads documented |
| Fastify `main` is 6.0 alpha, npm latest is 5.x | host targets the published 5.x line; documented |
| Effect 4 API is new | bridge limited to Layer/Context/Scope interop, covered by round-trip tests |
