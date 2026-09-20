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

**Status**: resolved 2026-09-20 (three surfaces measured; matrix adjusted below)
**Gates**: T003 (matrix), T011 onward (docs and examples)

Known: `AcrylSurface` has three values; spec 034 says CLI/TUI has no client slot
UI and hosts commands, Web and Desktop host client slots (`ctx.slots.inject`,
e.g. `desktop.main`) and HTTP routes, Desktop adds `desktopProfiles` and
`desktopPnpm` in the Electron main process. The starting matrix in `spec.md` is
built from that and from the harness package map, not yet from a census.

**Measured 2026-09-20** (`evidence/census-tui-web.json`, reproduce with
`evidence/census.spec.ts.txt`; real `createDshEngineDefinition('acryl-test')` and
`createWebEngineDefinition(...)` on a temp `DSH_HOME`, `ctx.loader.entries()`):

| Surface | Rows | Notes |
| --- | --- | --- |
| tui | 89 | strict subset of web (no tui-only row) |
| web | 159 | adds 70 rows: `webserver`, `client-modules` (`modules`), `web-runtime`, `web-startup`, `plugin-inventory`, `community-market`, `ui-*` client plugins (chat, settings, plugins, skill, tool, sidebar, ...), `session-controller`, `workspace`, `file-upload`, ... |
| desktop | 168 | `apps/acryl-desktop/scripts/verify-loader-boot.mjs` with `DEBUG_VERIFY_LOADER_BOOT=1` (`evidence/census-desktop.json`); same count as spec 034; composes the same `system-prompt`, `skill`, `skill-filesystem`, `tool-skill`, `agent-instructions` rows as tui and web |

Spec 034 measured tui 88 and web 157 on 2026-09-12, so both drifted by +1 and +2
since; the matrix must be regenerated from a fresh census, never copied.

Host services present at boot: `systemPrompt`, `skills`, `tools`, `agentPresets`,
`sessions`, `agents`, `llm`, `livePluginActivation` on **both** tui and web;
`webServer`, `clientModules`, `pluginInventory` on web only. `slots` is absent on
both hosts: client slots belong to the Client Cordis generation in the renderer,
not the Host, so a client-slot example must be verified in a Client context
(open: how, T025).

**Export shapes (new, verified)**: the real Loader normalizes every module with
`unwrapExports(exports)`: `exports.default ?? exports` (plus `__esModule`
unwrapping) in `cordis-plugin-loader`. So `export default` **works** for
Loader-composed packages (profile bundles, installed plugins) and is **rejected**
by a bare `ctx.plugin(namespace)`. Measured hazard (`evidence/verifier-prototype-tui-web.json`):
a module with a default export **and** named `name`/`inject` normalizes to only
the default's own keys, so the named `inject: ['nonexistent-service']` was
silently dropped and the plugin mounted **ACTIVE** instead of PENDING. Rule for
the docs and the verifier: name-export form (`name`, `inject`, `Config`, `apply`)
is the portable form; a default export must carry its metadata itself; mixing is
an error finding (`default-with-named-metadata`).

**TUI seam (Q6, resolved)**: see Q6; the matrix row 15 is `tui` only.

**Client slots**: `slots` does not resolve on any Host (client slots belong to
the renderer's Client generation), so row 13 examples are verified against a
Client context, not the Host census. Matrix confirmed with these corrections:
row 12 (Host route) is web and desktop only (`webServer` is web only in the
census; desktop has `acryl-desktop/webserver`); rows 13-14 as specified; row 15
is `tui` only.

**Catalog artifact kinds (new)**: an ACRYL package's `acryl` manifest field
(`schemaVersion: 1`, `artifacts`) recognizes `plugins`, `extensions`, `adapters`,
`skills`, `workflows`, `blueprints`, `stemcells` (see Q8). The matrix types map:
1-8, 11-15 to `plugins`; 9 to `skills`; 10 to `adapters`; 17 to
`blueprints`/`stemcells` (exact mapping to confirm at T026).

Still to do: none for Q1; the type-by-type classification of the 168 rows is
deferred to when each doc is written. For each of `tui`, `web`, `desktop` boot the real
engine definition headlessly and list `ctx.loader.entries()` (method already used
in spec 034's research); map each row to a type; find the real TUI contribution
mechanism (Q6); confirm whether the real Loader unwraps `export default` (the
tutorial's `ctx.plugin(module)` did not) and what `cordis.patch.yml` row shapes
exist.

## Q2 - How is a `PromptSection` and a `SkillProvider` registered, and at what order?

**Status**: seams resolved on all three surfaces 2026-09-20 (desktop rows
confirmed in Q1); exact registration calls and `order` are read at T011
**Gates**: T005, T006

Known: `PromptSection` sorts by ascending `order` then name and may be static
text or resolved from `AssembleContext`; a duplicate name throws; exactly one
`complete` section may exist; `PromptContext` is the durable dynamic counterpart.
`persona` is composed for `tui` only in `coding-capabilities.ts`. `dsh-skill-badge`
registers one immutable `bundled` candidate at `BUNDLED_SKILL_RANK` and exposes
its asset directory through `resourceBase`.

**Measured 2026-09-20**: in the real tui and web boots the rows `system-prompt`
(`@deepseek-ai/dsh-system-prompt`), `skill`, `skill-filesystem`, `skill-badge`,
`tool-skill` and `agent-instructions` are all composed and `ctx.systemPrompt`,
`ctx.skills` and `ctx.tools` resolve. `ctx.agentInstructions` does not resolve
because that plugin exposes no ctx key (its README lists `-`); it works through
the session. So the router `PromptSection` and a bundled `SkillProvider` have a
seam on both measured surfaces with no dependence on the `persona` capability
(tui-only in `coding-capabilities.ts`), which removes the main risk in this Q.

To do: read `packages/core/system-prompt/src/index.ts` and
`packages/skill/skill-badge/src` for the exact registration calls; decide the
section `order` (after the persona prefix, before per-turn context) and prove the
router is present in the assembled prompt on all three surfaces, since `persona`
is tui-only today and the router must not depend on it.

## Q3 - Can the pack be resolved and read from installed builds, including asar?

**Status**: resolved 2026-09-20 with three corrections to the plan
**Gates**: T029 (shipping)

Known: an installed CLI has only `lib/**` and `README.md`. Desktop is Electron;
files inside an `asar` archive are not readable by ordinary child-process or
external tools, and the agent's read tool is a filesystem read.

**Measured 2026-09-20**:

1. **Desktop, packaged app** (`apps/acryl-desktop/dist/mac-arm64/ACRYL.app`): `app.asar`
   is a single 5.9 MB file. An external tool cannot read inside it (`cat
   app.asar/package.json` -> "Not a directory"), so shell and ripgrep-style child
   processes cannot see files that stay inside the archive. Electron's own Node
   `fs` (run-as-node, how the packaged runtime executes) reads asar paths
   transparently (`readFileSync`, `readdirSync` on `app.asar/lib` returned 77
   entries). The builder config has `asar: true` and `asarUnpack: ["package.json",
   "cordis.patch.yml", "build/**", "lib/**", "node_modules/**"]`; `Resources/app.asar.unpacked/node_modules`
   holds 273 real package directories. **A pack shipped as a dependency lands under
   `node_modules/**` and is therefore real files on disk.** `require.resolve` from
   inside the app returns the virtual `.../app.asar/node_modules/...` path, so
   the runtime plugin must map it to `.../app.asar.unpacked/...` before
   handing it to the agent (whose tools include child-process based search).
2. **The published CLI is a launcher, not `lib/**`**: `scripts/publish-npm-cli.mjs`
   builds an `acryl` selector package (`bin.js`, `runtime.js`, ...) plus
   per-platform `optionalDependencies` whose `files` are `runtime/**`, extracted
   from prepared archives (`scripts/build-cli-archive.mjs`, receipt-checked). The
   pack has to be inside those prepared runtime archives (CLI and Web,
   `build-web-archive.mjs`), and `scripts/inspect-artifact.mjs` and the release
   contract are the gates that will see it. The publish tsdown build
   (`tsdown.publish.config.ts`) bundles `acryl-control` and `acryl-harness-runtime`
   (`noExternal`); the pack must stay out of `noExternal` because docs and
   examples are assets, not JS.
3. **The release pruner deletes `test` and `tests` directories under
   `node_modules`** (`scripts/prune-release-payload.mjs`: `*.map` and
   `node_modules/**/(test|tests)/**`). Example packages must not keep files in
   directories named `test` or `tests`, or a shipped pack silently loses them. The
   data model uses `checks/` instead.

Decision: ship the pack as a normal `dependencies` entry of each surface package
(so it is under `node_modules` in every prepared archive and `asarUnpack`ed in
Desktop), resolve it at runtime with `createRequire(...).resolve(
'acryl-extension-context/package.json')`, map `app.asar` to `app.asar.unpacked`
where present, and fail the release inspection if the pack is absent. No
materialization to `<ACRYL_HOME>` is needed; it stays as the fallback only if T029
finds a surface where the dependency is pruned.

Original plan text: decide the packaging (pack as a dependency of each surface package, or
publish separately), then test on a real installed CLI (`npm pack` of the CLI in
a scratch directory), a built Web runtime and a packaged Desktop app whether the
agent's read tool can open `docs.json`. If asar blocks it, the fallbacks are
`asarUnpack` for the pack or materializing the pack into
`<ACRYL_HOME>/context/<version>/` on first boot (an effect with a disposer and a
version check). Decision recorded here with the evidence before T017.

## Q4 - What does a headless Loader verifier need, and how does it relate to `plugin-doctor` and spec 033?

**Status**: resolved 2026-09-20 (tui and web prototyped; desktop via the existing
gate)
**Gates**: T015

**Measured 2026-09-20** (`evidence/verifier-prototype-tui-web.json`,
`evidence/verifier-prototype-leak-tui-web.json`; reproduce from the `.spec.ts.txt`
files): six fixtures mounted into the real tui and web hosts, normalized with the
host Loader's own `unwrapExports`, mounted with `host.ctx.plugin(...)` and observed:

| Fixture | tui | web | Observable |
| --- | --- | --- | --- |
| named export, `inject: ['tools']`, provides a service | ACTIVE | ACTIVE | state, service |
| `inject: ['nonexistent-service']` | PENDING | PENDING | unmet inject by name: `ctx.get(name) === undefined` |
| default-export namespace | ACTIVE | ACTIVE | normalized keys `name,apply` |
| default + named metadata | ACTIVE | ACTIVE | normalized keys `apply` only: **metadata dropped** |
| `apply()` throws | FAILED | FAILED | real error text `deliberate failure` |
| bare `setInterval` in `apply()` | ACTIVE | ACTIVE | leak: 3 timers live after dispose vs baseline 2 |
| timer inside `ctx.effect` | ACTIVE | ACTIVE | after dispose: back to baseline 2 |

Design consequences: (1) mount into the **real surface host**, not a stub, so a
candidate's `inject` resolves against real services; (2) always normalize through
the host Loader so the verifier matches production; (3) leak detection needs a
timer-tracking shim active only during the candidate's mount and dispose, with the
baseline taken from a warm-up no-op mount, because the host itself holds 2 timers
(5 during the first web mount) and `process.getActiveResourcesInfo()` diffs are
too noisy (first attempt produced a false positive and a false negative); (4) a
FAILED fixture still needs disposing; (5) for `tuiCommands` and other services the
CLI host provides in `prepare` (Q6), the verifier supplies the same `prepare`.
Desktop: `verify-loader-boot.mjs` already mounts a third-party package
(`dsh-desktop-loader-smoke-plugin`) in the real Desktop Loader tree; the desktop
verifier reuses `prepareDesktopProfile` plus `boot`, needs `--expose-internals`
and the built `lib/`, and is therefore the slowest surface (tui/web verify in
about 4 s on this machine). Module home: `runtime/acryl-harness-runtime/src/plugin-verify.ts`,
beside and independent of `plugin-doctor.ts` (which reads a profile snapshot);
a note for spec 033 B1/B3 is added when T015 lands.

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

**Status**: resolved 2026-09-20
**Gates**: T031

Known: `specs/013-acryl-12-trace-eval` exists; its state was not read for this
draft. The tutorial harness (`agent-trajectory-tests`) has: WS client, goals read
from real events and files, run folders `result-of-run-<DD-MM-YY-HH-MMAM>-<runId>`,
usage and cache metrics, docs and examples read counts, previous-run comparison,
`--reset-workspace`.

**Resolved**: `specs/013-acryl-12-trace-eval/spec.md` is an unfilled stub ("This
file is a placeholder. Do not implement from it."), with one note: "Traces are a
product asset with privacy boundaries." So the eval harness lives in 037
(`plugins/acryl-extension-context/evals/`) and 013 stays untouched; 013 may later
absorb it. The privacy note changes the tutorial's habit: full trajectories of real
sessions contain user prompts and file contents, so eval run folders keep full
trajectories in a gitignored local `results/` directory and only `summary.json`
files are committed. Task inputs are synthetic.

Original: read spec 013; if it covers the same ground, 037's eval becomes tasks and
goals inside it; if not, port the harness as a package here with the run-folder
convention. Either way the goals must come from the verifier, not from agent prose.

## Q6 - What is the TUI extension seam, if any?

**Status**: resolved 2026-09-20
**Gates**: the TUI doc and example (T025)

Known: the surface contract says plugins may declare TUI presentation slots, and
the first terminal surface adopts `tomowang/dsh-tui` 0.7.0 (pi-tui). No TUI
plugin example exists in this repo. Pi's `examples/plugins/pi-example-plugin`
builds separate Session-worker and TUI Chord facets, a possible model.

**Resolved (read `apps/acryl-cli/src/tui/tui-commands-service.ts`)**: there is a
real seam, added by spec 034 T009. A plugin's Host `apply(ctx)` calls
`ctx.get('tuiCommands')?.register({ command, description, packageName?, overlay?,
open({ tui, close }) => Component })`, where `Component` is a `pi-tui` component
pushed on the overlay stack; `register` returns a disposer to wrap in `ctx.effect`;
a name collision never throws (disambiguated as `/cmd:<pkg>` and
`/plugin:<pkg>/cmd`). `TuiCommandsService` is provided once in the CLI host's
`prepare` hook (`host/direct.ts`), so it exists only on tui: it must be read with
`ctx.get` (optional), never `inject`, and it is `undefined` on web and desktop.
Documented trap: a `Service`'s `this.ctx` is its construction scope, not the
caller's, so registration must not read `this.ctx.loader` or `this.ctx.fiber`.
Web's counterpart is the `dsh.client` slot registry. The TUI is a `pi-tui`
(`@earendil-works/pi-tui` 0.84.2) application. Matrix row 15 is `tui` only.

Original: read the TUI adapter source, find what a plugin can contribute (commands,
key chords, widgets), and either write the doc and example or record "no seam"
and mark the matrix row `n/a` with the reason.

## Q7 - Local live path: where does the agent write a package and does live activation work on every surface?

**Status**: resolved 2026-09-20 on tui with real measurements; web shares the same
implementation, desktop has its own recovery log (both re-measured in T018)
**Gates**: T018

**Measured 2026-09-20**: `ctx.livePluginActivation` is defined in the real tui and
web boots (`evidence/census-tui-web.json`), not only Desktop. That makes a live
local path plausible on all three surfaces; it does not yet show that install
(`pnpm add file:` plus reconcile) works off Electron (spec 034 Q2/T006 owns that
question for the market and is the dependency to check).

Known: spec 031 verified `pnpm add --save-exact` plus reconcile against the
Desktop profile; spec 032 T2 landed `ctx.livePluginActivation`, T5 landed
`ACRYL_PLUGIN_WATCH`; spec 033 B2 decided a generated module is always a real
local npm package installed with `pnpm add file:`. The Desktop install code is in
`acryl-desktop`; spec 034 moves the lifecycle and install into a shared runtime
capability and gives the CLI `acryl plugin list|enable|disable|doctor`, not
`install`.

**Measured 2026-09-20 (tui host, temp `DSH_HOME`, no network)**:
`evidence/q7-live-local-install-tui.json`,
`evidence/q7-explicit-activation-and-failure-tui.json` (first attempt, failed for a
real reason), `evidence/q7-explicit-activation-fixed-exports-tui.json`:

1. **Install**: `dsh plugin --profile <name> add file:<dir>` (a thin wrapper over
   `pnpm add`) works offline in about 0.45 s, writes the dependency **and**
   reconciles the package into `dsh.profile.bundles`. pnpm **copies** a `file:`
   package into the profile (a snapshot): later edits to the source directory are
   not reflected until it is added again. A `link:` specifier would track edits and
   is the candidate for the edit-and-see loop (untested; decided at T018).
2. **Next boot**: the installed plugin's row mounts ACTIVE and its service resolves
   (boot 617 ms).
3. **While running**: an install from outside is **not** picked up by the running
   host on its own (10 s poll, no change) even though the profile has
   `patchReload: "live"`. Live activation is an explicit call:
   `ctx.get('livePluginActivation').activate(packageName)` (also `deactivate`,
   `setEnabled`, `statusOf`), backed by the shared plugin lifecycle controller.
   It took 4 ms and the service was live, status `active`, no restart.
4. **Hard requirement found**: `activate` resolves `<package>/package.json`, so the
   package's `exports` **must** include `"./package.json"`. With the form the
   `hello-world` guide teaches (`"exports": "./index.js"`) activation failed with
   `Package subpath './package.json' is not defined by "exports"` although the
   package installed and would mount on the next boot. This is a documentation
   defect to fix and a verifier lint (`package-json-not-exported`).
5. **Failure is loud and non-corrupting for the host, but not rolled back**: a
   plugin whose `apply()` throws makes `activate` reject with `Plugin <name> failed
   to activate: failed to apply loader entry ... : deliberate failure in apply`;
   the host stayed healthy (other services still resolve); but the package **stays
   in `dsh.profile.bundles`**, so the next boot would mount it and fail again.
   `dsh plugin --profile <name> remove <pkg>` (exit 0) removed it. CLI and Web
   have **no crash-recovery log** (`cli-market-install.ts` and `web-market-install.ts`
   say so explicitly; Desktop's `install-recovery.ts` is Electron-specific). So
   `install --local` implements compensation itself: verify first (prevents most
   failures), then add, then activate, and on any failure run `remove`.
6. **Ordering trap** (documented in `engine-dsh.ts`): a consumer that reads
   `ctx.get('livePluginActivation')` once at inject time captures `undefined` if the
   service is provided later, and installs then succeed silently without going live.
   `install --local` reads it at call time.
7. **Local package directory**: nothing requires a fixed location because pnpm
   copies from any path; the decision is a per-profile directory next to the
   profile (`<profile>/plugins-local/<name>/`) so a throwaway `DSH_HOME` isolates
   it and the source stays with the profile that owns it.

Not measured here: web (same `provideWebMarketPlugins` controller, expected the
same) and desktop (Electron, own recovery log). T018 records both before claiming
parity, and the plan states the difference if there is one.

Original to do: confirm on each surface whether `ctx.livePluginActivation` exists and what
it reports; choose the local plugin workspace directory (profile-relative, so the
throwaway `ACRYL_HOME` in tests isolates it); confirm what a client-side change
costs (renderer reload per 032) and what a host-side change costs (none); confirm
the WAL rollback covers a failed local install. If CLI and Web lack live
activation, the plan states the surface-specific behavior (install, then a
documented reload) instead of pretending parity.

## Q8 - Marketplace path: what does a safe publish step look like?

**Status**: resolved 2026-09-20 (design and dry-run proven; no real publish)
**Gates**: T019, T020, T021

Known: catalog is built from npm `acryl-package` keyword discovery every 15
minutes (spec 030 A); `cordis-plugin-market` is private; the default source is
registered. Publishing to npm is public and effectively irreversible.

**Measured and read 2026-09-20**:

1. **What the catalog lists** (`acryldev.github.io/scripts/lib/acryl-catalog.mjs`,
   `sync-acryl-catalog.mjs`): npm search `keywords:acryl-package`; then the package's
   `latest` manifest must be an object with string `name` and `version`, and
   `keywords` must include the **exact** `acryl-package`. Optional `acryl` field is
   inspected: `schemaVersion: 1`, `artifacts` keyed only by `plugins`, `extensions`,
   `adapters`, `skills`, `workflows`, `blueprints`, `stemcells` (non-empty), each a
   list of safe relative paths (no absolute, no `..`, no URL), optional `capabilities`
   string array; result `valid`, `invalid` or `missing`. An install hint appears only
   when `dsh.bundle` exists. `repository` is used only if it is a GitHub URL, else
   the entry links to the npm page. Installs stay through npm; the catalog hosts no
   tarballs (spec 030).
2. **Pre-publish lint therefore is**: exact `acryl-package` keyword; `acryl` manifest
   valid with `plugins`/`skills`/`adapters` paths that exist in `files`; `dsh.bundle.patch`
   present and in `files`; `exports` includes `./package.json` (Q7); GitHub
   `repository`; non-empty `description`; `license`; `version` not already published
   (a publish would fail); no secrets or dotfiles in the tarball; declared surfaces
   equal the verified surfaces; no `default` export mixed with named metadata (Q1).
3. **Dry run, verified** (`evidence/q8-tarball-install-boot-tui.json`, fixture
   `acryl-fx-publishable-037`): `npm pack --dry-run --json` (no network) lists the
   exact files and size; `npm pack` produces the tarball; **`npm publish --dry-run`
   needs no credentials, prints the full tarball details and "(dry-run)", and cannot
   upload**; `dsh plugin --profile <p> add file:<tarball>` into a fresh profile then
   boot gives row present, service live, status `active`. So "the packed artifact,
   not the source directory, is what was proven" is achievable headlessly.
4. **Existing convention**: `scripts/publish-npm-cli.mjs` opens with "Assemble npm
   tarballs only. Publication remains an explicit release-CI action" and has a
   `--pack-only` mode. `acryl plugin publish` follows it: prepare is automatic and
   safe; publication is a separate explicit act.
5. **Credential and approval design**: the publish command runs `npm publish` as the
   user's own process with the user's own npm authentication; the agent never reads
   `~/.npmrc` or a token. **No agent tool for publish is registered at all**: the
   agent gets `acryl_verify_plugin` and a prepare-only tool, and the publish
   command additionally refuses to run without an interactive TTY and a typed
   confirmation that repeats the package name and version. This is a structural
   guarantee (no tool to misuse) rather than a policy check. The harness approval
   service (`ctx.approval`) is not needed for a human-only command and is noted as
   an option if a future policy wants agent-initiated publish requests.
6. **Visibility**: the catalog regenerates about every 15 minutes from npm search,
   and npm's own search index lags a publish by a variable delay, so the agent cannot
   promise immediate listing. Confirmation reads the catalog's own JSON
   (`https://acryl.dev/v1/plugins`) for the package name and reports "not visible
   yet, refresh pending" honestly. Not exercised here (no publish, no network).

Original to do: define (a) the pre-publish lint (`acryl-package` keyword, manifest,
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
- **D7** Ship the pack as a `dependencies` entry of each surface package, resolved
  at runtime, with `app.asar` mapped to `app.asar.unpacked`; example packages avoid
  `test` and `tests` directory names (`checks/` instead) because the release pruner
  deletes them.
- **D8** No agent-callable publish tool exists. Prepare is automatic; publish is a
  human-only, TTY-confirmed command.
- **D9** `install --local` = verify, `dsh plugin add file:`, explicit
  `livePluginActivation.activate`, and compensating `dsh plugin remove` on any
  failure, because CLI and Web have no recovery log.
- **D10** Named exports are the documented portable plugin form; a default export
  is accepted by the real Loader but mixing it with named metadata is an error.
- **D11** Eval full trajectories stay local and gitignored (privacy note in spec
  013); only summaries are committed.
