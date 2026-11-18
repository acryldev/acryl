# Implementation Plan: aimbrace scaffolding (M10)

**Branch**: `main` | **Date**: 2026-10-06 | **Spec**: [`./spec.md`](./spec.md)

## Summary

**Distribution:** self-contained. The scaffolder is the aimbrace CLI run from this repository checkout (`node packages/cli/bin/aimbrace.js init`); nothing is published to npm.

Extend the aimbrace CLI (`packages/cli`, `init` command) with a name/agent
questionnaire that copies one of 2 in-repo templates on raw Cordis, plus one
verify script and one quickstart page. No new package, no new binary name,
nothing outside this repo. Old runtime code, docs and site are frozen and
untouched. Each task below closes only with its exit evidence on `main`.

## Technical Context

**Language/Version**: TypeScript strict, ESM, Node `>=22`
**Dependencies**: upstream `cordis@4.0.0-rc.10` (exact pin, same as frozen
code) and nothing else in generated apps; serving is `node:http` from the
standard library. No `@aimbrace/*`, `@deepseek-ai/*`, `hono`, `fastify`,
`hookable`, `effect` or `unplugin` anywhere in templates or the CLI path.
Reference clone (study only, never a dependency):
`../Cordis_Effect_Fastify_Hookable_Unplugin_Hono/cordis` (upstream checkout).
**Testing**: vitest for the CLI; `scripts/verify-scaffolder.mjs` scaffolds every
template in a temp dir, installs, boots, curls the route, runs template tests
**Target**: Node 22+ only (no Bun/Deno gate)
**Project Type**: single workspace package plus static template dirs
**Constraints**: FR-002/FR-004 enforced by tests (cordis-only deps,
template count cap of 2); refuse-to-overwrite behavior kept

## Constitution Check

The constitution (`.specify/memory/constitution.md`) currently mandates an
application composition runtime with `@aimbrace/core`. This milestone amends
it: the product is a scaffolder, templates use Cordis directly, no wrapper
runtime exists. Task T100 records the amendment (principle text + version bump)
before any code. If the amendment is rejected, this milestone stops: building a
scaffolder under a framework constitution would repeat the original error.

| Principle | Plan answer |
|---|---|
| Product shape | scaffolder plus templates, zero runtime packages |
| Cordis use | direct `Context`/plugin use in templates, no wrapper module |
| Dependency budget | template package.json scanned in CI, `@aimbrace/*` fails the build |
| Honest docs | one quickstart page; old docs frozen with a banner pointing at it |

## Architecture

```text
packages/cli/src/builtins/init.ts   extended: questionnaire, flags, copy, refuse-if-dirty
packages/cli/templates/
  base/                   Cordis app serving via node:http, one route
  agent/                  plus mock model, memory, tools, agent scope (offline)
scripts/verify-scaffolder.mjs
docs/getting-started/scaffold.md   the single page from US3
```

Scaffold flow: parse flags (or ask) → resolve template dir → refuse if
target not empty → copy → write package.json with chosen name → print next
steps. No config parsing, no graph building, no plugin registry in the CLI:
it copies files. Salvage from frozen code: `hello` plugin shape (current
`packages/cli/src/builtins/init.ts`), leak-probe assertion
(`packages/testing`), consumer-check pattern
(`scripts/verify-consumer.mjs`), trimmed `first-app.md`.

## Project Structure (new files only)

```text
packages/cli/src/builtins/init.ts   (extended, no new binary)
packages/cli/templates/{base,agent}/
scripts/verify-scaffolder.mjs
docs/getting-started/scaffold.md
specs/010-scaffolder-rebuild/{review.md,spec.md,plan.md,tasks.md,implementation-spec-for-010.md}
```

Only `packages/cli` (init extension plus templates), `scripts/`,
`docs/getting-started/scaffold.md` and `specs/010-*` change. Everything else frozen.
