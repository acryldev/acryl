# Research: Interchangeable Harness Engine (M9)

**Feature**: `specs/028-harness-engine-swap`
**Date**: 2026-09-07
**Inputs**: `spec.md`, resolved Wayfinder ticket 04, `docs/ACRYL-ROADMAP.md` (M2/M9),
`docs/cordis/cordis-usage-cheatsheet.md`, source of `acryl-harness-runtime`,
`acryl-control`, `acryl-cli`.

---

## Decision 1: M2 status assessment (the blocking dependency)

### Question

`spec.md` FR-003 and Assumptions make M9 hard-depend on M2 ("normalized shared
runtime capability API in `acryl-control`, surfaces call it without copied agent
logic"). Is M2 done, partially done, or not started?

### Verified facts

Inspected 2026-09-07 against working tree at `main` (commit `93c1be3`).

- **An engine-neutral *session client contract* shape exists but is not the
  wired path.** `acryl-control/src/contracts/session.ts` defines
  `AcrylSessionClient` (`snapshot` / `subscribe` / `submitPrompt` / `cancel`)
  and `AcrylSessionSnapshot` with a boundary validator
  (`parseAcrylSessionSnapshot`). This is transport-neutral and the right shape
  for M2. **But** the TUI does not consume it: `acryl-cli/src/cli/run.ts`
  imports `startDirectHost` from `../host/direct.ts`, which imports
  `bootAcrylHarnessProfile` from `acryl-harness-runtime` directly, and
  `acryl-cli/src/tui-app/session.ts` builds on `createAcrylSessionBridge`
  (also `acryl-harness-runtime`). The surface is coupled to the engine
  bootstrap, which FR-002/FR-003 forbid.
- **A provider-neutral *agent-control service* exists (M4 seam, partial).**
  `acryl-control/src/agent/agent-control.ts` defines `AcrAgentControl`
  (`registerProvider` / `attach` / `dispatch` / `snapshot`) with capability and
  fidelity typing and adapters under `agent/providers/` (`dsh-native`, `codex`,
  `claude`, `acp`, plus `factory`, `capabilities`). This governs *agents inside
  one runtime*, not *swapping the runtime/engine itself*. `spec.md` note in
  ticket 04 already separates these.
- **No engine-neutral runtime-boot seam.** `acryl-harness-runtime/src/index.ts`
  `bootAcrylHarnessProfile` is DSH-only: it imports `@deepseek-ai/dsh-app-boot`
  (`boot`, `loadProfile`, `DEFAULT_PROFILE_BUNDLES`, `resolveProfileDir`),
  writes DSH `cordis.yml`, composes DSH bundle patches, and enforces the DSH
  HMR `--expose-internals` rule. There is no adapter interface, no
  `AcrylEngine` type, and no `ctx.runtime` concept anywhere in the tree
  (grep: 0 hits for `ctx.runtime`, `AcrylEngine`, `engine adapter`).
- **`startDirectHost` probes DSH service keys directly.**
  `acryl-cli/src/host/direct.ts` sets `runtimeState` from
  `ctx.get('sessions') !== undefined && ctx.get('agents') !== undefined` -
  DSH-specific keys, not an engine-neutral readiness contract.
- **The M2-adjacent rework ledger (`specs/026-acryl-rework`) is largely open.**
  Its own 2026-09-01 correction states the DSH-parallel duplication in
  `acryl-control` / `acryl-harness-runtime` is *architectural and load-bearing*,
  not dead code; task counts show 1 done / 4 open. `contracts/operations.ts`
  already carries `RestartClass = 'HOT' | 'WARM' | 'COLD'` and
  `HostKind = 'tui' | 'gui' | 'web'`, so the restart-class vocabulary M9 FR-010
  needs is present.
- **`contracts/operations.ts`** has a `ControlOperation` state machine
  (`CREATED`..`SUCCEEDED`/`FAILED`/`RECOVERABLE`/`CANCELLED`) and `AcrylExitClass`
  - reusable for the engine-select / engine-swap operations.

### Decision

**M9 is BLOCKED on a minimal M2 seam.** M2 is *partially* present as contract
shapes (`AcrylSessionClient`, `RestartClass`, `ControlOperation`) but the one
thing M9 structurally requires - **the TUI driving the engine only through an
engine-neutral capability, never through `bootAcrylHarnessProfile` /
`startDirectHost` / `createAcrylSessionBridge` directly** - does not exist yet.

The minimal unblocking M2 work (call it **M2-slice-α**) is:

1. Define an engine-neutral runtime seam in `acryl-harness-runtime`: an
   `AcrylEngine` interface (start → returns a live handle exposing an
   engine-neutral session client + `ctx` + ordered `dispose()`), an
   `AcrylEngineAdapter` registration, and an engine registry keyed by name.
2. Provide the `dsh` adapter as a thin wrapper over the existing
   `bootAcrylHarnessProfile` + `createAcrylSessionBridge` (behavior-preserving).
3. Re-point `acryl-cli` (`cli/run.ts`, `host/direct.ts`, `tui-app/session.ts`)
   to resolve the engine by name through the seam and consume the
   engine-neutral session client, deleting the direct `acryl-harness-runtime`
   bootstrap imports from the surface.

That slice IS the M9 foundational phase (see `plan.md` Phase A). It is scoped to
exactly what US1 needs, not the full `026` rework.

### Alternatives considered

- **Wait for full M2 / `026` completion.** Rejected: `026` is a broad
  DSH-parallel-substrate refactor with acknowledged regression risk and no
  committed schedule; M9's need is narrow (one engine seam + TUI re-point).
  Blocking M9 on all of `026` violates vertical-slice discipline.
- **Build M9's pi engine behind `AcrAgentControl` as another `AgentProvider`.**
  Rejected: `AcrAgentControl` governs agents *within* a runtime that already
  owns `ctx.sessions` / `ctx.agents`. pi brings its *own* loop, session store,
  and root; modelling it as an in-runtime provider would force pi to run under
  DSH's `ctx`, contradicting ticket-04 answer 1 ("own Cordis root",
  `ctx.runtime`).
- **Skip M2, let the TUI branch on engine name.** Rejected: constitution II
  ("never encode an agent-name switch where a capability seam would work") and
  FR-002/FR-003.

### Consequences

- `plan.md` splits M9 into Phase A (M2-slice-α: engine seam + `dsh` adapter +
  TUI re-point, no behavior change) and Phase B (`pi` adapter + selection +
  HOT-swap).
- Phase A must ship with a regression gate proving the default `dsh` path is
  byte-for-byte unchanged (SC-004).
- `spec.md` Assumptions line "M2 lands before implementation" is refined:
  M2-slice-α is delivered *as* M9 Phase A, and the roadmap M2 entry should note
  M9 carries this slice. Flag for `/speckit-tasks` and a roadmap footnote.

---

## Decision 2: How `pi` is consumed as an in-process engine

> **Amendment, 2026-09-11.** This decision's "own Cordis root" text below is
> **superseded** by `tasks.md`'s "Architecture correction, 2026-09-09" banner
> (T004 onward uses the persistent `acryl-harness-runtime` engine host;
> `dsh-cordis` and `pi-cordis` are provider entries beneath it - no Cordis
> root per provider). That banner was never back-ported into this decision's
> own text until now. A working, tested proof of the corrected architecture
> already exists: the sibling `acryldev/pi-cordis` repo (git@github.com:
> acryldev/pi-cordis.git, commit `fbe2596`, dated 2026-09-09 - same day as
> the correction), reviewed 2026-09-11. It wraps `@earendil-works/pi-coding-
> agent@0.85.1`'s published SDK as `PiCordisEngine extends Service`,
> `name: 'pi-cordis'`, `inject: ['loader']`, exposing `ctx.piEngine` -
> **one Cordis tree, no second root, no Chord** (confirmed by reading
> `src/index.mjs`: only `@deepseek-ai/cordis` + the Pi SDK + `zod` are
> imported). Its own test suite already proves the Cordis-level half of
> FR-010/FR-011 for real: `test/engine.test.mjs` mounts/removes a real
> `ctx.loader.create({ id: 'pi-engine', name: '...' })` entry twice in a loop
> and asserts a dependent consumer (`inject: ['piEngine']`) starts exactly
> once per mount, stops exactly once per removal, and sees `ctx.get
> ('piEngine') === undefined` while absent - `PENDING`-equivalent behavior
> with no duplicate registration, via a real Loader activation, not a mock.
>
> **What it does NOT cover** (verified by reading `src/index.mjs` and
> `docs/PLAN.md` in full, not assumed): the FR-002 engine-neutral contract
> itself (`ctx.piEngine` exposes Pi's own `open`/`prompt`/`abort`/
> `subscribe` shape, not yet mapped onto whatever `acryl-harness-runtime`'s
> engine-neutral seam turns out to be per Decision 1); FR-006/FR-007
> cross-engine durable-record projection (`docs/PLAN.md` says so explicitly:
> "This package does not claim cross-engine resume yet" - Pi session files
> stay Pi-native evidence only); FR-012 sandbox/approval parity with DSH (no
> policy/permission pipeline in the package at all); FR-015's documented
> capability/fidelity contract (only an informal PLAN.md, not the ledger's
> per-adapter contract doc). `ctx.runtime.engine`/FR-001 and the persistent
> engine host itself are explicitly out of this package's scope by design -
> "A future ACRYL engine adapter consumes the engine-neutral contract rather
> than this concrete service" (`docs/PLAN.md`).
>
> **Consequence for sequencing**: the plan's stated order (extract a
> `dsh-cordis` provider first under the new engine host, land `pi-cordis`
> second) can likely invert for the *Cordis-mounting* half of the work,
> since a tested pi provider already exists and an equivalent extracted
> `dsh-cordis` provider does not (DSH is still directly wired via
> `startDirectHost()` per Decision 1's verified facts). The FR-002 adapter
> layer, FR-006/007 durable-record projection, and FR-012 sandbox/approval
> work remain required regardless of which provider mounts first. Formal
> adoption mechanism (git submodule matching `deepseek-harness/`'s
> convention, vs. consuming `pi-cordis` as a published npm dependency once
> it ships one, vs. a pnpm workspace path) is an open decision, not
> resolved by this amendment.

### Verified facts

- Ticket 04 answer 1: upstream `pi` / prime-agent, consumed as a **library**,
  **in-process**, with its **own Cordis root**; surfaced as `ctx.runtime` =
  `'dsh' | 'pi'`.
- `pi` lives at github.com/earendil-works/pi (monorepo, `packages/{tui,ai,agent,
  chord,...}`). The prior repo session measured ACRYL's sibling `acryl-padsh`
  fork against `pi` v0.85.0 (`packages/{tui,ai,agent}`). `@earendil-works/pi-tui`
  0.84.2 is already a pinned ACRYL dependency (rendering only).
- `pi` ships `@earendil-works/chord` - an unfinished application-composition
  runtime (plugins/facets/services/replicated-state/delta/remote boundaries,
  Go-like context). README: "symmetric RPC peers ... planned". Not Cordis-aware.

### Decision

The `pi` engine adapter runs the pi agent loop **inside its own Cordis root**
booted by `acryl-harness-runtime`, exposing the same `AcrylEngine` interface the
`dsh` adapter does. `ctx.runtime` is a tiny engine-scoped service the adapter
registers on its root (`'dsh'` or `'pi'`), so any plugin can branch on
capability-truth without an agent-name switch.

`pi`'s loop / session / tool-exec / streaming primitives are wrapped by the
adapter and projected into the **ACRYL-owned canonical session record** (the
same record the `dsh` adapter writes, via the session-bridge's durable-message
port). pi's native history store is a projection source, never the source of
truth (FR-006).

**`@earendil-works/chord` is NOT loaded.** It is a design reference only
(FR-013). Where pi code paths assume Chord services, the adapter supplies
Cordis-backed shims or vendors the minimal pi primitives that do not need
Chord. The exact pin (commit/version) and the concrete pi entry points
(loop, session, tools, streaming) are an **open task for Phase B research** -
recorded here as `NEEDS PIN` and resolved before Phase B `/speckit-tasks`.

### Alternatives considered

- **Adopt Chord as a second runtime for the pi engine.** Rejected by
  constitution invariant "one Cordis lifecycle system" and FR-013.
- **Drive `pi` as a subprocess / PTY.** Rejected by ticket 04 answer 1
  (in-process library) and because PTY fidelity cannot meet FR-012
  (HMR/sandbox/approvals contracts).
- **Fork pi into ACRYL.** Rejected by FR-014 (consume unmodified through
  published entry points), consistent with the `deepseek-harness/` rule.

### Consequences

- Phase B has a real research spike (`NEEDS PIN` + pi entry-point mapping +
  Chord-shim surface area) that must complete before Phase B tasks.
- pi's authentication is a distinct profile concern (Phase B); reuse the
  `acryl-control` auth seam already used for `--engine`-agnostic login
  (`specs/024-acryl-cli-login`).
- Bundle-size risk: pulling pi's `ai`/`agent` packages into the `acryl` CLI
  publish closure. Phase B must measure and, if needed, gate pi behind an
  optional dependency so `acryl` (TUI, `dsh` default) stays lean
  (`specs/025-acryl-runtime-distribution` size gates apply).

---

## Decision 3: Engine selection and HOT-swap mechanism

### Verified facts

- Ticket 04 answer 5: `--engine <name>` bound to a **Loader row**, mid-project
  change is **HOT** via `/reload`.
- Cheatsheet §1-2: the Loader turns `cordis.yml` / bundle / patch rows into a
  live plugin tree; a row has a stable `id`; config is **replaced** not merged;
  HMR is a plugin, transactional, needs `--expose-internals`; a provider change
  unloads + reactivates consumers by **service availability**, never row order.
- `bootAcrylHarnessProfile` already composes patches from
  `profile.layers` + `createAcrylCodingCapabilityPatches` + `profile.patches`
  and refuses to boot if the composed `hmr` entry is not disabled and
  `--expose-internals` is absent.
- `contracts/operations.ts` `RestartClass` already models `HOT | WARM | COLD`.

### Decision

- The engine is chosen by **one stable Loader row** (proposed id
  `acryl-engine`) whose validated config is `{ engine: 'dsh' | 'pi' }`,
  defaulting to `dsh`. The row mounts the selected engine adapter plugin, which
  registers the `AcrylEngine` provider and the `ctx.runtime` marker.
- `acryl tui --engine <name>` overrides the row's `engine` value **for that
  launch only** by patching the composed entry before `boot()` - it does not
  rewrite the persisted row (FR-004). An unknown name throws before `boot()`
  (FR-005), reusing the `AcrylExitClass = 'usage'` path.
- **HOT-swap** = edit the persisted row's `engine` value, then `/reload`
  (HMR transactional apply). The old engine adapter fiber unloads (ordered
  disposal via its owning `ctx.effect()`), the new one activates, and
  `AcrylEngine` consumers ride the normal PENDING → reactivate path keyed on
  the provider disappearing and reappearing. The swap is classified `HOT` in the
  emitted `ControlOperation`.
- If the new engine fails activation, HMR's transactional apply rolls back to
  the previously healthy composition (FR edge case "engine fails to activate").

### Alternatives considered

- **Per-launch flag only, no persisted row.** Rejected: ticket 04 answer 5
  wants a Loader row; a row also gives `/reload` a stable target.
- **Separate `acryl-engine-dsh` / `acryl-engine-pi` rows, enable/disable.**
  Rejected: two rows invite both-enabled (two engines = FR-009 violation); one
  row with a validated enum makes the invariant structural.
- **WARM (generation restart) for the swap.** Rejected: ticket 04 answer 5 says
  HOT / immediately effective. WARM remains the fallback only if a specific
  engine cannot HOT-dispose (documented per-adapter in its fidelity contract).

### Consequences

- The engine adapter plugin must own **every** engine resource in one effect
  tree so `/reload` disposal is complete and ordered (leak = FR-011 failure).
- `data-model.md` defines the `acryl-engine` row config schema (sync
  StandardSchema per cheatsheet §4 correction 1).
- The `--engine` override needs a composed-entry patch point in
  `bootAcrylHarnessProfile`; Phase A adds it.

---

## Decision 4: Cross-engine session resume

### Verified facts

- Ticket 04 answer 3: a DSH-created session **can resume under pi**; users try
  different engines against the same session; canonical record stays
  ACRYL-owned.
- `acryl-harness-runtime/src/session-bridge.ts` + `durable-message.ts` already
  define a `DurableSessionMessage` / `DurableSessionMessagePort` /
  `DurableSessionMessageReceipt` abstraction - an engine-neutral durable
  message channel shape.
- `spec.md` FR-007 allows a documented limitation where an engine cannot
  faithfully continue.

### Decision

The **canonical session record** is the ACRYL-owned durable message stream
(`DurableSessionMessage` port), written by whichever engine adapter is active.
Resume = the new engine adapter reads prior `DurableSessionMessage`s for the
session id, renders them into its own context as history, and appends new turns
to the same stream. The `sessionId` is ACRYL-owned and stable across engines;
each engine keeps its own private `ProviderSessionRef` (already a typed concept
in `agent-control.ts`) that never becomes the record owner.

Fidelity gaps (e.g. engine-specific tool-call metadata pi cannot reconstruct
from a DSH-authored turn) are surfaced as a one-line documented limitation in
the transcript projection, not dropped silently (FR-007).

### Alternatives considered

- **Translate DSH session state into pi's native store on switch.** Rejected:
  makes the native store authoritative and couples engines pairwise (N^2).
- **Only room/task-level continuity, new session per engine.** Rejected by
  ticket 04 answer 3 ("DSH session can resume under pi").

### Consequences

- Phase A must confirm `DurableSessionMessage` is genuinely engine-neutral (no
  DSH-only fields) and, if not, tighten it - part of M2-slice-α.
- `quickstart.md` scenario 3 exercises DSH-write → pi-resume against one
  `sessionId`.

---

## Decision 5: DSH's real agent-loop extension seam, and the true cost of deep Pi integration

### Question

The user asked, precisely: which parts of `deepseek-harness` actually make it
"the coding agent engine," and can pi be swapped in without losing what DSH
already gives ACRYL - not as an external, parallel engine (this ledger's
current design, `research-pi-spike.md`'s `AcrylEngineAdapter('pi')`), but as
a driver that behaves like DSH's own inside the *same* Cordis tree: writing
Cordis plugins, hot-reloading them, and using DSH's existing tool/capability
ecosystem (fs, shell, lsp, skill, subagent, workflow, mcp, ...) instead of a
separate one. How expensive is that, concretely?

### Verified facts

Read `docs/architecture.md`, `docs/capability-seams.md` (the generated
service graph), `packages/core/agent-loop/README.md`, and
`packages/core/agent/src/index.ts` directly - not summarized secondhand.

- **`ctx.agentLoop` is a `bundle`-role service with zero listed alternative
  implementations** (`capability-seams.md` row: `| ctx.agentLoop | bundle |
  agent-loop | - | base, sdk-minimal | - |`). Unlike `ctx.llm` (a real
  `seam` with three interchangeable providers - `llm-deepseek`,
  `llm-pi-ai`, `llm-replay`), there is no config-level "swap the loop
  provider" story at that key.
- **The real seam is one level up, on `ctx.agents`.** `packages/core/agent/
  src/index.ts:171-203` exports `AgentFactory` (`createAgent(ownerCtx,
  options)`, `resume(ownerCtx, options)`), registered via
  `AgentRegistry.setFactory()` (`:355`). The class doc (`:233-237`) says it
  plainly: "Agent *creation* is provided by whichever plugin implements the
  `AgentFactory` (`@deepseek-ai/dsh-agent-loop`), registered via
  `setFactory`." `dsh-agent-loop`'s own README (top paragraph) confirms the
  same from the other side: "Choose a custom `Agent` implementation only
  when the standard 'call model, run tools, repeat' lifecycle is
  insufficient" - and its "Understand the implementation" section: "The
  package is **the one concrete implementation** of the public `Agent`
  contract. It registers itself as the `AgentFactory` on `ctx.agents`... 
  **Every observable effect happens through session events and the
  `agent/*` taxonomy** - package internals are never part of the public
  surface." This is a deliberately designed, documented, exported
  extension point - not something ACRYL would be working against the
  grain of DSH's architecture to use. `private factory: FactorySlot |
  undefined` confirms exactly one factory at a time, matching this
  ledger's own FR-009 (one runtime owner per episode).
- **Everything downstream of the loop depends on the session-event
  contract, not on `dsh-agent-loop` itself** - `docs/architecture.md`'s
  own "Core packages" table footnote-equivalent line: "extension packages
  depend on dsh-agent events and services, not on this package [agent-
  loop]." Concretely, per `capability-seams.md`: `compaction`,
  `session-query`, `session-projection`, `session-title`,
  `session-telemetry`, the Web/Desktop UI, `subagent`, `workflow`, and
  every tool all consume `ctx.sessions`/`ctx.agents`/session events -
  **none of them import `dsh-agent-loop` directly.** If a replacement
  `AgentFactory` emits the same `SessionEventMap` vocabulary (`turn/*`,
  `step/*`, `system/message`, `user/message`, `assistant/message`,
  `assistant/attempt`, `tool/*` - the exact turn-flow pseudocode in
  `docs/architecture.md`'s "Turn flow" section) and drives tool calls
  through the existing `ctx.tools` registry rather than a private one,
  every one of those consumers keeps working unmodified, with no edit to
  the pinned `deepseek-harness/` checkout.
- **`pi-cordis` (reviewed under spec 033's earlier tracking, see the
  amendment above) does not do this today.** It wraps Pi's own
  `AgentSession`/event model (`open`/`prompt`/`abort`/`subscribe`) as
  `ctx.piEngine` - a self-contained capability alongside DSH's tree, not
  an `AgentFactory` registered on DSH's own `ctx.agents`. This is
  consistent with `research-pi-spike.md`'s `AcrylEngineAdapter('pi')`
  design (a parallel engine, reconciled into ACRYL's canonical record
  after the fact), not the deep-integration path this decision assesses.

### The real cost of deep integration (an `AgentFactory` driven by Pi)

Building a Pi-backed `AgentFactory` is real, sanctioned engineering, not a
hack - but it is **substantial**, not thin-adapter-sized:

1. Implement `createAgent`/`resume` satisfying `AgentHandle` semantics
   (rollback-covered creation, paired disposal notifications, session
   persistence integration - `AgentFactory`'s own JSDoc states these
   invariants precisely; they are not optional).
2. Re-emit Pi's own agent-loop activity (its model calls, its tool
   decisions, its streaming) as DSH's `SessionEventMap` - i.e.
   reimplementing the *turn/step/request/assistant-stream/tool* event
   contract `docs/architecture.md`'s "Turn flow" section specifies in
   detail, driven by Pi's reasoning instead of `dsh-agent-loop`'s. This is
   DSH's most carefully specified subsystem; nothing about it is stable
   API today (`deepseek-harness/CLAUDE.md`: "Public APIs are pre-stable;
   update every consumer") - upstream evolves this contract regularly, and
   ACRYL would have to track it indefinitely with no upstream help, since
   the pinned checkout cannot be edited to ease the mapping.
3. Route Pi's tool-calling through DSH's `ctx.tools` registry (so DSH's
   fs/shell/lsp/skill/subagent/workflow ecosystem is usable from a
   Pi-driven turn) instead of, or in addition to, Pi's own bundled tools -
   a real translation layer between Pi's tool-invocation shape and DSH's
   guarded execution pipeline (pre-policy, monotonic guards, post-policy,
   per `ctx.tools`'s capability-seams.md row).
4. Match `ctx.systemPrompt` assembly, `ctx.approval`, and
   `ctx.sandboxPolicy` semantics so a Pi-driven turn is honest about what
   it is doing under DSH's own governance model - matching this ledger's
   own FR-012 (HMR/sandbox/approval parity), which already assumed this
   cost without naming its shape.

**What this buys, in exchange:** Pi becomes hot-reloadable the same way
`dsh-agent-loop` already is (a Cordis plugin, `/reload` swaps it), gains
DSH's entire existing tool/capability ecosystem for free (no separate
"Pi's own tools" world to maintain in ACRYL), and a Pi-driven turn is
genuinely indistinguishable from a DSH-driven one to every downstream
consumer (UI, compaction, session query, subagents) - the user's stated
goal ("pi.dev ENGINE to also function similarly to current DSH-cordis
ENGINE"), achieved exactly, not approximately.

**What the cheaper, already-speced path (this ledger + `research-pi-
spike.md`, `pi-cordis` as it stands) buys instead:** ships sooner, has no
ongoing DSH-internal-API tracking burden, and still gets a real, live,
hot-swappable, session-continuity-preserving Pi engine - but Pi's own
"maturing ecosystem of skills and extensions" (the user's other stated
goal) runs on Pi's own terms inside its own session, not through DSH's
tool registry, and a Pi turn stays visibly a *different kind of thing*
from a DSH turn to the rest of ACRYL rather than a peer.

### Recommendation (not yet decided - carried to the user)

Do not choose between these unilaterally in this ledger. Stage them:
ship the already-speced parallel-engine path first (it is the walking
skeleton US1 already commits to, and it is the cheaper, lower-risk proof
that engine-swapping and session continuity work at all). Treat the
`AgentFactory` deep-integration path as an explicit, separately-specced
follow-on ("pi as a native DSH agent-loop driver") once the parallel path
is live and the team has real field experience with how much Pi's and
DSH's ecosystems actually need to interoperate - the same staged-commitment
discipline `ACRYL_BLENDS_SPEC.md` §35 uses (prove the cheap vertical slice
before the expensive one).

### Addendum, 2026-09-11: reframed as three engines, not "DSH modified"

The user's own reframing corrects a flaw in the "deep integration" framing
above: it read as patching `dsh-agent-loop` itself, which really would be
an unsyncable fork. That is not required. The capability-seams graph shows
`ctx.tools`, `ctx.fs`, `ctx.shell`, `ctx.lsp`, `ctx.skill`, `ctx.subagent`,
`ctx.workflow`, `ctx.session`, `ctx.systemPrompt` etc. do **not** depend on
`dsh-agent-loop` - it is the other way around (`agent-loop` consumes them).
They are already independently mountable, published, upstream-syncable
`@deepseek-ai/dsh-*` packages, composable beside any driver, exactly like
`dsh-base` mounts them today.

So the real shape is **three separate engines**, each independently
upstream-syncable where it has an upstream:

1. **`dsh` (as-is)** - `startDirectHost()` extracted into a `dsh-cordis`
   provider (Decision 2's amendment already flags this doesn't exist yet
   either). Zero modification; syncs from the pinned `deepseek-harness/`
   submodule exactly as today.
2. **`pi` (scenario A above)** - `pi-cordis` as it already stands. Zero
   modification; syncs from upstream `pi`.
3. **`acryl` (a new, ACRYL-owned engine)** - mounts DSH's individual
   capability packages as ordinary Cordis rows (free, unmodified,
   independently upstream-syncable per package - the normal Cordis
   consumption pattern, the same one `dsh-agent-loop` itself uses for
   `ctx.tools`/`ctx.systemPrompt`), and supplies its **own** loop/driver on
   top, free to pull tool/skill definitions from both `dsh`'s tool seams
   and `pi`'s extension ecosystem. This is not "DSH plus Pi merged" as a
   single act - it is a new `AgentFactory`-shaped driver ACRYL authors and
   owns outright.

This removes the "fork `deepseek-harness/` forever" risk the original
framing above implied. It does **not** remove the two costs that were
always going to be real regardless of framing: (a) the loop itself -
`dsh-agent-loop`'s prefix/KV-cache request-construction discipline (frozen
system-prompt-as-surface-node, message-freeze provenance reuse) is where
DSH's efficiency actually lives, not in the seams around it; an `acryl`
loop that wants that property has to earn it fresh, by study or by adapting
Pi's own `pi-coding-agent` loop; (b) a real translation layer between Pi's
tool/skill definitions and `ctx.tools`'s registration shape (or a new,
third seam both convert into) - bounded, scoped work, but not zero.

**Recommendation, restated**: sequence 1 and 2 first (both cheap, both
already mostly speced/prototyped, both prove the swap mechanism and session
continuity end to end). Spin `acryl` into its own dedicated spec ledger once
1 and 2 are live and there is real field signal on what actually needs to
carry over from each side - not a task folded into this one. The user's own
framing: this could become "a new chapter" - potentially a coding-agent
engine other projects consume, not only ACRYL's internal choice - which is
exactly the scale that warrants its own ledger rather than a subtask here.

---

## Open items carried to tasks

The `pi` research spike is done - see [research-pi-spike.md](./research-pi-spike.md)
(pi `v0.85.1`, MIT; build on the `@earendil-works/pi-coding-agent` SDK +
`pi-agent-core` + `pi-ai`; **no Chord shims needed** on the SDK path, enforce
two forbidden-import rules).

| Item | Phase | Status |
| --- | --- | --- |
| `NEEDS PIN` + pi entry-point map | B spike | **Closed** (spike §2, §4) |
| Chord-shim surface area | B spike | **Closed** - none needed (spike §3) |
| Is `DurableSessionMessage` free of DSH-only fields? | A | Open (Phase A task) |
| pi bundle-size measurement → optional-dep vs `acryl-engine-pi` package | B1 | Open (measurement task; strategy chosen, spike §5) |
| pi `pi-ai` credential store vs `024-acryl-cli-login` seam | B1 | Open (design task) |
| pi `ToolCallEvent` interception → Cordis `ctx.approval` bridge | B1 | Open (design task) |
| Roadmap footnote: M9 Phase A carries M2-slice-α | A (docs) | **Done** (`c44b334`) |

## Decision 6: `acryl-cli` re-point onto `createAcrylEngineHost` (six-part Cordis mini-design)

**Context.** T013-T017 as originally written assumed an `AcrylEngineAdapter` /
`AcrylEngineHandle` registry (`engine/engine.ts`,
`registerAcrylEngineAdapter`). That design is stale. `engine-host.ts` already
implements the corrected architecture (one Cordis root, one stable
`acryl-engine` Loader row, `select(id)` via `entry.update()`), and
`engine-dsh.ts` already mounts the pinned profile as a Loader row beneath it.
The missing piece is the **consumer**: `acryl-cli/src/host/direct.ts` still
calls `bootAcrylHarnessProfile`, whose `boot()` creates a *second* Cordis root -
exactly what the 2026-09-09 architecture correction forbids. This is the
"M2-slice-alpha" that M9 depends on.

1. **Capability and plugin boundary.** The engine is a replaceable provider of
   "the agent runtime" - a capability ACRYL must be able to swap without
   restarting the surface (M9's whole point). `createAcrylEngineHost` owns the
   one root and the `acryl-engine` row; `createDshEngineDefinition(profile)`
   owns DSH profile composition. `acryl-cli/src/host/direct.ts` is a surface
   adapter: it must know *which engine is selected*, never *how DSH boots*.

2. **Provides and consumes.** Provides: no service (this is a composition root,
   not a Cordis consumer). Consumes: `createAcrylEngineHost` and
   `createDshEngineDefinition` from the workspace package
   `acryl-harness-runtime`. The existing optional `ctx.get('sessions')` /
   `ctx.get('agents')` readiness probe is retained verbatim (SC-004). No new
   `inject` requirement is introduced.

3. **Effects and disposal.** `createAcrylEngineHost` owns the root Fiber.
   `direct.ts` must call `host.dispose()` exactly once and stay idempotent
   (existing `disposed` flag retained). The nested DSH Include tree is disposed
   by `engine-dsh.ts`'s explicit `ctx.effect()` removal (the
   sibling-not-descendant fix from T010). `direct.ts` acquires no new resource,
   so it owns no new disposer.

4. **Configuration and composition.** Stable Loader row id `acryl-engine`
   (already fixed in `engine-host.ts`). Engine name `'dsh'` is the default and
   the only definition registered this phase; `--engine` selection is Phase 4
   (US2) and deliberately out of scope here. The profile name (`--profile`) is
   bound at host-creation time, matching `createDshEngineDefinition`'s
   one-profile-per-definition shape.

5. **Events and durability.** No new event. Durable state does not move: the
   `dsh` engine mounts the identical profile, so `DSH_HOME` (and therefore
   sessions, persistence, settings, credentials) stay exactly where they were.
   `--json` gains an **additive** `engine` field so the extraction is
   observable from the scriptable readiness probe; no durable format changes.

6. **Verification.** Real Loader activation through `startDirectHost` (the
   existing `tests/direct.spec.ts` pattern: real profile, HMR disabled, real
   `DSH_HOME`): `runtimeState`/`sessions`/`agents` unchanged, `engine === 'dsh'`,
   dispose idempotent, plus a source-level guarantee that `acryl-cli/src/**` no
   longer imports `bootAcrylHarnessProfile` (guarantee G6). Gate:
   `corepack pnpm run verify`, then `corepack pnpm run check`.

**Scope note (Ponytail).** T015 as written ("consume `handle.sessions` instead
of importing `createAcrylSessionBridge`") described an `AcrylEngineHandle`
abstraction that the built host does not have. `createAcrylEngineHost` returns
`ctx`; the session bridge is correctly built from that shared `ctx`, which is
the root the `dsh` engine's profile tree now lives in. Introducing a new
`AcrylSessionClient` wrapper for a single consumer would be speculative
indirection, so T015 reduces to "unchanged call site, now pointed at the host
root" and is verified by the T016 import guarantee instead.

## Decision 7: the surfaces x engines matrix (what a swap actually means per surface)

**Raised by the user**, 2026-09-11: the ledger scoped this feature to
`acryl-cli` ("Electron and Web adopt the engine-neutral path in later slices")
but never analysed *how the three surfaces behave across the three engines*.
This decision closes that gap. It is analysis plus a recommendation; it does
not change the implemented slice.

### Verified facts: what each surface actually requires

- **CLI (`acryl-cli`)** - one in-process Cordis root, profile `acryl`
  (`dsh-base`). Readiness is `ctx.get('sessions')` + `ctx.get('agents')`. All
  session I/O goes through `createAcrylSessionBridge(ctx)`
  (`open`/`snapshot`/`subscribeEvents`/`subscribeAssistantStream`), and
  `TuiStore` folds DSH's durable `SessionEventMap` (`turn/*`, `step/*`,
  `assistant/message`, `tool/*`) plus the process-local
  `agent/assistant-stream` frames. Its panels additionally read `ctx.llm`
  (`/model`), `ctx.credentials`/`ctx.authorization` (`/login`), `ctx.tools`,
  the Cordis Loader (`/plugins`, `/reload`), the pinned submodule's agent
  presets, and compaction/stats services.
- **Web (`acryl-web`)** - `bootAcrylWebProfile` boots profile `web`
  (`dsh-base` + `dsh-web-app`) and serves the **DSH browser client**:
  `dsh-client-modules` bundles (`window.__ModuleLoader__`), the
  `dsh-client-ui-*` slot tree, and RPC channels, behind
  `dsh-client-connection`'s browser auth. Every client panel consumes DSH
  sessions/agents over that RPC.
- **Desktop (`acryl-desktop`)** - Electron, profile `desktop`, advanced vs
  compatibility mode; Host + Client Cordis faces plus `ctx.connection`,
  `ctx.webServer`, `ctx.desktopRuntime`, and ACRYL-owned services
  (`desktopProfiles`, `desktopPnpm`, plugin lifecycle, install-recovery WAL,
  live activation, `dsh-community-market`, BLEND lock layer). It calls the
  Harness `boot()` itself (`acryl-desktop/src/main.ts:815`) with its own
  profile/composition machinery - verified: this is the **only** `boot()` call
  site in `acryl-desktop/src` - and it does **not** go through
  `acryl-harness-runtime`'s shared factory (`bootAcrylHarnessProfile` /
  `bootAcrylWebProfile`). (An earlier note in this session claimed five call
  sites; that conflated `dsh-app-boot` *imports* across
  `main.ts`/`desktop-cli.ts`/`profile.ts`/`profile-manager.ts`/
  `desktop-plugins.ts` with actual `boot()` invocations. Corrected here.)
- **Engine `dsh`** provides all of the above; it *is* the substrate.
- **Engine `pi` (`pi-cordis`, as built)** provides exactly one service:
  `ctx.piEngine` with `open()`/`prompt()`/`abort()`/`subscribe(event)` and
  `inject: ['loader']`. It provides no `ctx.sessions`, no `ctx.agents`, no
  `SessionEventMap`, no `ctx.tools`, no `ctx.llm`/credentials/authorization, no
  Cordis rows for the Pi world, and no HMR of Pi internals. Its event stream is
  Pi's own shape, unrelated to DSH's durable records.
- **Engine `acryl` (`acryl-cordis`)** exists as a repo with the DSH basis only;
  the Pi half is unstarted.

### The structural finding

A surface can run an engine only if it has a **projection** from that engine's
native session/transcript model to what the surface renders. Today ACRYL owns
exactly one such projection - `AcrylSessionBridge` + `TuiStore` - and it is
**DSH-shaped**. Web and Desktop own **no ACRYL projection at all**: they render
DSH's own pinned client packages, which speak DSH sessions/agents/slots over
DSH's own transport. ACRYL cannot re-point those at Pi without replacing them.

| Surface | `dsh` | `pi` (parallel, as built) | `acryl` (future) |
| --- | --- | --- | --- |
| **CLI** | Full - today's behavior | **Partial, and only after new work.** Prompt/stream/abort need a Pi-shaped projection; trajectory, tool cards, context, approvals, `/model`, `/login`, `/plugins`, presets, compaction and stats have **no data source** (`ctx.sessions`/`ctx.tools`/`ctx.llm` are absent) | Full in principle - same DSH surrounding, different loop |
| **Web** | Full - today's behavior | **Unavailable.** `dsh-web-app` + the `dsh-client-ui-*` family are DSH-shaped; `pi-cordis` ships no web client and no HTTP/WS session API | Works if it stays DSH-session-shaped (the pinned client is untouched) |
| **Desktop** | Full - today's behavior | **Unavailable.** Host/Client faces, plugin lifecycle, hot-reload, market, BLEND, connection and profiles are all DSH+Cordis; Pi offers no Cordis rows to hot-reload | Works if it stays DSH-session-shaped |

### Why this matters: "the pi engine" means two different things

The decisive insight is that two incompatible meanings of "Pi engine" have
opposite surface reach.

**Route 1 - Pi as a parallel engine (what `pi-cordis` is today).** Pi owns its
loop, session store, model runtime and extension ecosystem; ACRYL keeps its own
canonical record and reconciles after the fact.
- Reach: **CLI only**, and only after ACRYL writes a Pi-shaped projection.
- Buys exactly what the user described for Engine 2: a parallel world with Pi's
  own extensions, no DSH-internal-API tracking.
- Cannot reach Web/Desktop without ACRYL rebuilding both clients.

**Route 2 - Pi as a DSH `AgentFactory` (a driver inside DSH).** Pi supplies only
the loop; DSH keeps `ctx.sessions`, `ctx.tools`, `ctx.systemPrompt`, approvals
and - critically - the whole UI/Web/Desktop surrounding, which per
`capability-seams.md` consumes session events rather than `dsh-agent-loop`.
- Reach: **all three surfaces, unchanged.** Nothing in Web or Desktop needs to
  know which loop ran.
- Cost is the one already priced in Decision 5: re-emit Pi activity as
  `SessionEventMap`, route Pi tool calls through `ctx.tools`, match
  `ctx.systemPrompt`/approval/sandbox, and track a pre-stable upstream contract
  that cannot be edited.

**Engine 3 (`acryl-cordis`) is Route 2 generalized.** ACRYL's own
`AgentFactory`-shaped driver mounting DSH's individual capability packages
unmodified, free to source tools/skills from both ecosystems. It inherits Route
2's reach (all surfaces) precisely because the DSH surrounding stays in place.

### Recommendation

1. **Do not copy the CLI re-point into Web or Desktop.** It is not "the same
   change, later": they render DSH's own pinned clients, and an engine seam
   beneath them buys nothing until the projection question is answered.
2. **Declare per-surface engine support explicitly** instead of implying every
   surface supports every engine. Engine selection should be offered only where
   a surface declares support, and selecting an unrenderable engine should fail
   loud (FR-005's spirit) rather than boot into an empty shell.
3. **Sequence:**
   - Now: Engine 1 everywhere - which makes Desktop adopting the shared factory
     at all a real prerequisite (it currently boots through its own private
     `boot()` call rather than `acryl-harness-runtime`).
   - Next: settle what Engine 2 must be. If the goal is "Pi's ecosystem in
     ACRYL's terminal", Route 1 plus a Pi projection is the honest bounded
     deliverable. If the goal is "any engine, any surface", Route 2/3 is the
     only route and belongs in its own ledger.
   - Do not promise Web/Desktop engine swapping before Route 2/3 is chosen.

### Open question for the user

Is Engine 2's product goal (a) Pi's ecosystem available in ACRYL's terminal
surface, or (b) any engine drivable from every surface? The answer decides
whether Engine 2 is a bounded CLI feature or the start of the `AgentFactory`
program - and it decides whether Engine 3 is the main line or an experiment.

### Decision (user, 2026-09-11)

**(b): any engine, any surface.** Route 2/3 is the target - Pi becomes a
driver behind DSH's real `AgentFactory` seam (Decision 5), not a parallel
world reachable only from the CLI. `acryl-cordis` (Engine 3) is Route 2
generalized and is the main line, not an experiment.

Consequences for sequencing, unchanged from the recommendation above and now
committed to:

1. Engine 1 (`dsh`) everywhere first. Desktop adopting `acryl-harness-runtime`'s
   shared factory (today it calls DSH's raw `boot()` directly in
   `acryl-desktop/src/main.ts`, the only `boot()` call site in that package) is
   the real, unstarted prerequisite - not a "later slice." Web already goes
   through the shared factory (`bootAcrylWebProfile`) but not yet through
   `createAcrylEngineHost` specifically; both close the same gap CLI (T013-T017)
   already closed.
2. Do not build a Pi-shaped projection for any surface yet - Route 2 makes
   that unnecessary by design (DSH keeps `ctx.sessions`/`ctx.tools`/UI; only the
   loop swaps), so a projection would be throwaway work for the wrong route.
3. The `AgentFactory` program (Decision 5's real cost - re-emitting Pi activity
   as `SessionEventMap`, routing Pi tool calls through `ctx.tools`, matching
   `ctx.systemPrompt`/approval/sandbox, tracking a pre-stable upstream contract)
   is now in scope, not a deferred option. It needs its own ledger once Engine 1
   everywhere is done; this ledger stays scoped to Engine 1 + the engine-host
   mechanism until then.
