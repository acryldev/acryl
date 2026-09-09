# Implementation Plan: Interchangeable Harness Engine (DSH and pi)

## Architecture correction — 2026-09-09

The prior wording that each engine adapter "boots in its own Cordis root" is
superseded. `acryl-harness-runtime` owns one persistent Cordis host and Loader.
Each engine is a Loader-managed provider entry beneath that host: the default
DSH provider is `dsh-cordis`; the future Pi provider is `pi-cordis`. A provider
swap changes the one stable `acryl-engine` Loader entry, which disposes the old
engine Fiber and lets consumers reactivate against the next provider. The host
root, its Loader, and engine-neutral consumers survive the replacement.

`dsh-cordis` is independently publishable and carries the DSH base composition
and agent presets. It creates no root Context and instead injects the host's
`loader`. `pi-cordis` must follow the same shape. Engine packages own the live
capabilities they contribute; the host owns engine selection and replacement.

**Branch**: `028-harness-engine-swap` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Milestone**: M9 | **Depends on**: M2 (delivered here as Phase A / "M2-slice-α", see [research.md](./research.md) Decision 1)

## Summary

Make the agent **engine** a named, replaceable capability. Introduce one
engine-neutral seam in `acryl-harness-runtime` (`AcrylEngine` interface +
adapter registry + `ctx.runtime` marker), wrap today's DSH bootstrap as the
`dsh` adapter with zero behavior change, and re-point `acryl-cli` to resolve the
engine by name through that seam (**Phase A**). Then add the `pi` adapter -
upstream pi/prime-agent run in its own Cordis root, projected into the
ACRYL-owned canonical session record - plus a validated `acryl-engine` Loader
row, an `--engine` launch override, and HOT-swap via `/reload` (**Phase B**).
The ACRYL room, context relay, task artifacts, and worker identity are untouched
by either phase; a DSH-authored durable session is resumable under pi.

## Technical Context

**Language/Version**: TypeScript, Node `^22.19.0` or `>=24.0.0`, ESM. PNPM `11.8.0` via Corepack, `node-linker=isolated`.

**Primary Dependencies**: `@deepseek-ai/cordis` 4.0.1 (vendored), `@deepseek-ai/dsh-*` (pinned submodule, unmodified), `@deepseek-ai/dsh-app-boot`, `@earendil-works/pi-tui` 0.84.2 (rendering). Phase B adds pinned `pi` engine packages - `@earendil-works/pi-coding-agent` + `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` (the SDK `createAgentSessionRuntime` path), exact `0.85.x`, MIT, as `optionalDependencies` - per [research-pi-spike.md](./research-pi-spike.md) §1/§4.

**Storage**: ACRYL-owned canonical session record via `DurableSessionMessage` port (`acryl-harness-runtime`). Engine-native session stores are projection sources only. Profile/Loader config on disk (`cordis.yml` / patches). No new store.

**Testing**: `corepack pnpm run typecheck`, `corepack pnpm run test` (per-package vitest `run`), `corepack pnpm run verify`, full gate `corepack pnpm run check`. Loader-activation / disposal tests in `acryl-harness-runtime/tests/` and `acryl-cli/tests/`. Headless-safe.

**Target Platform**: local developer machine (macOS / Linux / Windows), terminal surface first.

**Project Type**: multi-package workspace; this feature touches `acryl-harness-runtime` (seam + adapters), `acryl-control` (engine-select/-swap operation + `ctx.runtime` typing), `acryl-cli` (consume seam). Electron/Web unchanged this ledger.

**Performance Goals**: engine boot within the current `bootAcrylHarnessProfile` envelope for `dsh` (no regression); HOT-swap completes without a process restart.

**Constraints**: one writable runtime owner per profile; one Cordis lifecycle system (no Chord); `deepseek-harness/` and `pi` consumed unmodified; HMR retained (`--expose-internals` when composed profile enables it); every resource effect-owned with an ordered disposer; default `dsh` path byte-for-byte unchanged (SC-004).

**Scale/Scope**: 2 engines (`dsh`, `pi`); 1 surface wired (`acryl-cli`); combo engine and Electron/Web out of scope.

## Constitution Check

*GATE: must pass before Phase 0 was written; re-checked after design below.*

| Principle / Law | Status | Note |
| --- | --- | --- |
| I. Everything is a plugin | PASS | Each engine adapter is a function/`Service` plugin mounted by the `acryl-engine` Loader row; `ctx.runtime` is a named service. No privileged kernel path. |
| II. Agents disposable; room persistent | PASS | Engine is disposable; room / relay / task artifacts / worker identity constant across select and swap (FR-008). `ctx.runtime` is capability-truth, not an agent-name switch. |
| III. Compose DSH, don't fork it | PASS | `dsh` adapter wraps existing `bootAcrylHarnessProfile`. `pi` consumed unmodified through published entry points (FR-014). No DSH/Cordis semantics mutated. If the engine seam needs a DSH capability that has no seam, a CORE EXTENSION PROPOSAL is written first. |
| IV. Canonical state durable and agent-independent | PASS | Canonical record = ACRYL-owned `DurableSessionMessage` stream; engine-native stores are projections (FR-006). Cross-engine resume reads that stream (research Decision 4). |
| V. Generated capabilities outside kernel | N/A | No generated capability here. Mutation classes used: engine select = composition; HOT-swap = HMR plugin remount (FR-010). |
| Cordis Law 1 (contract before impl) | PASS | `contracts/engine-runtime.md` defines `AcrylEngine` before code. |
| Cordis Law 2 (inject service keys) | PASS | Consumers `inject: ['runtime']` (or the engine service key); never a concrete adapter. |
| Cordis Law 3 (every resource a disposer) | PASS | Adapter owns engine root, sessions, processes, subscriptions in one effect tree; disposer is ordered + idempotent (FR-010/011). Six-part §3 below. |
| Cordis Law 4 (services vs events; waterfall `next()`) | PASS | Engine ops are service calls; an `engine.swap` observation event is `emit` (sync, no veto). No waterfall interception introduced. |
| Cordis Law 5 (deliberate scope) | PASS | Engine adapter scope = root (it *is* the runtime for the episode). `ctx.runtime` resolves at root. |
| Cordis Law 6 (stable ids, typed config, fail loud) | PASS | Row id `acryl-engine`; config `{ engine: 'dsh'|'pi' }` as sync StandardSchema; unknown engine throws before `boot()` (FR-005). |
| Cordis Law 7 (generated plugins testable/least-privilege/rollbackable) | N/A | No generated capability here (see Principle V row). HOT-swap rollback is HMR transactional apply, not a generated-plugin concern. |
| Cordis Law 8 (never assume load order) | PASS | Consumers PENDING until `AcrylEngine` present; swap reactivation keyed on service availability, not row order. |
| Desktop constraints (PNPM, headless-safe, HMR) | PASS | Corepack PNPM only; all gates headless; HMR rule preserved from `bootAcrylHarnessProfile`. |
| One writable runtime owner per profile | PASS | FR-009; single `acryl-engine` row with an enum makes "two engines at once" unrepresentable. |

**No violations. Complexity Tracking table omitted.**

Open risk (not a violation): Phase A folds a minimal M2 seam into this ledger.
Justified in research.md Decision 1 - the alternative (block M9 on the full
`026` rework) violates vertical-slice discipline. Roadmap M2 gets a footnote.

## Six-Part Cordis Mini-Design

### 1. Capability and plugin boundary

- **`AcrylEngine` seam** (`acryl-harness-runtime`): the domain of "what owns the
  agent loop, durable sessions, tools, models, approvals for this profile
  episode". Needs independent lifecycle because the whole point is to unload one
  engine and activate another in a live process.
- **`dsh` engine adapter plugin**: wraps `bootAcrylHarnessProfile` +
  `createAcrylSessionBridge`. Independent lifecycle so it can be swapped out.
- **`pi` engine adapter plugin** (Phase B): boots pi in its own Cordis root,
  projects into the canonical record.
- **`ctx.runtime` marker service**: a one-field service (`'dsh' | 'pi'`) each
  adapter registers, so any plugin reads capability-truth without importing an
  adapter.
- **`acryl-engine` Loader row**: the composition input that selects the adapter.
- Out of boundary: agent *providers within* a runtime (that stays
  `AcrAgentControl`); the room, relay, task artifacts (untouched).

### 2. Provides and consumes

**Provides**

- `AcrylEngine` interface + `registerAcrylEngineAdapter(owner, adapter)` +
  `resolveAcrylEngineAdapter(name)` registry (`acryl-harness-runtime`).
- `ctx.runtime: AcrylRuntimeMarker` service (`{ engine: 'dsh' | 'pi' }`).
- Engine-neutral session client (promote/confirm `AcrylSessionClient` from
  `acryl-control/contracts/session.ts` as the surface-facing path).
- `engine.swap` observation event (`emit`): `{ from, to, operationId }`.
- A `ControlOperation` of kind `engine.select` / `engine.swap` with
  `restartClass: 'HOT'` (`acryl-control`).

**Consumes**

- Hard `inject`: the `dsh` adapter injects nothing new (uses `dsh-app-boot`
  directly, as today). The `pi` adapter injects nothing from DSH (own root).
- Hard `inject` for surface/consumers: `['runtime']` for anything that branches
  on engine; the session-consuming path injects the session-client service key.
- Optional `ctx.get('hmr')` for the swap path (already gated by
  `--expose-internals` in `bootAcrylHarnessProfile`).
- Durable facts: the canonical `DurableSessionMessage` stream (existing port).

### 3. Effects and disposal

The engine adapter acquires **every** engine resource inside one owning
`ctx.effect()` tree on its root:

```
effect "acryl-engine: <name> root"
  ├─ boot engine root (dsh: bootAcrylHarnessProfile; pi: pi-root)
  ├─ effect "session bridge"        → dispose: close DurableSessionMessage port
  ├─ effect "ctx.runtime marker"    → dispose: deregister
  ├─ effect "engine subscriptions"  → dispose: unsubscribe streaming
  └─ effect "in-flight turn guard"  → dispose: abort AbortController, await quiescence
  disposer (LIFO): abort in-flight turn → unsubscribe → deregister marker
                   → close port → dispose engine root fiber
```

- **Cancellation**: swap/unload first aborts the in-flight turn's
  `AbortController` and awaits quiescence before disposing the root (FR edge
  case, SC-007).
- **Quiescence**: disposer resolves only after the engine root's
  `ctx.fiber.dispose()` settles - no orphaned process/socket/PTY.
- **Idempotent**: `disposed` guard as in today's `bootAcrylHarnessProfile`.
- **HOT-swap ordering**: HMR unloads the old adapter fiber (runs the disposer
  above), then applies the new row → new adapter activates → consumers
  reactivate. If new activation fails, HMR transactional apply restores the
  prior composition.

### 4. Configuration and composition

- Loader row id: **`acryl-engine`** (stable).
- Config schema (sync StandardSchema, per cheatsheet §4.1):
  `{ engine: enum('dsh','pi') = 'dsh' }`. Config is *replaced* on `/reload`,
  not merged.
- `--engine <name>` patches the composed `acryl-engine` entry's `engine` value
  in `bootAcrylHarnessProfile` **before `boot()`**, for that launch only; the
  persisted row file is not rewritten (FR-004). Unknown name → throw
  (`AcrylExitClass = 'usage'`) before `boot()` (FR-005).
- Scope: root. The adapter *is* the runtime owner for the episode (FR-009).
- Provider-replacement behavior: swapping the `engine` value and `/reload` is
  the canonical replacement path; consumers depend on the `AcrylEngine` /
  session-client service keys, never on `dsh`/`pi` concretely.

### 5. Events and durability

- **Durable (replay-critical)**: session turns, tool calls, decisions → the
  ACRYL-owned `DurableSessionMessage` stream, written by the active adapter.
  `sessionId` is ACRYL-owned and stable across engines; each engine's
  `ProviderSessionRef` is private and never authoritative (FR-006, research
  Decision 4).
- **Live events (coordination only)**: `engine.swap` (`emit`, sync, no veto) so
  surfaces can re-render `ctx.runtime`. No waterfall, no interception.
- **No new event bus / store** (constitution; FR-013).

### 6. Verification

Per `docs/onboarding/orientation_spec_acryl.md` §10 the Cordis completion bar:

- Real Loader activation of the `acryl-engine` row for `engine: 'dsh'` and
  `engine: 'pi'`.
- Valid `PENDING` for an `AcrylEngine` consumer when no adapter is mounted;
  reactivation when it appears.
- Provider replacement: `dsh` → `pi` via row change + `/reload`, no stale
  references, no duplicate registrations (SC-007).
- Full disposal + quiescence: after unload, zero leaked process/socket/PTY/
  subscription/timer/registration (SC-003, SC-007).
- Repeated mount/reload (swap back and forth) without leak.
- Cancellation of an in-flight turn at swap time (SC-007).
- Durable cross-engine resume: DSH-write → pi-resume on one `sessionId`
  (SC-006).
- Honest degradation: an engine that cannot meet HMR/sandbox/approval contracts
  is rejected at activation, not degraded (FR-012, SC-008).
- Regression: default (no selection) `dsh` path unchanged (SC-004).

## Project Structure

### Documentation (this feature)

```text
specs/028-harness-engine-swap/
├── plan.md              # this file
├── research.md          # M2 assessment + pi/Chord/selection/resume decisions
├── research-pi-spike.md # pi package layout, entry-point map, pin, Chord audit
├── data-model.md        # engine entities + acryl-engine row schema
├── quickstart.md        # runnable validation scenarios
├── contracts/
│   └── engine-runtime.md   # AcrylEngine + adapter + ctx.runtime contract
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
acryl-harness-runtime/
├── src/
│   ├── engine/
│   │   ├── engine.ts          # AcrylEngine interface, marker service, errors  [NEW, Phase A]
│   │   ├── registry.ts        # register/resolve adapter by name               [NEW, Phase A]
│   │   ├── adapter-dsh.ts     # dsh adapter: wraps bootAcrylHarnessProfile     [NEW, Phase A]
│   │   └── adapter-pi.ts      # pi adapter: pi in its own Cordis root          [NEW, Phase B]
│   ├── index.ts               # export engine seam; --engine override hook     [MODIFY, Phase A/B]
│   ├── session-bridge.ts      # confirm DurableSessionMessage is engine-neutral [MODIFY if needed, Phase A]
│   └── durable-message.ts     # tighten if DSH-only fields found               [MODIFY if needed, Phase A]
└── tests/
    ├── engine-registry.spec.ts        [NEW, Phase A]
    ├── engine-dsh-adapter.spec.ts     [NEW, Phase A]
    ├── engine-swap.spec.ts            [NEW, Phase B]
    └── engine-cross-resume.spec.ts    [NEW, Phase B]

acryl-control/
├── src/
│   ├── contracts/session.ts   # promote AcrylSessionClient as surface path     [MODIFY, Phase A]
│   ├── contracts/operations.ts# engine.select / engine.swap operation kinds    [MODIFY, Phase B]
│   └── runtime.ts             # ctx.runtime marker typing + re-export          [NEW, Phase A]
└── tests/
    └── engine-operation.spec.ts       [NEW, Phase B]

acryl-cli/
├── src/
│   ├── cli/grammar.ts         # parse --engine <name>                          [MODIFY, Phase B]
│   ├── cli/run.ts             # resolve engine by name via seam                [MODIFY, Phase A]
│   ├── host/direct.ts         # engine-neutral readiness, drop dsh key probe   [MODIFY, Phase A]
│   └── tui-app/session.ts     # consume engine-neutral session client         [MODIFY, Phase A]
└── tests/
    └── engine-select.spec.ts          [NEW, Phase B]
```

**Structure Decision**: no new package. The seam lives in
`acryl-harness-runtime` (the engine boundary per the roadmap), the operation
typing in `acryl-control`, consumption in `acryl-cli`. Adapters are sub-modules
of `acryl-harness-runtime/src/engine/`, not separate packages, until a second
surface or an external engine author needs them extracted (Ponytail: one
implementation before a factory).

## Phasing

| Phase | Delivers | User story | Gate |
| --- | --- | --- | --- |
| **A - engine seam + `dsh` adapter + TUI re-point (M2-slice-α)** | `AcrylEngine` interface, registry, `dsh` adapter (behavior-preserving), `ctx.runtime`, TUI consumes the seam and the engine-neutral session client; direct `acryl-harness-runtime` bootstrap imports removed from the surface | foundational (enables US1-US3) | SC-004 regression: default `dsh` path unchanged; existing TUI + canvas tests green; new registry/adapter Loader tests |
| **B1 - `pi` adapter** | research spike closed in [research-pi-spike.md](./research-pi-spike.md) (pin `0.85.x`, entry-point map, Chord audit); `adapter-pi.ts` boots pi in its own root; projects into the canonical record; meets HMR/sandbox/approval contracts | US1 | SC-001, SC-002, SC-003, SC-008; cross-resume SC-006 |
| **B2 - selection** | `acryl-engine` Loader row + schema; `--engine` launch override; unknown-name loud failure | US2 | SC-005; row + override tests |
| **B3 - HOT-swap** | `/reload` engine swap; ordered disposal; PENDING → reactivation; in-flight cancellation; transactional rollback | US3 | SC-007; leak / repeated-swap tests |

Each phase is a focused-commit checkpoint with a `docs/DEVELOPMENT-LOG.md`
entry. The Phase B1 research spike is closed (`research-pi-spike.md`); the two
remaining B1 design items (pi credential path vs `024-acryl-cli-login`; pi
approval bridge to `ctx.approval`) are tasks T018/T019 and must land before the
`pi` adapter implementation task.

## Complexity Tracking

No constitution violations requiring justification.
