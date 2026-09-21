# Tasks: guardrailed self-extension

Ordered. Each task lands as its own commit with its evidence; a task that cannot
show its evidence is not done. Work directly on `main` (repo rule), commit each
coherent change promptly, and record each landed task in
`docs/DEVELOPMENT-LOG.md` in a separate documentation commit after the
implementation commit. Never stage with `git add .` or `-A`; the working tree
holds unrelated untracked files.

## Status (2026-09-20)

Landed: T005/T011/T012/T013 (runtime plugin, router, composition on web, desktop AND CLI, real-engine evidence),
T010/T023-T027 in reduced form (docs for 11 extension topics, 13 verified examples, 4 skills, manifest tooling and
tests), T018 local live install/update/remove (incl. Desktop fallback), T017 in reduced form (`acryl_verify_plugin`
tool: lint plus import and shape check with doc ids; no CLI command, no mount-based scenario run), T019 as a
dry-run tool (`acryl_prepare_publish`), T028 pointers, T029 (pack is a public dependency of acryl-cli, acryl-web,
acryl-desktop and the runtime; `pnpm pack --dry-run` shows docs, examples and skills), T030 (enabled everywhere),
plus `/reload`.
Not landed, by recorded reason: T014 is the owner's human test, deliberately not automated; T015/T016 full verifier
and gate (mount-based checks deferred; the manifest gate, the router budget test, the coverage test and the real-engine example test exist); T020/T021 publish and
catalog visibility stay human; T031-T034 eval and tuning are P2 (an opt-in real-model end-to-end run exists, see HUMAN-TEST.md, but no baselines or with/without-docs comparison); T022 corpus sync landed (80 reference docs, `scripts/sync-corpus.mjs`);
installed-build evidence for T029 needs a release build and is unverified. Follow-up: publish
`acryl-extension-context` to npm once before the next acryl-web release.

## Priority order (2026-09-20): self-extension working ASAP

Direction from the owner: get the pi.dev-style self-extension loop working first,
**Web and Desktop before CLI**, and do not spend effort on anything that is not on
that path. Multi-language docs are out of scope: the pack is **English only**; other
languages may be added later and nothing here should be shaped around them (the
repo's bilingual-docs gate does not apply to the pack, which has no `*.i18n.yaml`).

**P0 - the critical path (do these, in this order):**

1. **T011** runtime plugin: `extensionContext` service and the router `PromptSection`.
2. **T012 + T013** compose it on **web and desktop first**, with the assembled-prompt
   evidence; CLI is enabled afterwards with the same data change.
3. **T018a** an agent-callable **install tool** (`acryl_install_plugin`): mount-check,
   `dsh plugin add file:`, explicit `livePluginActivation.activate`, compensating
   `remove`. Without this the agent can write a plugin but cannot make it live
   (activation is not reachable from a shell), so this is what makes the loop close.
4. **T010** just enough docs and examples to author a working plugin: tool plugin,
   client slot (web/desktop), and local live delivery.
5. **T014** a real agent, on Web then Desktop, writes a plugin and it goes live.

**P1 - after the loop works:** T015-T017 full verifier and CLI command, T029 shipping
in release archives (needed before this reaches installed users), then CLI enablement.

**P2 - only if needed later:** T019-T021 marketplace publish, T022-T028 full corpus,
per-type coverage and skills, T031-T034 eval and tuning. Skipped for now; not required
for self-extensibility.

Slice 0 (T001-T008) is **complete as of 2026-09-20**: every gate was answered with
measured evidence in `research.md` and folded into the spec, plan and data model.
Slices 1 and 2 are the walking skeleton. Every task keeps
`corepack pnpm run check` green.

Paths: `runtime/acryl-harness-runtime`, `runtime/acryl-control`, `apps/acryl-cli`,
`apps/acryl-web`, `apps/acryl-desktop`, `plugins/acryl-extension-context` (new).

---

## Slice 0 - Research gates

## T001 - Census the real plugin types and per-surface rows (Q1)

**Files**: `research.md`, a throwaway script under `specs/037-guardrailed-self-extension/evidence/`
**Do**: for each of `tui`, `web`, `desktop`, boot the real engine definition
headlessly with a throwaway `ACRYL_HOME` and dump `ctx.loader.entries()` (the
method used in spec 034's research). Classify every row into a plugin type. Also
determine whether the real Loader accepts `export default` and what
`cordis.patch.yml` row shapes exist.
**Evidence**: the three dumps and the classification table in `research.md`.
**Done when**: Q1 is resolved and the spec's coverage matrix is either confirmed
or corrected with the measured differences.

**Done 2026-09-20**: tui 89, web 159 and desktop 168 rows measured
(`evidence/census-tui-web.json`, `evidence/census-desktop.json`); the Loader's default-export
unwrapping and its metadata-drop hazard verified; matrix corrected in `spec.md`.

## T002 - Answer the prompt-section and skill-provider questions (Q2)

**Files**: `research.md`
**Do**: read `deepseek-harness/packages/core/system-prompt/src/index.ts` and
`packages/skill/skill-badge/src`; write a throwaway plugin that registers a
`PromptSection` and a bundled `SkillProvider`; assemble the prompt on each
surface's engine and show the section present and its position relative to
`persona` (tui only today).
**Evidence**: assembled prompt excerpts per surface, the exact registration
calls, the chosen `order` value and why.
**Done when**: Q2 is resolved and the router is shown to be independent of
`persona`.

**Partial 2026-09-20**: `systemPrompt`, `skills` and `tools` resolve and the
system-prompt, skill and agent-instructions rows are composed on all three surfaces
with no `persona` dependency. Exact registration calls, `order` and the
assembled-prompt capture are read at T011.

## T003 - Fix the coverage matrix and the TUI seam (Q6)

**Files**: `spec.md` (matrix), `research.md`
**Do**: from T001, finalize the type list and per-surface applicability. Read the
TUI adapter source and determine what a plugin can contribute there; record
"no seam" with the reason if none.
**Evidence**: the matrix with every `(?)` resolved; the TUI finding with source
references.
**Done when**: the matrix has no open marks and `PluginTypeId` in
`data-model.md` matches it exactly.

**Done 2026-09-20** (matrix finalized; TUI seam is `tuiCommands`, see `research.md` Q6).

## T004 - Prototype the headless verifier composition (Q4)

**Files**: `research.md`, `specs/037-guardrailed-self-extension/evidence/`
**Do**: smallest headless composition that mounts one candidate package per
surface without GUI, network or the user's profile; list what a candidate needs
(fixtures for its `inject`); confirm the relationship to `plugin-doctor.ts` and to
spec 033 B1 and B3 with a note in that spec.
**Evidence**: a prototype run mounting the same fixture package on all three
engine definitions, with fiber states.
**Done when**: Q4 is resolved and the module home for the verifier is decided.

**Done 2026-09-20** (tui and web prototype, desktop via the existing gate; `research.md` Q4).

## T005 - Establish the local live path per surface (Q7)

**Files**: `research.md`
**Do**: on a throwaway `ACRYL_HOME`, take a local package through `pnpm add file:`
plus reconcile plus live activation on Desktop, then determine what exists on CLI
and Web (`ctx.livePluginActivation`, spec 034's shared capability). Determine the
local plugin workspace directory and what a client-side change costs. Confirm the
write-ahead-log rollback on a forced failure.
**Evidence**: before and after fiber states, the profile bundle diff, the rollback
result, per surface.
**Done when**: Q7 is resolved and the plan's local-delivery section states the
real per-surface behavior.

**Done 2026-09-20** on tui with measurements; web and desktop parity re-measured in T018 (`research.md` Q7).

## T006 - Design the safe publish step (Q8)

**Files**: `research.md`
**Do**: define the lint list, the dry run (`pnpm pack` plus install of the tarball
in a throwaway profile), the credential source and approval seam, and how catalog
visibility is confirmed given the 15-minute refresh. No real publish.
**Evidence**: a dry run producing a tarball for a fixture package and mounting it;
the approval flow sketched against `dsh-authorization`.
**Done when**: Q8 is resolved with the negative lint cases listed.

**Done 2026-09-20** (design and dry run proven, no publish; `research.md` Q8).

## T007 - Decide where eval lives (Q5)

**Files**: `research.md`
**Do**: read `specs/013-acryl-12-trace-eval`; decide between tasks inside 013 and a
package here; record which tutorial harness parts are reused.
**Evidence**: the decision and the reused components list.
**Done when**: Q5 is resolved.

**Done 2026-09-20** (spec 013 is a stub; eval lives here; `research.md` Q5).

## T008 - Packaging spike for installed builds (Q3)

**Files**: `research.md`
**Do**: with a placeholder pack, test that the agent's read tool can open a file at
the resolved path from (a) an `npm pack`ed CLI installed in a scratch directory,
(b) a built Web runtime, (c) a packaged Desktop app (asar and `asarUnpack`).
Decide dependency versus materialization to `<ACRYL_HOME>/context/<version>/`.
**Evidence**: read success or failure per build, with the failing mechanism named.
**Done when**: Q3 is resolved and the shipping mechanism for Slice 5 is chosen.

---

**Done 2026-09-20** (asar, release archives and pruner measured; `research.md` Q3).

## Slice 1 - Route (walking skeleton, part 1)

## T009 - Create the pack package and manifest tooling

**Files**: `plugins/acryl-extension-context/**`, `pnpm-workspace.yaml`,
`plugins/acryl-extension-context/scripts/build-manifest.mjs`
**Do**: private package per `data-model.md`; manifest schema with runtime
validation; `build-manifest.mjs` validates the manifest and regenerates
`docs/README.md` and `example-plugins/README.md`. Fail on an unlisted file, a missing
path, an unresolved id or an empty `surfaces`.
**Evidence**: unit tests for every invariant failing as specified; a clean run on
the seed content.
**Done when**: the package installs under the isolated PNPM workspace and the
tooling passes and fails correctly.

**Landed 2026-09-20, commit `6f66220fa118b1862a0fe3b3947349ccf0aceb07`.** Twelve `node:test` cases cover every invariant and the build and `--check` modes; layout, architecture and debt gates pass.

## T010 - Seed docs and two examples

**Files**: `plugins/acryl-extension-context/docs/{start-here,extending}/**`,
`example-plugins/packages/**`, `examples/scenarios.json`
**Do**: write `start-here/this-runtime.md`, `start-here/verify-before-done.md` and
`extending/tool-plugin.md`; two real example packages (lifecycle function plugin,
tool plugin) each with header, scenario and tests. Contracts come from measured
behavior (T001), not memory.
**Evidence**: both scenarios pass on every surface they declare.
**Done when**: manifest tooling passes and each doc names its example.

**Landed 2026-09-20 (T009), commit `6f66220fa118b1862a0fe3b3947349ccf0aceb07`.** The package, manifest validator, index generator and 12 tests. The T010 seed (two start-here docs and the lifecycle-function example) landed with it so the package check is green on its own; the tool-plugin doc and example remain.

## T011 - Runtime plugin: service, router section, path resolution

**Files**: `plugins/acryl-extension-context/src/{index,definition,provider-package,prompt-router}.ts`
**Do**: implement the mini-design in `plan.md`: `extensionContext` service,
router `PromptSection` generated from the manifest, runtime pack-root resolution,
Schemastery config, every registration an effect with a disposer.
**Evidence**: unit tests for router text and budget; activation, `PENDING` without
`systemPrompt`, provider replacement, disposal and re-mount leave exactly one
section and no leak.
**Done when**: the plugin passes its own Loader scenarios (Cordis mini-design
item 6).

## T012 - Compose on tui, then web and desktop

**Files**: `runtime/acryl-harness-runtime/src/coding-capabilities.ts`, its tests
**Do**: add capability `extension-context` with `surfaces` declarations (a data
change, spec 034). Enable `tui` first; add `web` and `desktop` once T013 passes
for each.
**Evidence**: table-driven test of composed row ids per surface; suites green.
**Done when**: enabling a surface is a data change and the row appears exactly
where declared.

## T013 - Assembled-prompt evidence per surface

**Files**: `runtime/acryl-harness-runtime/tests/*`, `evidence/`
**Do**: cold start each surface on a throwaway `ACRYL_HOME`; capture the assembled
system prompt; assert the router section, an existing pack path and the budget.
**Evidence**: the three captures, budget number, path check.
**Done when**: the prompt on each surface contains the router and points at files
that exist.

## T014 - First real-agent evidence

**Files**: `evidence/`
**Do**: in a real session, ask for a small tool plugin; record the trace showing the
agent reading the routed doc and the nearest example. No verifier yet.
**Evidence**: the session trace with the reads highlighted.
**Done when**: the agent's first plugin attempt is preceded by manifest-routed
reads, or the shortfall is written into `research.md` and the router text is
adjusted (recorded, not silently tuned).

---

## Slice 2 - Verify (walking skeleton, part 2)

## T015 - Verifier core

**Files**: `runtime/acryl-harness-runtime/src/plugin-verify.ts`,
`plugins/acryl-extension-context/src/verify/**`, tests
**Do**: implement `VerifyReport` per `data-model.md`: import, shape, mount per
declared surface on the real engine definitions, unmet `inject`, provides,
leaked effects after dispose, repeated mount, surface declared versus mounted,
manifest, permissions, tests and provenance lint. Findings carry manifest doc ids.
Never touches the user's profile.
**Evidence**: one fixture per `VerifyCode`, each producing exactly that finding.
**Done when**: the verifier reports the real underlying error text and never
crashes on a broken package.

## T016 - Scenario runner and the pack gate

**Files**: `plugins/acryl-extension-context/scripts/verify-pack.mjs`, root
`package.json` script `verify:extension-context`, `check` wiring
**Do**: run every scenario per declared surface; enforce FR-015 (index
completeness, example paths named in docs exist, router budget, router present
per surface); wire into `corepack pnpm run check`.
**Evidence**: gate green on seed content; red on each deliberate breakage
(unlisted doc, failing scenario, oversized router, dangling example path).
**Done when**: the gate fails for every FR-015 condition.

## T017 - `acryl plugin verify` and the agent tool

**Files**: `apps/acryl-cli/src/**`, `plugins/acryl-extension-context/src/verify/tool.ts`
**Do**: CLI command with `--json` matching other CLI commands and non-zero exit on
error findings; tool `acryl_verify_plugin` registered when `tools` exists.
**Evidence**: a broken fixture through both entry points; a real session where the
agent runs the tool, receives a finding with doc ids, reads that doc and fixes it.
**Done when**: a real agent loop closes: write, verify, read the pointed doc, fix,
verify green.

---

## Slice 3 - Deliver

## T018 - Local live install

**Files**: `runtime/acryl-harness-runtime/src/**` (shared install entry, per spec
034), `apps/acryl-cli/src/**`, Desktop thin adapter
**Do**: `acryl plugin install --local <dir>` returning `LocalInstallResult`: verify
first (refuse on error findings), `pnpm add file:` in the profile's own pnpm,
reconcile bundles, activate live, roll back on failure. Surface-specific activation
outcome per T005. No second copy in a surface.
**Evidence**: throwaway profile: package ACTIVE with fiber states and bundle diff;
a failing package rejected by verify; a forced install failure rolled back to the
prior profile state.
**Done when**: on each surface the agent can go from written package to active
plugin with no marketplace and no runtime restart, or the docs state the exact
surface-specific step (`reload-required`).

## T019 - Marketplace preparation

**Files**: `plugins/acryl-extension-context/src/publish/**`, CLI
**Do**: `acryl plugin publish --prepare`: pack, lint, install the tarball into a
throwaway profile and mount it, return `PublishPrepResult`. No network, no
credentials.
**Evidence**: green fixture; red fixtures for missing `acryl-package` keyword,
missing license, secrets in `files`, declared surfaces differing from verified.
**Done when**: `readyForHumanPublish` is true only when every check is green and
the packed artifact itself mounted.

## T020 - Human-approved publish

**Files**: CLI, approval integration
**Do**: `acryl plugin publish` consumes a `PublishPrepResult`, displays tarball
contents, version and registry, requires fresh explicit confirmation through the
existing approval seam, uses the user's own npm authentication, and is refused
from any non-interactive or agent-only path.
**Evidence**: refusal without approval; refusal when prepare was not green;
attended dry-run against a scratch registry (for example a local Verdaccio) showing
the full flow. A real npm publish is a separate, human-attended, recorded run.
**Done when**: no automated path can publish, proven by a test that tries.

## T021 - Marketplace visibility and install confirmation

**Files**: `research.md`, docs
**Do**: agent-usable confirmation that a published package appears in the catalog
(through the market client's source read API), with an honest "pending refresh"
state; install through the market as a user would.
**Evidence**: attended run against the real catalog for a test package, with
timings versus the 15-minute refresh.
**Done when**: the flow is documented with its real delay and failure modes.

---

## Slice 4 - Cover

## T022 - Corpus sync script

**Files**: `plugins/acryl-extension-context/scripts/sync-corpus.mjs`, `docs/guide/**`, `docs/harness/**`, `docs/reference/**`
**Do**: split the handbook by Part; sync cheatsheet, plugin docs, harness cookbook
and subsystem docs relevant to authors; tag surfaces and applicability; stamp
provenance; idempotent; refuse a dirty or unpinned source; never write inside
`deepseek-harness/`. Reuse the approach proven in the tutorial's
`sync-agent-docs.mjs`.
**Evidence**: two consecutive runs produce no diff; a dirty source is refused;
provenance present on every synced file.
**Done when**: the synced corpus is manifest-indexed and the gate passes.

## T023 - Docs and verified examples: core types

**Files**: `docs/extending/`, `example-plugins/packages/`
**Do**: lifecycle function, service provider, service consumer (hard and optional),
event hook (including waterfall calling `next()`), config schema (valid and invalid),
three-role capability with provider swap. One doc, one example, one scenario each,
on every surface each claims.
**Evidence**: scenarios pass per surface; each doc cites its example.
**Done when**: matrix rows 1, 2, 3, 5, 6, 7 are complete.

## T024 - Docs and verified examples: agent-facing types

**Files**: `docs/extending/`, `example-plugins/packages/`
**Do**: tool (already seeded), prompt contribution (`PromptSection` and
`PromptContext`), skill provider and bundled skill, LLM adapter, agent preset or
subagent, diagnostics (FAILED, PENDING, leak after reload).
**Evidence**: scenarios pass per surface.
**Done when**: matrix rows 4, 8, 9, 10, 11, 18 are complete.

## T025 - Docs and verified examples: surface-specific types

**Files**: `docs/extending/`, `docs/surfaces/`, `example-plugins/packages/`
**Do**: Host route or RPC, client slot plugin (settings card), Desktop-main plugin
(`desktopProfiles`, `desktopPnpm`), TUI contribution (or the recorded "no seam"),
each declared only for the surfaces that have the seam; the docs say what is absent
on the others. `surfaces/{tui,web,desktop}.md` written from the T001 census.
**Evidence**: scenarios pass on the declared surfaces; the census numbers cited in
the surface docs match a fresh dump.
**Done when**: matrix rows 12, 13, 14, 15 are complete.

## T026 - Docs and verified examples: packaging and generated capabilities

**Files**: `docs/extending/`, `docs/lifecycle/`, `docs/delivery/`, `example-plugins/packages/`
**Do**: packaging (bundle, `cordis.patch.yml`, profile install), the generated
capability package (manifest, logic, UI projection, permissions, tests,
provenance, HOT/WARM/COLD), rollback, hot-reload limits, and the two delivery
docs with an install-and-activate scenario and a pack-and-lint scenario.
**Evidence**: scenarios pass; the delivery docs' commands were run verbatim.
**Done when**: matrix rows 16, 17 and both delivery docs are complete.

---

## Slice 5 - Skills and shipping

## T027 - Bundled authoring skills

**Files**: `plugins/acryl-extension-context/skills/**`, `src/skill-provider.ts`
**Do**: a small set (author-plugin, author-tool, author-client-slot, verify-plugin,
deliver-plugin) that are workflow triggers linking to manifest docs, registered at
the bundled rank so a project or user skill overrides them. No restated reference.
**Evidence**: the skill catalog lists them; a project skill of the same name wins;
each skill body links only to existing manifest ids.
**Done when**: the gate checks skill links and a real session loads one on demand.

## T028 - `AGENTS.md` pointer and human doc links

**Files**: `AGENTS.md`, `docs/plugin-development.md`, `docs/cordisplugins/README.md`
**Do**: one pointer line in `AGENTS.md` (FR-011); link the two human docs to the
pack. Nothing else changes in them.
**Evidence**: diff limited to those lines.
**Done when**: people and agents working on ACRYL itself reach the pack.

## T029 - Ship the pack in installed builds

**Files**: `apps/acryl-cli/package.json`, `apps/acryl-web`, `apps/acryl-desktop`
packaging config, per the T008 decision
**Do**: make the pack present on disk in an installed CLI, an installed Web
runtime and a packaged Desktop app.
**Evidence**: from each installed build the agent's read tool opens `docs.json` and
an example at the resolved path.
**Done when**: FR-002 and FR-003 hold on all three, or the surface that cannot is
documented with the reason and the router is disabled there by declaration.

## T030 - Enable web and desktop

**Files**: `coding-capabilities.ts`
**Do**: turn on `web` and `desktop` declarations after T013 and T029 pass for each.
**Evidence**: assembled-prompt captures per surface from installed builds.
**Done when**: the router is present on all three surfaces.

---

## Slice 6 - Measure

## T031 - Eval harness

**Files**: per T007 (inside spec 013's home or `plugins/acryl-extension-context/evals/`)
**Do**: port the tutorial's `agent-trajectory-tests` conventions: WS client, goals
from the verifier report, run folders `result-of-run-<DD-MM-YY-HH-MMAM>-<runId>`,
usage and cache metrics, docs and examples read counts, previous-run comparison,
workspace reset, variants `full`, `without_docs`, `without_examples`, and the
answer-key exclusion check (FR-014). Real model keys come from local secure
storage, never from the repository.
**Evidence**: a smoke run on one task in each variant; the harness fails a run that
reads an excluded path.
**Done when**: runs are comparable across variants and time.

## T032 - Tasks with headroom

**Files**: `evals/tasks/**`
**Do**: author eval tasks across matrix types and surfaces, each with a verifier
goal, `excludePaths` for its solution examples and a stated headroom rationale.
Reject a task whose docs-less baseline passes on every attempt.
**Evidence**: baseline pass rates per task without docs.
**Done when**: the task set has measurable headroom and every solution example is
tagged.

## T033 - Baselines and conclusion

**Files**: `evals/`, `research.md`, run folders
**Do**: run `full`, `without_docs`, `without_examples` with at least one cheap and
one strong model, multiple repeats per task, record pass rate, reads, tokens and
cache hit. Write the conclusion: did docs help, by how much, at what cost, and
where the router failed.
**Evidence**: committed run folders and a written comparison that includes the
result if there is no measurable lift.
**Done when**: the spec's eval acceptance holds.

## T034 - Tune from evidence

**Files**: `prompt-router.ts`, docs, skills
**Do**: adjust router text, doc `when` lines and finding-to-doc routing only where
T033 shows a specific failure, re-run, keep or revert on the numbers.
**Evidence**: before and after runs for each change.
**Done when**: each retained change has a measured reason; nothing tuned by taste.

---

## Slice 7 - Closeout

## T035 - Ledger and cross-references

**Files**: `docs/DEVELOPMENT-LOG.md`, `specs/030,033,034/spec.md`, this directory
**Do**: log every landed task with its full commit hash in a documentation commit;
add cross-references to 030, 033 and 034; set `spec.md` status; record any
follow-ups as separate specs, not silent scope.
**Evidence**: the log entries and links.
**Done when**: `spec.md` status matches reality and the tasks list has no unlanded
item without a recorded reason.
