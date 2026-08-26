# Tasks: ACRYL Standalone Agent and Peer Hosts

**Input**: Design documents from `specs/018-acryl-control-hosts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli.md

**Tests**: Tests are required by the specification and by `AGENTS.md` lifecycle rules. Write the failing test first for each service, then implement, then verify disposal/leak behavior.

**Organization**: grouped by user story; foundational control-plane services block all stories.

## Phase 1: Setup

**Purpose**: workspace scaffolding.

- [x] T001 Create `acryl-control/` workspace: `package.json`, `tsconfig.json`, `cordis.patch.yml`, and a public `src/index.ts` Host entry
- [ ] T002 [P] Create `acryl-tui/` workspace: `package.json` (Bun 1.3+ / Node 26.4+ runtime, `@opentui/core` dependency), `tsconfig.json`
- [ ] T003 [P] Wire root `package.json` scripts for `acryl-control` and `acryl-tui` build, typecheck, and test so `corepack yarn check` includes both

## Phase 2: Foundational (control-plane service definitions and providers)

**Purpose**: host-neutral ACRYL control services consumed by all host surfaces. Blocks every user story.

- [ ] T004 Define control protocol types in `acryl-control/src/contracts/control-protocol.ts`: generation-scoped `ControlEndpoint`, `ControlCapability`, and canonical JSON envelope
- [ ] T005 [P] Define ownership types in `acryl-control/src/contracts/ownership.ts`: `HostKind`, `HostInstance`, `ProfileOwnershipLease`, states, and invariants
- [ ] T006 [P] Define operation types in `acryl-control/src/contracts/operations.ts`: `ControlOperation`, receipt, `restartClass`, and exit classes
- [ ] T007 [P] Declare typed ACRYL events in `acryl-control/src/events.ts` (`acryl/host-status`, `acryl/ownership-changed`, `acryl/operation-settled`, `acryl/agent-runtime-status`)
- [x] T008 Write failing ownership test in `acryl-control/tests/ownership.spec.ts`: exclusive acquire, attach, release, and 100-way race yielding exactly one owner
- [ ] T009 Implement `acrProfileOwnership` provider in `acryl-control/src/ownership/lease-store.ts` and `lease-provider.ts` (platform-exclusive lock, heartbeat, release) to pass T008
- [x] T010 Implement stale/suspect recovery in `acryl-control/src/ownership/lease-store.ts` with verification before removal
- [ ] T011 Write failing architecture test in `acryl-control/tests/architecture.spec.ts`: bounded `RuntimeArchitectureSnapshot` projects native Fiber/service/effect state without a parallel registry
- [ ] T012 Implement `acrRuntimeArchitecture` provider in `acryl-control/src/architecture/projection.ts` and `provider.ts` to pass T011
- [ ] T013 Write failing lifecycle test in `acryl-control/tests/lifecycle.spec.ts`: enable/disable/reload receipt, protected-row rejection, settlement and rollback
- [ ] T014 Implement `acrPluginLifecycle` provider in `acryl-control/src/lifecycle/controller.ts` and `provider.ts` (Loader/Fiber authority, no stale reference across await) to pass T013
- [ ] T015 Write failing agent-control test in `acryl-control/tests/agent-control.spec.ts`: capability rejection, identity separation, cancellation, structured result
- [ ] T016 Implement `acrAgentControl` definition in `acryl-control/src/agent/agent-control.ts` with dsh-native, codex, claude, and acp providers in `acryl-control/src/agent/providers/`
- [ ] T017 Write failing leak test in `acryl-control/tests/leak.spec.ts`: 20 mount/unmount cycles return listeners, timers, sockets, processes, and registrations to baseline
- [ ] T018 Implement `acrControlProtocol` provider in `acryl-control/src/index.ts` (local endpoint, generation negotiation, capability set) with owned effect and connection disposal

**Checkpoint**: control plane boots headless, services provide and dispose cleanly, and all foundational tests pass.

## Phase 3: User Story 1 - Standalone ACRYL agent (P1)

**Goal**: `acryl` runs a persistent agent workspace in direct mode.

**Independent Test**: run `acryl --profile desktop`, submit a task, inspect trajectory/tools, exit, restart, resume.

- [ ] T019 [US1] Write failing CLI grammar test in `acryl-tui/tests/grammar.spec.ts`: `acryl`, `acryl tui`, `--profile`, `--json`
- [ ] T020 [US1] Implement `acryl-tui/src/cli/grammar.ts` and `src/bin.ts` argv parsing to pass T019
- [ ] T021 [US1] Implement direct-mode boot in `acryl-tui/src/host/direct.ts`: acquire lease, boot ACRYL composition, expose services
- [ ] T022 [US1] Write failing contributions test in `acryl-tui/tests/contributions.spec.ts`: screen/command/keybinding/status registration and removal on Fiber unload
- [ ] T023 [US1] Implement `TuiContribution` registry in `acryl-tui/src/render/contributions.ts` to pass T022
- [ ] T024 [US1] Implement OpenTUI renderer lifecycle in `acryl-tui/src/render/app.ts` (createCliRenderer, root renderable, resize/input/alternate-screen, disposal)
- [ ] T025 [US1] Implement agent workspace screens in `acryl-tui/src/render/screens/` (session list, resume/new, composer, transcript, tool cards, approvals, jobs)
- [ ] T026 [US1] Implement status region in `acryl-tui/src/render/status.ts` (mode, owner kind, profile, generation, model, health)
- [ ] T027 [US1] Write smoke test in `acryl-tui/tests/smoke.spec.ts` asserting direct-mode boot and session resume over durable `ctx.sessions`

**Checkpoint**: US1 independently usable as the standalone agent.

## Phase 4: User Story 3 - Attach to live profile owner (P1)

**Goal**: `acryl` attaches to a compatible live owner instead of starting a second writable runtime.

**Independent Test**: start GUI/Web, run `acryl`, confirm attached mode and no second owner.

- [ ] T028 [US3] Write failing attach test in `acryl-tui/tests/attach.spec.ts`: discovery, auth, generation mismatch rejection, owner loss
- [ ] T029 [US3] Implement transports in `acryl-tui/src/bridge/transport/` (socket, unix, named pipe, loopback HTTP)
- [ ] T030 [US3] Implement `acryl-tui/src/bridge/control-client.ts` and `src/host/attach.ts` to pass T028
- [ ] T031 [US3] Implement recovery mode in `acryl-tui/src/host/recovery.ts` (narrow diagnostic/repair commands, no competing owner)
- [ ] T032 [US3] Wire ownership discovery into the GUI/Web control plane via `acrControlProtocol` so attach targets are advertised

**Checkpoint**: US3 independently testable; single-writer invariant holds across hosts.

## Phase 5: User Story 2 - Three peer hosts (P1)

**Goal**: terminal, Electron, and Web are peer compositions; convenience launchers delegate.

- [ ] T033 [US2] Implement `acryl gui` and `acryl web` subcommands in `acryl-tui/src/cli/grammar.ts` and `src/bin.ts`
- [ ] T034 [US2] Add `acryl-gui` and `acryl-web` convenience executables delegating to the canonical commands
- [ ] T035 [US2] Add TUI-scoped presentation plugin rows to `acryl-control/cordis.patch.yml` so disabling the terminal plugin removes normal contributions but preserves recovery
- [ ] T036 [US2] Write peer-host test asserting host-specific contributions appear only on their host while domain state remains consistent

**Checkpoint**: US2 independently testable; `acryl`, `acryl-gui`, `acryl-web` all launch.

## Phase 6: User Story 4 - Inspect and maintain (P1)

**Goal**: full architecture and lifecycle control from the terminal surface.

- [ ] T037 [US4] Implement architecture screen in `acryl-tui/src/render/screens/` projecting `acrRuntimeArchitecture` (Fibers, services, effects, phases, protection)
- [ ] T038 [US4] Implement lifecycle screen in `acryl-tui/src/render/screens/` consuming `acrPluginLifecycle` (enable, disable, mount, unmount, reload)
- [ ] T039 [US4] Implement profile inspection screen in `acryl-tui/src/render/screens/`
- [ ] T040 [US4] Write screen test asserting protected rows reject mutation and admitted rows settle with receipts

**Checkpoint**: US4 independently testable; no manual profile-file editing needed.

## Phase 7: User Story 5 - Install, update, remove, recover (P1)

**Goal**: Market and package operations with preview, approval, restart class, and rollback.

- [ ] T041 [US5] Implement preview/execute control in `acryl-control` over existing Market install/remove services with candidate digest verification
- [ ] T042 [US5] Implement install/update/remove screens in `acryl-tui/src/render/screens/` with preview and approval flow
- [ ] T043 [US5] Implement candidate promotion (`PluginCandidate` states, HOT/WARM/COLD, health, rollback) in `acryl-control/src/`
- [ ] T044 [US5] Write promotion test asserting failed activation leaves the previous valid composition or an explicit recoverable state

**Checkpoint**: US5 independently testable.

## Phase 8: User Story 6 - Interchangeable agent orchestration (P1)

**Goal**: built-in agent plus Codex/Claude/Gemini/OpenCode/local delegation at one provider seam.

- [ ] T045 [US6] Wire built-in Harness agent into the TUI via `ctx.agents`/`ctx.agentLoop` with durable session projection
- [ ] T046 [US6] Compose existing Codex and Claude providers and expose delegation in the agent workspace
- [ ] T047 [US6] Add Gemini, OpenCode, and local runtime providers at the same seam with truthful capability declarations
- [ ] T048 [US6] Implement agent catalog and handoff controls in `acryl-tui/src/render/screens/`
- [ ] T049 [US6] Write provider test covering capability rejection, cancellation, disposal, and structured-result acceptance

**Checkpoint**: US6 independently testable.

## Phase 9: User Story 7 - Non-interactive automation (P2)

**Goal**: deterministic script commands with protocol-pure stdout and stable exit codes.

- [ ] T050 [US7] Implement canonical JSON envelope and exit classes in `acryl-tui/src/cli/output.ts`
- [ ] T051 [US7] Implement non-interactive commands in `acryl-tui/src/cli/noninteractive.ts` (profile/plugin/architecture/agent query paths)
- [ ] T052 [US7] Write output-contract test asserting stdout purity, stderr diagnostics, and documented exit codes

**Checkpoint**: US7 independently testable.

## Phase 10: Polish & Cross-Cutting

- [ ] T053 [P] Update `docs/DEVELOPMENT-LOG.md` with implementation and verification commit hashes
- [ ] T054 [P] Update `docs/acryl/` and orientation/concept references to describe three peer hosts and the `acryl` command
- [ ] T055 Run `quickstart.md` end-to-end validation
- [ ] T056 Run full `corepack yarn check`, bilingual/architecture/layout gates, and headless Loader/profile smokes; fix any regression

## Dependencies & Execution Order

- Phase 1 → Phase 2 → (Phase 3, Phase 4 in sequence) → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10.
- Phases 3 and 4 build the two launch modes and are sequenced because attach discovery reuses the direct-mode host spine.
- Phase 6, 7, 8 depend on the Phase 2 control services and may be staffed in parallel once Phase 5 is done, but priority order is P1 sequence above.
- `[P]` tasks inside a phase touch different files and can run in parallel.

## Parallel Example: Phase 2 contracts

```bash
Task: "T004 define control-protocol types in acryl-control/src/contracts/control-protocol.ts"
Task: "T005 define ownership types in acryl-control/src/contracts/ownership.ts"
Task: "T006 define operation types in acryl-control/src/contracts/operations.ts"
Task: "T007 declare typed events in acryl-control/src/events.ts"
```

## Implementation Strategy

1. Deliver Phases 1-2 (foundation), keeping `corepack yarn check` green.
2. Deliver Phase 3 (US1 standalone agent) as the MVP; stop and validate.
3. Add Phase 4 (attach) then Phase 5 (peer hosts), validating each independently.
4. Add Phases 6-8 (control, install, orchestration) then Phase 9 (automation).
5. Finish with Phase 10 polish and full gate.

Each task or logical group ends with a commit. Write failing tests before implementation, verify they fail, implement, verify pass, and confirm disposal/leak behavior for every service and provider.
