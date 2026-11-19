# Ponytail review: AIMBRACE framework (session a01ceb85)

Date: 2026-10-06. Reviewer lens: ponytail full + ponytail-review.
Scope: over-engineering only. Correctness, security and performance are out of scope.
Verdict: strong autonomous engineering, wrong shape. Freeze, do not refactor forward.

## What Claude built (8 checkpoint commits, all pushed)

9 packages (core, loader, http, hono, fastify, effect, cli, testing, unplugin),
4 reference plugins (model, memory, tools, agent), 2 examples, docs with
executable snippets, a consumer check that packs tarballs and scaffolds a real
app, and a docs website in a sibling repo. Full gate green at review time:
501 unit + 24 example tests. Honest status page. The execution discipline was good.

## The category error

Asked: a scaffolder like create-better-t-stack (thin CLI, questionnaire, templates,
zero runtime). Built: a runtime framework (own DI kernel, lifecycle, registry,
hooks, graph, semver, error taxonomy: 7,259 lines of shipped source) with the
scaffolder as one 76-line CLI command (`packages/cli/src/builtins/init.ts`).
Root cause: the brief's "Cordis + Effect + Fastify + Hookable + Unplugin + Hono"
ranking reads as "combine six runtimes" instead of "scaffold projects using them".

## Findings (one line each)

`packages/core/src/semver.ts:L1-206`: yagni: version-range parser for zero published plugins. No peer ranges until a second published version exists.

`packages/core/src/graph.ts:L1-558`: shrink: biggest file in repo; topo sort is ~20 lines, rest is modeling plus rendering. Keep sort, cut rendering.

`packages/core/src/errors.ts:L1-304`: yagni: ~19 error classes before any user hit one. Collapse to 3-4, split when catch-sites need it.

`packages/core/src/app.ts` + `lifetime.ts` + `plugin-runtime.ts` + `internal/kernel.ts` (~1,100 lines): delete: parallel lifecycle kernel shadowing Cordis fibers and disposal. Use Context plus Cordis plugins directly.

`packages/core/src/registry.ts:L1-212`: delete: second registry over a framework that already ships one. Nothing replaces it.

`packages/unplugin/src/*`: delete: 8 four-line adapter re-exports plus factory plus graph, zero consumers. Nothing replaces it.

`packages/effect/src/*` (192 lines): yagni: Effect bridge with no Effect users. Add when one real app needs it.

`packages/fastify/src/index.ts` (125 lines) next to `packages/hono`: yagni: second host proving a neutrality nobody asked to see. Ship one host; the contract test exists to serve the second host, cut both.

`plugins/tools/src/calculator.ts` (119 lines): delete: demo filler. The `hello` plugin in `init.ts` already proves the concept.

`plugins/model/src/mock.ts` (127 lines): yagni: mock provider in the framework repo. Belongs in a template, not the framework.

12x `tsdown.config.ts` (11 identical lines each): shrink: one shared root config, 12 files become 1.

`aimbrace.github.io/src/lib/fuzzy.ts`: stdlib: hand-rolled edit distance for site search. Plain substring match until search has users.

`docs/` (~15 concept pages plus guides plus architecture plus error catalogue) for unpublished 0.1.0: yagni: docs outweigh the user base. Keep quickstart plus first-app, cut the rest until npm publish.

`specs/` process weight plus `docs/.generated/` (30+ extracted-snippet files): shrink: speckit templates and snippet harness committed as product. Keep the tests, move the harness out of the product tree.

NOT flagged (ponytail floor): `packages/testing` leak probe, `scripts/verify-consumer.mjs`, executable docs snippets. One runnable check is the minimum, never bloat.

`net: -3000 lines possible` (kernel ~1100, semver 206, errors ~200, graph ~400, unplugin ~150, effect ~190, fastify 125, demo plugins ~250, configs and docs remainder).

## Salvage list (the only things the rebuild keeps)

- `packages/cli/src/builtins/init.ts` (the `hello` plugin shape)
- `packages/testing` leak-probe assertion
- `scripts/verify-consumer.mjs` (adapt to scaffolder output)
- `docs/getting-started/first-app.md` (trim to one page)

## Decision (user, 2026-10-06)

Scaffold from inside aimbrace (`aimbrace init`): questionnaire plus templates on raw Cordis, zero
`@aimbrace/*` runtime dependencies. Same repo, built alongside the old code;
no deletion and no site changes until the scaffolder cutover proves itself.
