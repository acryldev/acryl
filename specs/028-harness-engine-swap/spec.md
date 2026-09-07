# Feature Specification: Interchangeable Harness Engine (DSH and pi)

**Feature Branch**: `028-harness-engine-swap`

**Created**: 2026-09-07

**Status**: Draft

**Milestone**: M9 - Interchangeable harness engine

**Authority**: `docs/ACRYL-ROADMAP.md` (M9), `specs/000-wayfinding/issues/04-lock-harness-engine-swap.md` (resolved), `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`

**Input**: User description: "Interchangeable harness engine (M9): make the agent engine a replaceable provider behind acryl-harness-runtime. DSH-in-CLI-mode is engine #1; pi (pi.dev/prime-agent) consumed as an in-process library with its own Cordis root is engine #2. ctx.runtime resolves to 'dsh' or 'pi'. acryl-harness-runtime becomes an interface with a DSH adapter and a pi adapter; surfaces call only the engine-neutral acryl-control API (depends on M2). Engine selected via a Loader row (--engine pi), HOT-swappable via /reload. ACRYL room, context relay, task artifacts, and worker identity stay constant across a swap; a DSH-created durable session can be resumed under pi with the canonical record staying ACRYL-owned. pi engine must match Cordis HMR/sandbox/approval contracts. DSH+pi combo engine is an explicit non-goal (follow-on). First slice: `acryl tui --engine pi` runs a prompt end-to-end through pi while prior DSH room state stays visible, with no duplicate runtime owner and full disposal on exit."

## Overview

Today ACRYL has exactly one agent engine: DeepSeek Harness run in CLI mode,
wired directly into `acryl-harness-runtime` (`startDirectHost()`) as the single
Cordis root. The rendering library pi-tui is borrowed for the terminal surface,
but the engine - the owner of the agent loop, durable sessions, tools, models,
and approvals - is not replaceable.

This feature makes the engine a **selectable, replaceable capability**. A user
picks the engine (`dsh` or `pi`) and the surrounding ACRYL product - the room,
context relay, task artifacts, worker identity, and the durable session record -
stays identical. The engine becomes disposable; continuity persists. This is the
product thesis applied one level deeper than agent providers: not just "any
agent", but "any agent engine".

`pi` here is the upstream `pi` / prime-agent runtime
(github.com/earendil-works/pi), consumed as an in-process library. It brings its
own composition machinery (`@earendil-works/chord`, an unfinished
Cordis-parallel runtime); ACRYL keeps one Cordis lifecycle system and maps the
pi engine onto Cordis seams rather than adopting a second runtime.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a prompt end-to-end on the pi engine (Priority: P1)

A terminal user launches `acryl tui --engine pi` against an authenticated
profile, submits a prompt, and sees the running/idle state plus the streamed
transcript and tool activity produced by the pi engine. Room and task state that
a previous DSH-engine session wrote is still visible in the same surface. On
exit the terminal is restored and every engine-owned resource is disposed with
no orphaned worker and no second runtime owner.

**Why this priority**: This is the walking skeleton. It proves the engine
boundary is real - a non-DSH engine drives a full turn through the
engine-neutral control API - and proves continuity survives the switch. Nothing
else in M9 is meaningful until one alternate engine runs a turn.

**Independent Test**: With a profile that previously produced DSH room/task
state, run `acryl tui --engine pi`, submit one prompt, observe a pi-produced
response and prior room state in the same view, exit, and confirm (via the
runtime's resource/lifecycle report and process inspection) that no engine
process, socket, PTY, subscription, timer, or plugin registration leaked and
that only one runtime owner existed for the session.

**Acceptance Scenarios**:

1. **Given** an authenticated profile and a stable `--engine pi` Loader row,
   **When** the user runs `acryl tui --engine pi` and submits a prompt,
   **Then** the surface renders pi-engine transcript and tool events and shows
   `ctx.runtime` resolved to `pi`.
2. **Given** the same profile has prior DSH-engine room and task artifacts,
   **When** the pi-engine session is open,
   **Then** those artifacts are visible and unchanged in the surface.
3. **Given** a running pi-engine turn,
   **When** the user cancels with the documented binding,
   **Then** the turn aborts cleanly with no half-registered handler.
4. **Given** an open pi-engine session,
   **When** the user exits the surface,
   **Then** the terminal is restored and the runtime's disposal report shows
   every engine-owned resource released and one runtime owner for the episode.

---

### User Story 2 - Choose the engine per launch and per profile (Priority: P2)

An operator selects which engine a profile uses by editing a single stable
Loader row (or passing `--engine <name>` at launch, which overrides it for that
launch). The default engine when nothing is specified is `dsh`, preserving all
current behavior. An unknown engine name fails loudly at launch with a clear
message, before any runtime is booted.

**Why this priority**: Selection is required for the feature to be usable beyond
a hardcoded experiment, but it depends on US1 proving an engine can run at all.

**Independent Test**: Set the Loader row to `pi`, launch with no flag, confirm
pi runs; launch the same profile with `--engine dsh`, confirm DSH runs;
launch with `--engine bogus`, confirm a loud pre-boot failure naming the
invalid value and listing valid engines.

**Acceptance Scenarios**:

1. **Given** a profile with no engine configured, **When** the user launches any
   surface, **Then** the `dsh` engine is used and current behavior is unchanged.
2. **Given** a profile Loader row set to `pi`, **When** the user launches with no
   `--engine` flag, **Then** the `pi` engine is used.
3. **Given** any profile, **When** the user passes `--engine dsh` while the row
   says `pi`, **Then** `dsh` is used for that launch only and the row is not
   rewritten.
4. **Given** any profile, **When** the user passes `--engine <unknown>`, **Then**
   the launch aborts before booting a runtime with a message naming the invalid
   value and the valid engine names.

---

### User Story 3 - Hot-swap the engine mid-project (Priority: P3)

While a profile is running, an operator changes the engine Loader row and issues
`/reload`. The runtime unloads the current engine (disposing its sessions,
processes, and registrations in order), activates the newly selected engine, and
the surface reflects the change without a full process restart. In-flight engine
work is cancelled as part of the unload. Consumers that require the engine enter
`PENDING` during the gap and reactivate against the new engine.

**Why this priority**: HOT-swap is the roadmap's stated selection behavior but
is the highest-risk slice (disposal ordering, PENDING correctness, no duplicate
registration). It is valuable only after US1 and US2 are solid.

**Independent Test**: Start a profile on `dsh`, run a turn, change the row to
`pi`, run `/reload`, confirm the surface now shows `ctx.runtime` = `pi`, confirm
the previous engine's resources are all disposed (no leak, no duplicate
registration) via a Loader/activation test, and confirm room/task/session
continuity across the swap.

**Acceptance Scenarios**:

1. **Given** a running `dsh`-engine profile, **When** the operator sets the row
   to `pi` and runs `/reload`, **Then** the runtime disposes the `dsh` engine in
   order, activates the `pi` engine, and the surface shows `ctx.runtime` = `pi`.
2. **Given** an in-flight turn at `/reload` time, **When** the swap begins,
   **Then** the turn is cancelled cleanly before the old engine is disposed.
3. **Given** a consumer that injects the engine capability, **When** the engine
   is briefly absent during the swap, **Then** the consumer is `PENDING`, not
   errored, and reactivates against the new engine.
4. **Given** a durable session created under `dsh`, **When** the engine swaps to
   `pi` and the user continues that session, **Then** the prior turns render
   from the canonical ACRYL-owned record and a new pi turn appends to it.

---

### Edge Cases

- **Session started on one engine, resumed on another**: prior turns must
  render from the canonical ACRYL-owned record; the new engine appends. If an
  engine cannot faithfully continue a specific session state, the surface
  surfaces a clear, documented limitation rather than silently dropping history.
- **Engine fails to activate** (bad auth, missing binary/dependency, incompatible
  version): the launch or `/reload` fails loudly, names the engine and cause,
  and - for `/reload` - the previously healthy engine composition is restored.
- **Cancellation during swap**: an in-flight turn at swap time is cancelled
  before the old engine disposes; no half-registered handler survives.
- **`--engine` flag vs Loader row disagree**: the launch flag wins for that
  launch only and never rewrites the persisted row.
- **Unknown engine name**: rejected before any runtime boots.
- **Capability an engine cannot meet** (HMR, sandbox, approvals): for M9 the pi
  engine MUST meet these contracts; an engine that cannot is not a valid M9
  engine and must be rejected at activation, not degraded silently.
- **Two engines requested at once** (combo): rejected in M9 with a message
  pointing to the follow-on combo work.
- **Stale `.acryl/control` artifacts**: must not affect engine selection or
  direct launch.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose the agent engine as a single named,
  replaceable capability resolved from context (`ctx.runtime`), with the value
  identifying the active engine (`dsh` or `pi`).
- **FR-002**: `acryl-harness-runtime` MUST define one engine-neutral contract
  (start, durable-session access, prompt submission, cancellation, streamed
  transcript/tool projection, ordered disposal) that both a DSH adapter and a pi
  adapter implement. No surface may call an engine-specific bootstrap directly.
- **FR-003**: All surfaces (`acryl-tui` first) MUST drive the engine only
  through the engine-neutral `acryl-control` capability API. This feature
  depends on M2 normalizing that API and MUST NOT proceed to implementation
  before the M2 contract exists.
- **FR-004**: The active engine MUST be selectable via one stable Loader row per
  profile, with `--engine <name>` overriding it for a single launch without
  rewriting the row. Absent any selection, the engine MUST default to `dsh` with
  no behavior change from today.
- **FR-005**: An unknown or unsupported engine name MUST cause a loud failure
  before any runtime is booted, naming the invalid value and the valid engine
  names.
- **FR-006**: The canonical durable record of a session (turns, tool calls,
  decisions) MUST remain ACRYL-owned and engine-independent. Engine-native
  session stores are projections into that record, never a competing source of
  truth.
- **FR-007**: A durable session created under one engine MUST be resumable under
  another engine: prior turns render from the canonical record and the new
  engine appends to the same session. Where an engine cannot faithfully
  continue, the surface MUST show a documented limitation, not silent loss.
- **FR-008**: The ACRYL room, context relay, task artifacts, decisions, and
  canonical worker identity MUST be unchanged by an engine selection or swap.
- **FR-009**: Exactly one writable runtime owner MUST exist per profile episode
  regardless of engine. The system MUST NOT run two engines concurrently in one
  profile in M9.
- **FR-010**: Changing the engine Loader row and issuing `/reload` MUST unload
  the current engine (ordered disposal of its sessions, processes, sockets,
  PTYs, timers, subscriptions, and registrations; cancellation of in-flight
  work), activate the newly selected engine, and take effect without a full
  process restart (HOT).
- **FR-011**: Consumers that require the engine capability MUST enter `PENDING`
  while the engine is absent during a swap and reactivate against the new engine
  with no stale references and no duplicate registrations.
- **FR-012**: The pi engine MUST honor the same Cordis contracts DSH does for
  HMR, sandboxing, and approvals. An engine that cannot meet these MUST be
  rejected at activation.
- **FR-013**: ACRYL MUST keep one Cordis lifecycle and dependency-injection
  system. The pi engine adapter maps pi's loop onto Cordis seams; it MUST NOT
  introduce a parallel lifecycle, DI, event, or state system (including
  `@earendil-works/chord`).
- **FR-014**: `deepseek-harness/` and the pinned `pi` source MUST be consumed
  unmodified through published entry points; neither is edited from this feature.
- **FR-015**: Engine adapters MUST each carry an explicit, documented contract
  covering capability set, cancellation, disposal, authentication, and fidelity
  (what it can and cannot faithfully represent).

### Key Entities

- **Engine**: the owner of the agent loop, durable sessions, tools, models, and
  approvals for a profile episode. Named (`dsh`, `pi`). Exactly one active per
  profile in M9. Replaceable.
- **Engine adapter**: the ACRYL-owned mapping between one concrete engine
  (DSH-in-CLI, pi) and the engine-neutral runtime contract. Owns acquisition and
  ordered disposal of that engine's resources.
- **Engine selection**: the stable Loader row plus optional launch override that
  determines which engine activates. Persisted per profile.
- **Canonical session record**: the ACRYL-owned durable account of a session's
  turns, tool calls, and decisions. Engine-independent; the source of truth for
  resume across engines.
- **Worker identity**: the canonical ACRYL identity of the agent worker,
  constant across engine swaps and distinct from the live engine/process
  identity and any engine-scoped session reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can run `acryl tui --engine pi`, submit a prompt, and see a
  pi-produced response, with no code path importing an engine-specific bootstrap
  from a surface package.
- **SC-002**: In the same pi-engine session, room and task artifacts produced by
  a prior DSH-engine session are visible and unchanged.
- **SC-003**: After exiting a pi-engine session, the runtime's resource report
  and process inspection show zero leaked engine resources and exactly one
  runtime owner for the episode.
- **SC-004**: Launching with no engine selection reproduces today's DSH behavior
  with no observable difference (regression gate on the existing TUI and canvas).
- **SC-005**: An invalid `--engine` value is rejected before any runtime boots,
  in a single clear message.
- **SC-006**: A durable session created under `dsh` is continued under `pi` in a
  later launch: prior turns render from the canonical record and a new pi turn
  is appended to the same session.
- **SC-007**: Changing the engine row and running `/reload` swaps the engine
  without a process restart; a Loader/activation test shows ordered disposal of
  the old engine, `PENDING` then reactivation of engine consumers, and no
  duplicate registrations.
- **SC-008**: The pi engine passes the same HMR, sandbox, and approval contract
  tests the DSH engine passes.

## Assumptions

- M2 (normalized shared runtime capability API in `acryl-control`) lands before
  this feature's implementation begins. If M2 is not ready, this ledger is
  blocked, not worked around.
- `pi` (github.com/earendil-works/pi) is consumable as an in-process library
  from Node at a pinned version/commit, exposing an agent loop, session state,
  tool execution, and streaming that can be mapped onto the engine-neutral
  contract. The exact pin and entry points are resolved in `research.md`.
- `@earendil-works/chord` is treated as a design reference and a source of
  portable ideas, not a dependency to load or a second runtime to adopt.
- The DSH engine adapter is a thin wrapper over the current `startDirectHost()`
  composition and existing ACRYL session bridge; extracting it MUST NOT change
  DSH-engine behavior.
- Work proceeds directly on `main` in focused commits per repo policy, with a
  `docs/DEVELOPMENT-LOG.md` checkpoint after each implementation commit.
- The DSH+pi combo engine, model routing between engines, and remote/detached
  engine hosting are explicitly out of scope for this ledger (follow-on work).
- `acryl-tui` is the only surface wired in this ledger; Electron and Web adopt
  the engine-neutral path in later slices.
