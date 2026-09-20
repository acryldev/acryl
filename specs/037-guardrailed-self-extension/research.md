# Research: guardrailed self-extension

Facts the plan waits on. Each answered question becomes a note here before the
task it gates starts. Findings from before 2026-09-20 are recorded as evidence;
everything not yet measured against this repo is marked open, not assumed.

## Evidence A - How Pi organizes self-extension

Source: `github.com/earendil-works/pi`, `packages/coding-agent`, read on
2026-09-20 through the GitHub API, plus the local write-up
`_experiments/pi_dev_research_on_implementation_and_ideas_to_take/pi_dev_research_on_implementation_and_ideas_to_take.md`.

| Fact | Where |
| --- | --- |
| The agent does not receive the architecture up front. The system prompt carries a **docs router** section: main docs path, docs path, examples path, a topic-to-doc map (extensions, themes, skills, prompt templates, TUI, keybindings, SDK, custom providers, models, packages, environment variables), and the rules "read the docs and examples, and follow `.md` cross-references before implementing" and "always read pi `.md` files completely". | `src/core/system-prompt.ts`, `promptSections.docs` |
| The paths in that section are resolved at runtime, so the same prompt works installed or bundled. | `getReadmePath()`, `getDocsPath()`, `getExamplesPath()` |
| `docs/` holds about 32 files; `extensions.md` alone is 123 KB; `sdk.md` 38 KB; `rpc.md` 43 KB. `docs/docs.json` is a navigation manifest grouped as "Start here", "Customization", and further groups. | `packages/coding-agent/docs/` |
| `examples/extensions/` holds 78 working extensions (permission gate, custom compaction, prompt customizer, dynamic tools, plan mode, subagent, custom providers, ...). `examples/README.md` indexes them by theme. There are also `examples/sdk/` and `examples/plugins/pi-example-plugin/` (a plugin package built into separate Session-worker and TUI Chord facets). | `packages/coding-agent/examples/` |
| The system prompt is built from **named sections** (preamble, tools, rules, docs, addendum, project_context, skills, cwd) each wrapped in a tag; sections can be diffed so only changed ones are re-sent. | `system-prompt.ts` (`promptSections`, `diffSystemPromptSections`) |
| Project instruction files (`AGENTS.md`, `CLAUDE.md`) and **skills** (name, description, location only in context; body read on demand) are separate loading mechanisms from the docs router. | `resource-loader.ts`, `skills.ts` |
| Extensions are loaded with no compile step and picked up with `/reload`; the agent reads docs and examples, writes the file, the user reloads. | docs and README |
| Docs are treated as optional: the eval tooling has a `without_docs` variant that removes README, docs, examples and the router section. | eval infrastructure per the local write-up |
| Trust: project-local resources (extensions, skills, prompts, `AGENTS.md`) are subject to a project-trust check; the security doc says this is an input-loading guard, not a complete safety mechanism. | `docs/security.md`, `project-trust` example |

Conclusion carried into the spec: the mechanism is **index in the prompt, docs and
examples on disk, the agent's own file tools as the retrieval path, verification
at the end**. It is not retrieval-augmented generation and it needs no new tool.

## Evidence B - What the tutorial experiment measured

Repository `cordis-interactive-tutorial`, commits `5f8d205`, `47f9397`, `ddbc71e`.
Model `deepseek-flash`, real Cordis Context, workspace reset each run. Trajectory
harness records every event, tokens, cache hit and now docs/examples read per
chapter.

| Run | Router | Result | Input / output tokens | Cache hit | Docs + examples read |
| --- | --- | --- | --- | --- | --- |
| `aca89f6c` | inline prompt, no docs | 9/9 | 583K / 23K | 86.7% | not measured |
| `ca661d09` | 4 small docs | 9/9 | 1,125K / 30K | 88.8% | ch16: 2 docs; ch17: 2 docs |
| `543baa66` | full docs manifest + 18 examples + finished coding agent | 9/9 | 2,530K / 36K | 89.4% | ch17: 6 docs, 7 examples; ch18, 21, 23, 24: none; ch19-22: examples only |

Findings, each with its limit:

1. **Router steers first contact only.** Chapter 17 (first contact) read
   `this-sandbox.md`, services, plugins-and-fibers, cheatsheet, and seven
   examples. Later chapters mostly read nothing. Limit: one run per
   configuration, one model.
2. **Verifier found a doc error.** `export default` is rejected by `ctx.plugin()`
   ("invalid plugin, expect function or object with an apply method"); the
   contract is named exports. Found only because every example scenario was
   mounted for real. Limit: applies to the plain `ctx.plugin(module)` path; the
   real Loader may unwrap defaults, which is Q1's job to confirm for ACRYL.
3. **Answer-key leak.** Agent read `examples/coding-agent/{context-window,
   compaction,llm}.mjs` in chapters 19, 20, 22: the finished solution.
4. **Cost.** Uncached input 126K -> 269K (`ca661d09` -> `543baa66`). The docs are
   re-sent on every later call within a session, so context size compounds.
5. **No headroom.** All three configurations pass 9/9. The tutorial cannot
   demonstrate a correctness lift; it can only show routing behavior and cost.
6. **Pitfalls only found by running the artifact.** Nested `pnpm-workspace.yaml`
   swallowed a standalone project; `run.mjs` printed pre-settlement fiber states.

## Evidence C - ACRYL seams that already exist

Verified by reading source and docs on 2026-09-20.

| Seam | Location | Relevance |
| --- | --- | --- |
| Per-surface capability declarations, `AcrylSurface = 'tui' \| 'web' \| 'desktop'`, `createAcrylCodingCapabilityPatches(surfaces)`; carries `persona` (`@deepseek-ai/dsh-system-prompt`), `agent-roster`, `session-stats`, `authorization` | `runtime/acryl-harness-runtime/src/coding-capabilities.ts` | where the router capability is declared, with `surfaces` (spec 034 mechanism). Note `persona` is `['tui']` only today. |
| System prompt assembly: `PromptSection` (name, order, static or context-resolved `text`, optional `complete`), `PromptContext` (durable, cache-safe dynamic snapshot) | `deepseek-harness/docs/subsystems/system-prompt.md`, `packages/core/system-prompt` | router as one `PromptSection`; dynamic facts as `PromptContext` |
| Skill family: `ctx.skills` registry, `SkillProvider {list, get}`, filesystem provider with ranks (`project-dsh` 100 ... `bundled` 600), `dsh-skill-badge` as the precedent for a packaged bundled provider, `skill` tool, `skills/change` invalidation | `deepseek-harness/docs/subsystems/skills.md`, `packages/skill/*` | bundled authoring skills, overridable by project or user skills of the same name |
| Workspace instruction files (`AGENTS.md`, `CLAUDE.md`, local overlays) loaded as durable context with a byte budget; default in `dsh-base` | `packages/context/agent-instructions/README.md` | the pointer line in this repo's `AGENTS.md` (FR-011); not the delivery mechanism for user projects |
| Harness self-documentation: `docs/cookbook/` (adding-a-tool, adding-an-llm-adapter, adding-a-settings-card, adding-a-package, adding-a-remote-api, extension-cookbook), `docs/subsystems/*` (system-prompt, skills, extensions, client-modules, ...), `docs/cordis-tutorial/` (7 chapters), generated `docs/capability-seams.md` and `docs/config-catalog.md`, `docs/AGENTS.md` (docs standard), `type-equiv` code blocks | `deepseek-harness/docs/` (pinned submodule) | corpus to sync (FR-012); `type-equiv` blocks show the harness already type-checks some doc code |
| ACRYL handbook and cheatsheet, plugin docs | `docs/cordis/*`, `docs/cordisplugins/*`, `docs/plugin-development.md`, `docs/acryl/plugin-hot-reload.md` | corpus to sync; the cheatsheet lists doc-vs-source corrections that the pack must not regress |
| Plugin health (read-only): findings `state-unreadable`, `stale-override`, `unmanaged-override`, `bundle-not-composed`, `bundle-missing` | `runtime/acryl-harness-runtime/src/plugin-doctor.ts` | adjacent to, not the same as, the candidate verifier |
| Plugin lifecycle controller and state | `runtime/acryl-control/src/plugin/`, `acryl-harness-runtime/src/plugin-lifecycle*.ts` | activation, disable cascade, rollback |
| Install and reconcile: profile's own pnpm, `pnpm add`, reconcile `dsh.profile.bundles`, WAL rollback; live install via `ctx.livePluginActivation` (T2 of spec 032); `ACRYL_PLUGIN_WATCH` local auto-reload (T5); renderer reload for client-side changes (T3 reverted) | spec 031 `desktop-plugin-reconcile.ts`, spec 032 | **local live path** |
| Generated-module resolution for a not-yet-published row = a real local npm package via `pnpm add file:` + reconcile + `PluginLifecycleController.activate`; candidate workspace and checkpoint primitives (design only) | spec 033 B2, B3 | **local live path** for generated capabilities; verifier slot before activation |
| Marketplace: `cordis-plugin-market` (Host + Client, optional, disabled by default), catalog service on `acryl.dev` regenerated every 15 minutes from npm `acryl-package` keyword discovery, default source registered, install via `desktopPnpm` | spec 030 A and B done; C (npm distribution of the market client) and D (docs) not started | **marketplace path**; publish target is npm, visibility is the catalog |
| One inert example plugin | `examples/acryl-blend-demo` | the entire current example corpus |
| CLI ships `lib/**` and `README.md` only | `apps/acryl-cli/package.json` `files` | docs are not on disk for an installed user |
| Package boundaries: outer PNPM 11.8.0 isolated; upstream is a read-only submodule | constitution, `AGENTS.md` | pack is an owned workspace package; sync reads the submodule, never writes it |

## Q1 - What are the real plugin types and per-surface seams?

**Status**: open
**Gates**: T003 (matrix), T011 onward (docs and examples)

Known: `AcrylSurface` has three values; spec 034 says CLI/TUI has no client slot
UI and hosts commands, Web and Desktop host client slots (`ctx.slots.inject`,
e.g. `desktop.main`) and HTTP routes, Desktop adds `desktopProfiles` and
`desktopPnpm` in the Electron main process. The starting matrix in `spec.md` is
built from that and from the harness package map, not yet from a census.

To do: census the real rows. For each of `tui`, `web`, `desktop` boot the real
engine definition headlessly and list `ctx.loader.entries()` (method already used
in spec 034's research); map each row to a type; find the real TUI contribution
mechanism (Q6); confirm whether the real Loader unwraps `export default` (the
tutorial's `ctx.plugin(module)` did not) and what `cordis.patch.yml` row shapes
exist.

## Q2 - How is a `PromptSection` and a `SkillProvider` registered, and at what order?

**Status**: partly known - docs describe both, no ACRYL code uses either yet
**Gates**: T005, T006

Known: `PromptSection` sorts by ascending `order` then name and may be static
text or resolved from `AssembleContext`; a duplicate name throws; exactly one
`complete` section may exist; `PromptContext` is the durable dynamic counterpart.
`persona` is composed for `tui` only in `coding-capabilities.ts`. `dsh-skill-badge`
registers one immutable `bundled` candidate at `BUNDLED_SKILL_RANK` and exposes
its asset directory through `resourceBase`.

To do: read `packages/core/system-prompt/src/index.ts` and
`packages/skill/skill-badge/src` for the exact registration calls; decide the
section `order` (after the persona prefix, before per-turn context) and prove the
router is present in the assembled prompt on all three surfaces, since `persona`
is tui-only today and the router must not depend on it.

## Q3 - Can the pack be resolved and read from installed builds, including asar?

**Status**: open, high risk
**Gates**: T004, T017

Known: an installed CLI has only `lib/**` and `README.md`. Desktop is Electron;
files inside an `asar` archive are not readable by ordinary child-process or
external tools, and the agent's read tool is a filesystem read.

To do: decide the packaging (pack as a dependency of each surface package, or
publish separately), then test on a real installed CLI (`npm pack` of the CLI in
a scratch directory), a built Web runtime and a packaged Desktop app whether the
agent's read tool can open `docs.json`. If asar blocks it, the fallbacks are
`asarUnpack` for the pack or materializing the pack into
`<ACRYL_HOME>/context/<version>/` on first boot (an effect with a disposer and a
version check). Decision recorded here with the evidence before T017.

## Q4 - What does a headless Loader verifier need, and how does it relate to `plugin-doctor` and spec 033?

**Status**: open
**Gates**: T007, T008

Known: spec 019 established Loader smokes as headless-safe; the engine
definitions for each surface are `createDshEngineDefinition` (tui),
`createWebEngineDefinition` (web) and
`createDshEngineDefinitionFromComposition` (desktop). Spec 033 B1 defines a
`BlendRuntimeAdapter`; B3 defines candidate workspace and checkpoint primitives
as design only. `plugin-doctor` reports profile health and takes a snapshot.

To do: prototype the smallest composition that can mount one candidate package
per surface without a GUI, a network or the user's profile; list what a candidate
needs (its `inject` services must exist or be stubbed by declared fixtures);
decide whether the verifier is a new module in `acryl-harness-runtime` beside
`plugin-doctor`, and confirm with the 033 owner that it is the "tests gate" input
to B3 rather than a competing check.

## Q5 - Where does the eval harness live relative to spec 013 (trace-eval)?

**Status**: open
**Gates**: T023

Known: `specs/013-acryl-12-trace-eval` exists; its state was not read for this
draft. The tutorial harness (`agent-trajectory-tests`) has: WS client, goals read
from real events and files, run folders `result-of-run-<DD-MM-YY-HH-MMAM>-<runId>`,
usage and cache metrics, docs and examples read counts, previous-run comparison,
`--reset-workspace`.

To do: read spec 013; if it covers the same ground, 037's eval becomes tasks and
goals inside it; if not, port the harness as a package here with the run-folder
convention. Either way the goals must come from the verifier, not from agent prose.

## Q6 - What is the TUI extension seam, if any?

**Status**: open
**Gates**: T003 (matrix row 15), the TUI example

Known: the surface contract says plugins may declare TUI presentation slots, and
the first terminal surface adopts `tomowang/dsh-tui` 0.7.0 (pi-tui). No TUI
plugin example exists in this repo. Pi's `examples/plugins/pi-example-plugin`
builds separate Session-worker and TUI Chord facets, a possible model.

To do: read the TUI adapter source, find what a plugin can contribute (commands,
key chords, widgets), and either write the doc and example or record "no seam"
and mark the matrix row `n/a` with the reason.

## Q7 - Local live path: where does the agent write a package and does live activation work on every surface?

**Status**: open
**Gates**: T012, T013

Known: spec 031 verified `pnpm add --save-exact` plus reconcile against the
Desktop profile; spec 032 T2 landed `ctx.livePluginActivation`, T5 landed
`ACRYL_PLUGIN_WATCH`; spec 033 B2 decided a generated module is always a real
local npm package installed with `pnpm add file:`. The Desktop install code is in
`acryl-desktop`; spec 034 moves the lifecycle and install into a shared runtime
capability and gives the CLI `acryl plugin list|enable|disable|doctor`, not
`install`.

To do: confirm on each surface whether `ctx.livePluginActivation` exists and what
it reports; choose the local plugin workspace directory (profile-relative, so the
throwaway `ACRYL_HOME` in tests isolates it); confirm what a client-side change
costs (renderer reload per 032) and what a host-side change costs (none); confirm
the WAL rollback covers a failed local install. If CLI and Web lack live
activation, the plan states the surface-specific behavior (install, then a
documented reload) instead of pretending parity.

## Q8 - Marketplace path: what does a safe publish step look like?

**Status**: open
**Gates**: T014, T015

Known: catalog is built from npm `acryl-package` keyword discovery every 15
minutes (spec 030 A); `cordis-plugin-market` is private; the default source is
registered. Publishing to npm is public and effectively irreversible.

To do: define (a) the pre-publish lint (`acryl-package` keyword, manifest,
license, no secrets, declared surfaces match verifier result, `files` allowlist),
(b) the dry run (`npm pack --dry-run` and a local install of the produced
tarball into a throwaway profile, which also proves the packaged artifact and not
just the source directory works), (c) the credential source (the user's own npm
auth on the machine, never read by the agent) and the approval seam (existing
`dsh-authorization` and approval flow), (d) how the agent confirms catalog
visibility given the 15-minute refresh, without polling npm from a prompt. The
publish command is human-approved every time and is excluded from every
automated gate.

## Decisions taken in this draft (revisit if research contradicts)

- **D1** One private owned package, `plugins/acryl-extension-context`, holds docs,
  examples, skills, the runtime plugin and the verifier's fixtures. Constitution
  Part 42 of the handbook advises against splitting a small feature into three
  packages; roles are modules, not packages.
- **D2** Docs are canonical; skills are workflow triggers that link to docs and
  never restate them (one source of truth per fact).
- **D3** The pack is English only for now.
- **D4** The router is static text under a token budget; anything that changes
  per session goes through `PromptContext`.
- **D5** Eval tasks must have headroom and must exclude their own solution
  examples; a result of "no measurable lift" is a valid recorded outcome.
- **D6** Publishing is never part of an automated gate and never automatic.
