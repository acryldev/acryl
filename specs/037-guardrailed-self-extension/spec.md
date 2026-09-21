# Guardrailed self-extension: routed docs, verified examples, authoring skills

**Tracking:** to be filed (`acryldev/acryl` issue) when this moves to `ready-for-agent`

**Feature Directory**: `specs/037-guardrailed-self-extension`
**Created**: 2026-09-20
**Status**: P0 and the CLI, `/reload`, verify, marketplace dry-run and shipping work are implemented (2026-09-20); waiting on the owner's real Web/Desktop test (T014). Deferred by priority, see `tasks.md` Status: full mount-based verifier, corpus sync, eval harness.
**Authority**: `.specify/memory/constitution.md` (principles I, V; Cordis
Authoring Laws), `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`,
`specs/033-acryl-blends-runtime-contract/spec.md`,
`specs/034-plugins-on-every-surface/spec.md`,
`specs/032-universal-hot-reload`, `specs/021-acryl-agent-plugin-ecosystem`,
`deepseek-harness/docs/subsystems/{system-prompt,skills}.md`,
`deepseek-harness/packages/context/agent-instructions/README.md`
**Input**: user direction 2026-09-20 after a long experiment in
`_experiments/cordis-interactive-tutorial` (commits `5f8d205`, `47f9397`,
`ddbc71e`): "everything we've achieved ... on how to build guardrailed way
using best pi.dev engineering practice and ideas on how they organized
self-extension ... routing, indexed references, plugins examples of all
possible types in source code, docs of plugins of all possible types for all
possible surfaces (cli, web, desktop) ... same mechanism as in pi.dev." Follow-up
direction, same day: "in ACRYL there is no more training or teaching mode ... we
must make the main agent runtime of ACRYL able to write its own working
plugins/extensions, without publishing to a marketplace, right in place with
immediate live reload, or also with publishing to a marketplace, both ways."
The tutorial's chapters, chips and sandbox are **not** carried over; only the
mechanism (router, manifest, verified examples, verifier, eval) is. Prior
art studied: `earendil-works/pi`, `packages/coding-agent` (`docs/`,
`examples/`, `src/core/system-prompt.ts`), and the local write-up
`_experiments/pi_dev_research_on_implementation_and_ideas_to_take/`.

## Problem

Constitution principle V says generated capabilities are versioned packages
(manifest, logic, UI projection, permissions, tests, provenance) that tests
gate, not "edit production source and hope". Nothing today tells an ACRYL agent
how to produce one, and nothing checks that what it produced is correct.

What exists, measured on 2026-09-20:

- **The knowledge exists but is not routed to the agent.** The handbook
  (`docs/cordis/cordis_system_guide_for_coding_agents.md`, 105 KB), the
  source-validated cheatsheet, `docs/cordisplugins/`, the harness `cookbook/`
  (`adding-a-tool`, `adding-an-llm-adapter`, `adding-a-settings-card`,
  `extension-cookbook`, ...), `docs/subsystems/*`, and the generated
  `capability-seams.md` / `config-catalog.md` are all real and good. No
  system-prompt section, skill, or index tells a running ACRYL agent they exist
  or which one to read for a task.
- **There are almost no examples.** `examples/` holds one inert function plugin
  (`acryl-blend-demo`). There is no runnable example of a tool, a service
  provider, a client slot, a prompt contribution, an LLM adapter, a Desktop-main
  plugin, or a generated capability package. Pi ships 78 extension examples plus
  SDK and plugin examples, each a working reference the agent copies from.
- **Docs do not ship.** `acryl-cli/package.json` publishes `lib/**` and
  `README.md` only. An installed CLI user has none of the docs above on disk,
  so even a perfect router would point at nothing. Pi resolves README, docs and
  examples paths at runtime (`getReadmePath()`, `getDocsPath()`,
  `getExamplesPath()`) because it bundles them with the package.
- **Nothing verifies a generated plugin.** `plugin-doctor.ts` reports the
  health of a profile's plugin layer; it does not take a candidate package and
  answer "does this mount, hold its declared dependencies, dispose cleanly and
  survive a re-mount on each surface it claims".
- **Per-surface guidance is absent.** Spec 034 makes plugin capability a
  declared-surface runtime concern (`AcrylSurface = 'tui' | 'web' | 'desktop'`)
  but no document says what an author may build for each surface or which slot
  or transport carries it.

### What the tutorial experiment established

`_experiments/cordis-interactive-tutorial` rebuilt Pi's mechanism at small scale
against a real Cordis Context and measured it with a real model (DeepSeek
`deepseek-flash`, 9-chapter Volume 2 chain, clean workspace each run). These are
inputs to this spec, with the caveats stated:

1. **Routing works at first contact.** With a docs router in the system prompt
   the agent read `docs/this-sandbox.md` first, then the topic docs and nearest
   examples before writing its first plugin (chapter 17 run `543baa66`: 6 docs,
   7 examples). Later chapters read nothing: the router steers first contact
   with a topic, and later turns rely on session memory.
2. **Verified examples catch documentation errors.** Mounting every example in a
   real Context found that `export default` is **not** an accepted plugin form
   (`ctx.plugin()` rejects it) while the docs I had just written said it was.
   The contract is named exports `name`, `inject`, `Config`, `apply`; the class
   form exports the class as `apply`. Unverified prose would have shipped the
   error. This is the strongest argument for making verification part of the
   gate.
3. **An answer key in the examples defeats an eval.** The agent read
   `examples/coding-agent/*`, the finished solution to the task it was being
   asked to build, in three chapters. Examples that solve an eval task must be
   excluded from that task's context.
4. **Cost is real.** Input tokens rose from 1.13M to 2.53M for the same chain
   (uncached 126K to 269K) once docs and examples were readable. One run each,
   so the size of the effect is unproven, but the router and docs are not free
   and need a budget.
5. **The tutorial tasks had no headroom.** Both the old inline-prompt runs and
   the docs runs passed 9/9, so the experiment cannot show that docs improve
   correctness. A meaningful eval needs tasks a docs-less agent sometimes fails.
6. **Distribution pitfalls are real.** A nested standalone project was silently
   absorbed by the outer `pnpm-workspace.yaml`; a host printed premature fiber
   states. Both were found only by actually running the artifact.

## Objective

The production ACRYL agent runtime can author its own working plugins and
extensions and deliver them **two ways**, from one verified package:

- **Local, in place**: write the package on the user's machine, verify it,
  install it into the active profile and activate it live with no marketplace
  involved and no restart of the runtime.
- **Marketplace**: the same package, prepared for and (only with explicit human
  approval) published to the ACRYL marketplace, then installable from it like
  any other plugin.

There is no teaching, training or tutorial mode. The capability is part of the
main agent runtime on every surface and is built from the same mechanism Pi uses
for its own self-extension, on ACRYL's existing seams:

```text
system prompt: small docs router (from a manifest)
  -> agent reads docs and nearest example with its normal tools
  -> writes a capability package
  -> runs the verifier, fixes what it reports          (shared gate)
  -> delivery, agent's choice or user's:
       local:        install into profile + live activation (031, 032, 033 B2)
       marketplace:  pack, lint, human-approved publish, catalog install (030)
```

Specifically: one shippable **Extension Context Pack** (indexed docs, verified
examples of every plugin type for every surface, bundled authoring skills); a
small runtime plugin that routes the agent to it; a **verifier** that
mechanically checks a candidate package; guarded **delivery** commands for both
paths; and an **eval harness** that measures whether the whole thing helps and
what it costs.

## Pi to ACRYL mapping (design contract)

Each Pi idea is taken only where an ACRYL seam already exists. Where none does,
that is stated as a gap, not papered over.

| Pi mechanism | Evidence in Pi | ACRYL seam (existing) | This spec adds |
| --- | --- | --- | --- |
| Small router in the system prompt: index of topics to docs and examples, plus "read fully, follow `.md` cross-references before implementing" | `core/system-prompt.ts` `promptSections.docs` | `PromptSection` via `ctx.systemPrompt` (`dsh-system-prompt`), ordered, static or context-resolved text | the router text and its manifest generator (FR-004) |
| Paths resolved at runtime so it works installed or bundled | `getReadmePath/getDocsPath/getExamplesPath` | none: docs are not shipped | pack package + runtime path resolution (FR-002, FR-003) |
| Navigation manifest | `docs/docs.json` | none | `docs.json` manifest, index generated from it (FR-001) |
| Working examples as the API reference | `examples/extensions/` (78), `example-plugins/README.md`, SDK and plugin examples | one inert demo | verified examples per type x surface (FR-006, FR-007) |
| Project instruction files loaded into context | `resource-loader.ts` (`AGENTS.md`, `CLAUDE.md`) | `dsh-agent-instructions`, default in `dsh-base`, budgeted, durable | a pointer line in this repo's `AGENTS.md`; nothing else (FR-011) |
| Skills: name and description in context, body loaded on demand | `skills.ts` `formatSkillsForPrompt` | `dsh-skill` family: registry, filesystem provider, `skill` tool; bundled rank 600 | bundled authoring skills (FR-009) |
| Agent uses its normal tools to read its own docs | `read`, `grep`, `find`, `ls`, `bash` | DSH file tools; the agent already works in a real filesystem | nothing new; a verifier tool for the check step (FR-008) |
| Hot reload after writing the extension | `/reload`, jiti | plugin lifecycle controller, `specs/016`, `specs/032`, `ctx.dynamicCordisRunner` | the verifier runs before this step (FR-008) |
| Docs are optional: an eval variant with docs removed | `without_docs` in the eval tooling | none | eval variants `full`, `without_docs`, `without_examples` (FR-013) |
| Sections addressable and diffable so stable parts cache | `SystemMessage.sections`, `diffSystemPromptSections` | `PromptSection` order; `PromptContext` for dynamic content | keep the router static and small; dynamic facts go through `PromptContext` (NFR-002) |
| Trust boundary on project-local extension resources | `project-trust` | constitution V, `dsh-authorization`, approval | no new trust path (Non-goals) |

## Functional requirements

- **FR-001 Manifest and index.** The pack has one machine-readable manifest
  (`docs.json`, schema in `data-model.md`). Every doc and example is listed in it
  with the surfaces it applies to and a one-line "read this when". The human
  index (`docs/README.md`) and the system-prompt router are both generated from
  the manifest. A doc not in the manifest does not exist to the agent, and the
  gate fails on an unlisted file.
- **FR-002 Shippable pack.** Docs, examples and skills live in one owned package
  (`plugins/acryl-extension-context`, private) that is a `dependencies` entry of
  every surface package and is present, as real files, in the prepared CLI and
  Web release archives and in a packaged Desktop app (under `asarUnpack`ed
  `node_modules`). It is never bundled as JS. Example packages avoid `test` and
  `tests` directory names because the release pruner deletes them.
- **FR-003 Runtime path resolution.** The runtime plugin resolves the pack root
  at runtime and exposes it as a service (`extensionContext`); no path is
  hard-coded in a prompt. The agent can read the resolved files with its normal
  read tools on every surface, including the packaged Desktop app.
- **FR-004 Router section.** On every surface the assembled system prompt
  contains one static router section: the docs index location, the examples
  index location, the topic-to-doc map generated from the manifest, and the
  policy "read the doc and nearest example completely, follow cross-references,
  never guess from memory, verify before claiming done". The section is bounded
  by a token budget (NFR-002) and is asserted by a test, not by inspection.
- **FR-005 Plugin-type coverage.** Docs and examples cover every plugin type in
  the coverage matrix below. "Every type" is defined by that matrix, which T001
  finalizes against source; adding a type later is a manifest change plus a doc
  plus a verified example.
- **FR-006 Verified examples.** Every example is a real package that mounts
  through the real Loader. Each declares its expected outcome (fiber states,
  services provided, events, log lines, errors) in a scenario file, and the gate
  runs every scenario. An example that does not do what its header says fails
  the gate.
- **FR-007 Surface declaration.** Every doc, example and scenario declares the
  surfaces (`tui`, `web`, `desktop`) it applies to using the existing
  `AcrylSurface` vocabulary. For a slot that a surface lacks, the doc says so
  and the example is skipped there by declaration, consistent with `specs/034`
  FR-007.
- **FR-008 Verifier.** `acryl plugin verify <path|package>` (and an agent tool
  wrapper, `acryl_verify_plugin`) boots a minimal headless composition for each
  surface the candidate declares and reports, as JSON and text: rows mounted and
  their fiber states, unmet `inject` by service name, services and events
  provided, leaked effects after dispose, behavior across repeated mount and
  reload, manifest and permission lint, and declared-versus-mounted surfaces.
  It mounts the candidate into the real surface host (so `inject` resolves
  against real services) after normalizing it through the host Loader's own
  `unwrapExports`. Lint includes: `exports` must include `./package.json` (else
  live activation fails), a default export mixed with named `name`/`inject`/`Config`
  is an error (the named metadata is silently dropped), the exact `acryl-package`
  keyword and a valid `acryl` manifest for publishable packages. It never mutates
  the user's profile. Exit status is non-zero on any error finding.
- **FR-009 Bundled skills.** A small set of authoring skills (workflow
  triggers, not duplicated reference) is registered through the existing skill
  provider seam at the bundled rank, so a project or user skill of the same name
  overrides it. Skill bodies link to manifest docs; they never restate them.
- **FR-010 Generated-package contract.** The docs and the verifier encode the
  constitution V package shape (manifest, logic, UI projection, permissions,
  tests, provenance) and the HOT / WARM / COLD mutation classification, so an
  agent-produced package is reviewable and gate-able the same way regardless of
  type.
- **FR-011 Instruction file pointer.** This repository's `AGENTS.md` gains one
  line pointing to the pack for people and agents working on ACRYL itself.
  Agents running in user projects get the router from the runtime plugin, never
  from this file.
- **FR-012 Corpus sync.** Handbook, cheatsheet and harness cookbook/subsystem
  docs are synced into the pack by a repeatable script that splits by topic,
  tags surface applicability, records provenance (source path, source commit or
  submodule pin) and refuses to run on a dirty target. Originals stay the source
  of truth; the pack copies are generated and marked "do not edit here".
- **FR-013 Eval harness.** A repeatable harness runs authoring tasks against the
  real ACRYL agent with a real model and records goal outcome (from the
  verifier, not from the agent's prose), docs and examples read, tokens in and
  out, cache hit rate and wall time, in a timestamped run folder with a run id,
  comparable to earlier runs. Variants: `full`, `without_docs` (router section
  disabled), `without_examples`.
- **FR-014 Answer-key hygiene.** An eval task declares which examples are its
  solution; those are excluded from the agent's readable context for that task.
  The harness fails a run that read an excluded path.
- **FR-015 Parity and rot checks in the gate.** The headless gate asserts:
  manifest lists every pack file and every listed path exists; every example has
  a scenario and every scenario passes; every doc that names an example path
  names a real one; the router section is within budget; the router is present
  on all three surfaces' assembled prompt.

## Delivery paths (both first-class)

Both paths start from the same package and the same verifier result. The
verifier is the shared gate; a package that fails it is not delivered by either
path. Neither path introduces a second loader, install engine or trust model.

| Step | Local, in place | Marketplace |
| --- | --- | --- |
| Author | agent writes a package in a local plugin workspace | same package |
| Gate | `acryl plugin verify` green for the declared surfaces | same, plus publish lint |
| Deliver | `acryl plugin install --local <dir>`: `dsh plugin add file:<dir>` (pnpm add plus bundle reconcile, about 0.45 s), then an explicit `livePluginActivation.activate(pkg)` (about 4 ms, no restart); compensating `dsh plugin remove` on failure (specs 031, 032, 033 B2; measured on tui) | `acryl plugin publish`: pack, lint (`acryl-package` keyword, manifest, license), then npm publish **only after explicit human approval**; catalog picks it up from npm (spec 030) |
| Live effect | host-side rows mount and unmount live; a client-side change reloads the renderer (spec 032 limits) | after catalog refresh and Market install, same live activation as any market plugin |
| Iterate | edit, re-verify, `ACRYL_PLUGIN_WATCH` or explicit re-install; old fiber disposed first | publish a new version |
| Undo | disable or remove through the plugin lifecycle controller; failed installs are compensated by removal (Desktop also has its recovery log) | unpublish is out of scope; local disable applies |
| Authority | the user's existing approval and authorization policy for installing a plugin | publishing is public and irreversible: never automatic, always a human decision |

- **FR-016 Local live delivery.** The agent can take a verified package from its
  local workspace to an active plugin in the running profile without a
  marketplace, without restarting the ACRYL runtime, on CLI, Web and Desktop.
  Failure at any step leaves the profile as it was and the agent receives the real
  error. Desktop uses its existing install recovery log; CLI and Web have none, so
  the install command compensates itself (`dsh plugin remove`) - measured in
  `research.md` Q7, where a throwing plugin stayed in `dsh.profile.bundles` until
  removed.
- **FR-017 Marketplace delivery.** The same package can be prepared for and
  published to the marketplace. Preparation (pack, lint, dry run) is automatic
  and safe. The publish step requires explicit human approval each time, is never
  performed from a prompt alone, and never uses credentials the agent can read.
  No agent-callable publish tool exists at all; the publish command runs only in an
  interactive terminal with a typed confirmation of package name and version.
  After publication the agent can confirm catalog visibility and install from
  the market the same way a user does.
- **FR-018 One package, both paths.** Nothing in a package depends on which path
  delivered it. A package installed locally can later be published unchanged,
  and a market-installed package can be copied to a local workspace for editing.
- **FR-019 Delivery guidance.** `docs/delivery/local-live.md` and
  `docs/delivery/marketplace.md` are manifest entries with worked, verified
  examples (an install-and-activate scenario and a pack-and-lint scenario), and
  the router policy names both paths.

## Plugin-type coverage matrix (finalized 2026-09-20 from the census, `research.md` Q1 and Q6)

Source-grounded starting list. `n/a` means the surface has no such seam and the
doc says so. Rows marked (?) have an open question in `research.md`.

| # | Type | tui | web | desktop | Doc | Example |
| - | --- | --- | --- | --- | --- | --- |
| 1 | Lifecycle plugin (function form) | yes | yes | yes | yes | yes |
| 2 | Service provider (`Service` subclass) | yes | yes | yes | yes | yes |
| 3 | Service consumer, hard `inject` and optional `ctx.get` | yes | yes | yes | yes | yes |
| 4 | Tool plugin (`defineTool` on `ctx.tools`) | yes | yes | yes | yes | yes |
| 5 | Event hook (listener, waterfall observer calling `next()`) | yes | yes | yes | yes | yes |
| 6 | Config-bearing plugin (Schemastery, fail before activation) | yes | yes | yes | yes | yes |
| 7 | Three-role capability (definition, provider, consumer, provider swap) | yes | yes | yes | yes | yes |
| 8 | Prompt contribution (`PromptSection`, `PromptContext`) | yes | yes | yes | yes | yes |
| 9 | Skill provider / bundled skill | yes | yes | yes | yes | yes |
| 10 | LLM adapter | yes | yes | yes | yes | yes |
| 11 | Agent preset / subagent | yes | yes | yes | yes | yes |
| 12 | Host route / RPC | n/a | yes | yes | yes | yes |
| 13 | Client slot plugin (`ctx.slots.inject`, settings card) | n/a | yes | yes | yes | yes |
| 14 | Desktop-main plugin (`desktopProfiles`, `desktopPnpm`) | n/a | n/a | yes | yes | yes |
| 15 | TUI presentation contribution (`ctx.get('tuiCommands')?.register`) | yes | n/a | n/a | yes | yes |
| 16 | Packaging: bundle, `cordis.patch.yml`, profile install | yes | yes | yes | yes | yes |
| 17 | Generated capability package (Blend module) with permissions, tests, provenance | yes | yes | yes | yes | yes |
| 18 | Failure and diagnosis (FAILED, PENDING, leak after reload) | yes | yes | yes | yes | yes |

## Non-functional requirements

- **NFR-001 Headless.** Every check in FR-015 and the verifier run without
  launching a GUI. Real GUI confirmation is a separate, explicit task (repo
  rule), not part of the gate.
- **NFR-002 Prompt budget.** The router section is at most 1,500 estimated
  tokens and static for the process lifetime, so it forms part of the cacheable
  prompt prefix. Dynamic facts use `PromptContext`. The budget is a test.
- **NFR-003 No fork.** No change inside `deepseek-harness/`. Anything the harness
  lacks becomes a CORE EXTENSION PROPOSAL (constitution III), not a patch.
- **NFR-004 Determinism.** Scenario outcomes are deterministic: no network, no
  real model, fixed ports or none. Model-backed work lives only in the eval
  harness, which is not part of the required gate.
- **NFR-005 Provenance.** Every synced file records its source and pin; the
  script is idempotent; regeneration produces a clean diff or none.

## Acceptance

Evidence, not unit tests alone:

- **Router, per surface**: cold start of `acryl` (CLI/TUI), `acryl-web` and
  `acryl-desktop` with a throwaway `ACRYL_HOME`; the assembled system prompt on
  each contains the router with a pack path that exists on disk, and the section
  is under budget.
- **Ship**: from an installed (not workspace) CLI and a packaged Desktop build,
  the agent's read tool opens `docs.json` and one example at the resolved path.
- **Real agent, real task**: a session asked to "add a tool plugin that ..." (a
  task with a verifiable goal) reads the manifest-routed doc and nearest
  example, writes a package, runs `acryl_verify_plugin`, fixes a reported
  finding, and ends with the verifier green. Trace shows the reads.
- **Verifier catches a real defect**: a package with a missing `inject`
  provider, one that leaks a timer after dispose, and one using an unsupported
  export form each produce the specific error finding.
- **Local live path, real agent**: on a throwaway `ACRYL_HOME`, a session asked
  to add a capability writes a package, verifies it, installs it locally and the
  new plugin is ACTIVE in the running profile with no marketplace access and no
  runtime restart (evidence: fiber states before and after, profile bundles
  diff). A deliberately broken package is rejected by the verifier and a
  deliberately failing install rolls the profile back.
- **Marketplace path**: pack, lint and dry-run publish succeed headlessly for a
  verified package and fail with specific findings for a package missing the
  `acryl-package` keyword or a license. A real publish is attempted only in a
  human-attended run and is recorded as evidence, never done by the gate.
- **Coverage**: for each row of the matrix, a doc, a verified example and a
  passing scenario on every surface the row claims.
- **Eval**: a recorded run of `full` versus `without_docs` on tasks with
  headroom, with goal pass rate, context reads, tokens and cache hit for each,
  and a written conclusion that says whether docs helped and what they cost,
  including the case where the answer is "no measurable lift".
- **Gate**: `corepack pnpm run check` fails when a doc is unlisted, an example
  has no scenario, a scenario fails, or the router exceeds budget.

## Priority and language scope

Priority is the shortest path to a working self-extension loop: **Web and Desktop
first, then CLI**. The minimum is the router, enough docs and examples to author a
plugin, and an agent-callable install tool that verifies, installs and live-activates.
Everything else (full verifier, corpus sync, per-type coverage, skills, eval,
marketplace publish) follows only if needed. The pack is **English only**; additional
languages can be added later and are not a design constraint. See the priority order
in `tasks.md`.

## Non-goals

- Self-**evolution** (proposing changes to ACRYL itself, promotion policy);
  this spec covers self-**extension** by capability package (constitution V).
- The approval, permission-diff and Evolution Ledger product logic of
  `specs/033` and Blends; the verifier is the "tests gate" input to them, not a
  replacement.
- The marketplace itself: the catalog service, registry, commerce and federated
  catalogs (`specs/021`, `specs/030`), and npm distribution of the market client
  (`specs/030` C). This spec only produces a publishable package and a guarded
  publish step against what 030 already serves.
- A new plugin runtime, a second loader, or any privileged agent path.
- Changing DeepSeek Harness, its prompt assembly, or the skill registry.
- Engine #2 (pi) integration from `specs/028`; this spec assumes the `dsh`
  engine and stays engine-neutral where it can.
- Translating the pack: English only for now; other languages may be added later.

## Open questions

All eight were answered on 2026-09-20 with measured evidence in `research.md`
(Q1 census and export shapes, Q2 seams, Q3 packaging, Q4 verifier prototype, Q5 eval
home, Q6 TUI seam, Q7 local live path, Q8 publish design). Decisions D1-D11 there
are binding for the plan and tasks. Remaining unknowns are implementation details
(exact registration calls at T011, web and desktop live-install parity at T018).

## Follow-ups

- `specs/038-ui-component-library`: a cross-surface UI/TUI component library and terminal theme service, so agent-authored UI matches the app
  on Web, Desktop and the CLI. This spec's pack already teaches what exists today (`docs/extending/ui-*.md`, `docs/maps/ui-components.md`).
