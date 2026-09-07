# Research: Interchangeable Harness Engine (M9)

**Feature**: `specs/028-harness-engine-swap`
**Date**: 2026-09-07
**Inputs**: `spec.md`, resolved Wayfinder ticket 04, `docs/ACRYL-ROADMAP.md` (M2/M9),
`docs/cordis/cordis-usage-cheatsheet.md`, source of `acryl-harness-runtime`,
`acryl-control`, `acryl-tui`.

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
  for M2. **But** the TUI does not consume it: `acryl-tui/src/cli/run.ts`
  imports `startDirectHost` from `../host/direct.ts`, which imports
  `bootAcrylHarnessProfile` from `acryl-harness-runtime` directly, and
  `acryl-tui/src/tui-app/session.ts` builds on `createAcrylSessionBridge`
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
  `acryl-tui/src/host/direct.ts` sets `runtimeState` from
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
3. Re-point `acryl-tui` (`cli/run.ts`, `host/direct.ts`, `tui-app/session.ts`)
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
