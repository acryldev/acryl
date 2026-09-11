# Tasks: Interchangeable Harness Engine (DSH and pi)

> **Architecture correction, 2026-09-09:** T004 onward must use the persistent
> `acryl-harness-runtime` engine host and its stable `acryl-engine` Loader row.
> `dsh-cordis` and the later `pi-cordis` are provider entries beneath it. Do
> not add a Cordis root per provider. The initial host lifecycle proof is
> `acryl-harness-runtime/src/engine-host.ts` and its Loader/provider-swap test.

> **Finding, 2026-09-11 (not yet reflected in the task numbering below):** a
> working, tested `pi-cordis` provider already exists in the sibling
> `acryldev/pi-cordis` repo, built the exact shape this correction describes
> (one Cordis tree, `ctx.piEngine`, no root per provider, no Chord). See
> `research.md` Decision 2's amendment for the full FR-by-FR gap assessment
> and what it does/doesn't cover. The T030+ "pi provider" tasks likely become
> "adopt `pi-cordis`" rather than "author a pi provider from scratch" - left
> unrenumbered pending a decision on the adoption mechanism (git submodule,
> published npm dependency, or pnpm workspace path).

**Feature**: `specs/028-harness-engine-swap` | **Milestone**: M9
**Input**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[research-pi-spike.md](./research-pi-spike.md), [data-model.md](./data-model.md),
[contracts/engine-runtime.md](./contracts/engine-runtime.md), [quickstart.md](./quickstart.md)

**Tests**: included - the constitution's Cordis completion bar and the
methodology's RED-GREEN-REFACTOR are mandatory for lifecycle/behavior work.

**Work rules**: directly on `main`, focused commits, `corepack pnpm` only,
headless-safe gates, explicit `git add` paths. After each implementation commit,
add a `docs/DEVELOPMENT-LOG.md` checkpoint in a separate docs commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: `[US1]`/`[US2]`/`[US3]`; Setup/Foundational/Polish carry no label

## Path conventions

Multi-package workspace. Primary packages: `acryl-harness-runtime/`,
`acryl-control/`, `acryl-cli/`. No new package (see plan.md Structure Decision;
the `pi` optional-dep / `acryl-engine-pi` split is decided in T030).

---

## Phase 1: Setup

**Purpose**: pin dependencies and guardrails before any engine code.

- [ ] T001 Add exact-pinned `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` at the latest published `0.85.x` to `acryl-harness-runtime/package.json` as **optionalDependencies** (`corepack pnpm add -E -O ...`), then `corepack pnpm install`. Keep this commit separate from any `deepseek-harness/` pin change. Proof: `corepack pnpm ls @earendil-works/pi-coding-agent` resolves.
- [ ] T002 [P] Add a forbidden-import lint rule (repo's existing ESLint/biome config for `acryl-harness-runtime`) banning `@earendil-works/pi-coding-agent/**/experimental/*` and `@earendil-works/pi-agent-core/harness/*` in `acryl-harness-runtime/src/**`. Proof: a temp file importing either path fails `corepack pnpm run lint`.
- [ ] T003 [P] Record the pi provenance (`v0.85.x`, MIT, npm packages consumed, forbidden-import rules, why) in `docs/acryl/pi-engine-provenance.md` and link it from `UPSTREAMS.md`. Mirrors the DSH provenance convention.

---

## Phase 2: Foundational - engine seam + `dsh` adapter + TUI re-point ("M2-slice-alpha")

**Purpose**: the engine-neutral boundary. **Blocks every user story.** No
behavior change: default `dsh` path stays identical (SC-004).

**⚠️ No US work begins until this phase's checkpoint passes.**

### Contract + registry

- [ ] T004 First resolve type ownership / package dependency direction: `AcrylEngineName` is consumed by both `acryl-harness-runtime` and `acryl-control` (T008/T009). Check the existing dependency arrow between the two packages; place `AcrylEngineName` (and only that leaf type, if needed) in whichever package is the lower-level dependency so no cycle is introduced. Record the choice in a one-line comment. Then create `acryl-harness-runtime/src/engine/engine.ts`: `AcrylRuntimeMarker` (+ `declare module '@deepseek-ai/cordis'` for `ctx.runtime`), `AcrylEngineHandle`, `AcrylEngineStartOptions`, `AcrylEngineAdapter` (with `fidelity`), `AcrylEngineError` + `AcrylEngineErrorCode`, per [contracts/engine-runtime.md](./contracts/engine-runtime.md). Types only. Proof: `corepack pnpm run typecheck` + no new cross-package cycle (`corepack pnpm run check`).
- [ ] T005 Create `acryl-harness-runtime/src/engine/registry.ts`: `registerAcrylEngineAdapter(owner, adapter)` (effect-owned, deregisters on unload, throws on duplicate name) and `resolveAcrylEngineAdapter(name)` (throws `AcrylEngineError('unknown-engine', ...)` naming valid engines). Guarantee G1. Proof: T006.
- [ ] T006 [P] Write `acryl-harness-runtime/tests/engine-registry.spec.ts`: register/resolve; duplicate-name throws; unknown-name throws before any boot and lists valid names; deregistration on owner-fiber unload. RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.

### Engine-neutral readiness/session client check

- [ ] T007 Audit `acryl-harness-runtime/src/durable-message.ts` + `session-bridge.ts` for DSH-only fields in `DurableSessionMessage` / the session projection; document findings in `research.md` and, if any leak, tighten the types to engine-neutral. Proof: type diff + `corepack pnpm run typecheck`; note in `research.md`.
- [ ] T008 In `acryl-control/src/contracts/session.ts` confirm `AcrylSessionClient` / `AcrylSessionSnapshot` carry no engine-specific fields; add `authoringEngine: AcrylEngineName` to `AcrylTranscriptItem` (per data-model.md, for FR-007 fidelity notes) with a boundary-validator update in `parseAcrylSessionSnapshot`. Proof: `corepack pnpm --filter acryl-control test`.
- [ ] T009 [P] Create `acryl-control/src/runtime.ts`: re-export `AcrylEngineName` / `AcrylRuntimeMarker` typing for surfaces; add to `acryl-control/src/index.ts` barrel. Proof: `corepack pnpm run typecheck`.

### `dsh` adapter (behavior-preserving)

- [ ] T010 Create `acryl-harness-runtime/src/engine/adapter-dsh.ts`: `AcrylEngineAdapter` named `'dsh'`, `fidelity` asserting `hmr:true, sandbox:true, approvals:true`. `start()` wraps `bootAcrylHarnessProfile` + `createAcrylSessionBridge`, registers the `ctx.runtime` marker (`{engine:'dsh'}`) as an effect, and returns an `AcrylEngineHandle` whose `sessions` is the existing bridge projection and `readiness` is engine-neutral (not the raw `ctx.get('sessions')` probe). One owning `ctx.effect()` tree with an ordered LIFO disposer (plan §3). Proof: T012.
- [ ] T011 Wire the `dsh` adapter into `bootAcrylHarnessProfile` / a new `acryl-harness-runtime/src/engine/index.ts` export surface, and export the engine seam from `acryl-harness-runtime/src/index.ts`. Proof: `corepack pnpm run typecheck`.
- [ ] T012 Write `acryl-harness-runtime/tests/engine-dsh-adapter.spec.ts`: real Loader activation of the `dsh` adapter; `ctx.runtime.engine === 'dsh'`; a prompt round-trips through `handle.sessions`; a second `adapter.start()` while one handle is live throws `AcrylEngineError('engine-collision')` (guarantee G4 / FR-009); `handle.dispose()` releases every owned resource with no leak / no duplicate registration; repeated start/dispose is clean. RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.

### Re-point `acryl-cli` off the direct bootstrap

- [ ] T013 [US-none] Rewrite `acryl-cli/src/host/direct.ts` to resolve the engine by name via `resolveAcrylEngineAdapter` + `adapter.start({ profile })` and return the `AcrylEngineHandle`; drop the direct `bootAcrylHarnessProfile` import and the `ctx.get('sessions')`/`ctx.get('agents')` probe (use `handle.readiness`). Proof: T016 + grep.
- [ ] T014 Update `acryl-cli/src/cli/run.ts`: `AcrylCliDependencies.startDirectHost` becomes engine-resolving; default engine `'dsh'`; help text unchanged this phase. Proof: `corepack pnpm --filter acryl-cli test`.
- [ ] T015 Update `acryl-cli/src/tui-app/session.ts` to consume `handle.sessions` (`AcrylSessionClient`) instead of importing `createAcrylSessionBridge` directly. Proof: grep clean + `corepack pnpm --filter acryl-cli test`.
- [ ] T016 Update/extend `acryl-cli/tests/` so the existing TUI session/host tests pass against the seam; add an assertion that `acryl-cli/src/**` no longer imports `bootAcrylHarnessProfile`, `createAcrylSessionBridge`, or `startDirectHost` internals (guarantee G6). Proof: `corepack pnpm --filter acryl-cli test`.

### Phase 2 checkpoint

- [ ] T017 Run `corepack pnpm run verify` then `corepack pnpm run check`. Manually run `corepack pnpm acryl tui --profile acryl` and confirm prompt/stream/cancel/exit behave exactly as before (SC-004). Commit Phase 2; add the `docs/DEVELOPMENT-LOG.md` checkpoint (separate commit) noting M9 Phase A / M2-slice-alpha landed with the canonical hash.

**Checkpoint**: engine boundary exists; `dsh` unchanged. User stories can begin.

---

## Phase 3: User Story 1 - Run a prompt end-to-end on the pi engine (Priority: P1) 🎯 MVP

**Goal**: `acryl tui --engine pi` runs a prompt through pi; prior DSH room state
visible; clean disposal, one runtime owner.

**Independent test**: [quickstart.md](./quickstart.md) "Phase B1" + cross-resume
scenarios (SC-001, SC-002, SC-003, SC-006, SC-008).

### B1 design tasks (close remaining research)

- [ ] T018 [US1] Design the pi credential path: reconcile `@earendil-works/pi-ai` OAuth / credential store with the ACRYL login seam from `specs/024-acryl-cli-login`. Write the decision into `research.md`. Proof: decision recorded; no code.
- [ ] T019 [US1] Design the approval bridge: map pi `ToolCallEvent` / `BeforeAgentStartEvent` interception to the Cordis `ctx.approval` seam DSH uses. Write into `research.md`. Proof: decision recorded.
- [ ] T020 [US1] Design the `SessionEntry` <-> `DurableSessionMessage` translation (both directions, incl. `authoringEngine` tagging and the FR-007 fidelity-limitation note). Write into `data-model.md`. Proof: mapping table recorded.

### pi adapter

- [ ] T021 [US1] Create `acryl-harness-runtime/src/engine/adapter-pi.ts`: `AcrylEngineAdapter` named `'pi'`. `start()` calls `createAgentSessionRuntime({ cwd, model, sessionManager, tools })` (pi SDK) inside the adapter's owned Cordis effect tree; registers `ctx.runtime` marker `{engine:'pi'}`. `fidelity` asserts hmr/sandbox/approvals per T019/HMR design; if it cannot, `start()` throws `fidelity-rejected` (G5). Proof: T026.
- [ ] T022 [US1] Implement the `AcrylEngineHandle.sessions` for pi in `adapter-pi.ts`: `submitPrompt` -> `agentSession.prompt(text, { signal })`; `cancel` -> abort the owned `AbortController`; `subscribe` -> map `AgentSessionEvent` -> `AcrylSessionSnapshot`. Proof: T026.
- [ ] T023 [US1] Implement the canonical-record write in `adapter-pi.ts`: translate pi `SessionEntry` / events -> `DurableSessionMessage` on the ACRYL port (per T020), tagged `authoringEngine: 'pi'`. Proof: T027.
- [ ] T024 [US1] Implement cross-engine resume in `adapter-pi.ts`: on `start({ resumeSessionId })`, read prior `DurableSessionMessage`s, translate to pi `SessionEntry[]` via `SessionManager` / `sessionEntryToContextMessages`, seed the pi session; surface a one-line documented limitation where a DSH-authored turn cannot be faithfully represented (FR-007). Proof: T027.
- [ ] T025 [US1] Register the `pi` adapter through the engine registry; `resolveAcrylEngineAdapter('pi')` throws a clear "pi engine not installed" error when the optional dep is absent (research-pi-spike §5). Proof: T026.

### US1 tests

- [ ] T026 [US1] Write `acryl-harness-runtime/tests/engine-pi-adapter.spec.ts`: Loader activation of the `pi` adapter (with pi optional dep present); `ctx.runtime.engine === 'pi'`; a stubbed/faux-provider prompt round-trips through `handle.sessions`; `fidelity-rejected` when a stub adapter under-declares; `dispose()` leak-free + cancellation of an in-flight prompt; missing-optional-dep error path; assert `@earendil-works/chord` is absent from the adapter's active `require`/`import` graph after activation (FR-013). Use pi's faux provider (no real keys). RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T027 [US1] Write `acryl-harness-runtime/tests/engine-cross-resume.spec.ts`: write a session with the `dsh` adapter, dispose; `start` the `pi` adapter with `--resume <sessionId>`; prior turn renders from the canonical `DurableSessionMessage` stream; a new pi turn appends to the same `sessionId`; fidelity-limitation note present where expected (SC-006). Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T028 [US1] Add `acryl-harness-runtime/tests/engine-contracts.spec.ts` (or extend an existing suite): the HMR/sandbox/approval contract tests the `dsh` adapter passes are run against the `pi` adapter (SC-008). Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T028b [P] [US1] Add an automated room/artifact-invariance assertion (in `engine-cross-resume.spec.ts` or a sibling): capture a snapshot/checksum of the room event stream and `.allagent`/task artifacts before a `pi`-engine episode, run a full `pi` turn, and assert the pre-existing room + task artifacts are byte-identical afterward - only the canonical session stream grew (FR-008, SC-002). RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.

### US1 wiring + measurement

- [ ] T029 [US1] Add a temporary `--engine <name>` pass-through in `acryl-cli/src/cli/run.ts` + `host/direct.ts` (full grammar lands in US2) so US1 can be exercised: `acryl tui --engine pi`. Proof: manual quickstart B1 scenario.
- [ ] T030 [US1] Measure the `acryl` CLI publish-closure size with pi as an optionalDependency vs. extracted into a separate `acryl-engine-pi` package; decide and record in `research-pi-spike.md` §5; if a separate package is needed, create it and move `adapter-pi.ts` into it. Proof: size numbers vs `specs/025` limits recorded.
- [ ] T031 [US1] Run `corepack pnpm run verify` + `corepack pnpm run check`; run quickstart B1 + cross-resume scenarios manually against a real authed profile (SC-001, SC-002, SC-003). Commit US1; add `docs/DEVELOPMENT-LOG.md` checkpoint (separate commit).

**Checkpoint**: US1 independently demonstrable - `acryl tui --engine pi` works, DSH state visible, clean teardown.

---

## Phase 4: User Story 2 - Choose the engine per launch and per profile (Priority: P2)

**Goal**: `acryl-engine` Loader row + `--engine` launch override; `dsh` default;
loud pre-boot failure on unknown name.

**Independent test**: [quickstart.md](./quickstart.md) "Phase B2" (SC-005).

- [ ] T032 [US2] Add the `acryl-engine` Loader row plugin: `acryl-harness-runtime/src/engine/plugin-acryl-engine.ts` with stable name `'acryl-engine'`, sync StandardSchema config `{ engine: enum('dsh','pi') = 'dsh' }` (cheatsheet §4.1), which mounts `resolveAcrylEngineAdapter(config.engine)`. Proof: T035.
- [ ] T033 [US2] Compose the `acryl-engine` row into the profile patch set in `bootAcrylHarnessProfile` (default `dsh`, so absent config reproduces today). Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T034 [US2] Implement the `--engine <name>` launch override: parse it in `acryl-cli/src/cli/grammar.ts`; in `bootAcrylHarnessProfile` patch the composed `acryl-engine` entry's `engine` value **before `boot()`** for this launch only (no row-file rewrite, FR-004); unknown name throws `AcrylEngineError('unknown-engine')` -> `AcrylExitClass = 'usage'` before any runtime boot (FR-005). Proof: T035, T036.
- [ ] T035 [US2] Write `acryl-harness-runtime/tests/engine-select.spec.ts`: no config -> `dsh`; row `pi` -> `pi`; `--engine dsh` over row `pi` -> `dsh` and row file unchanged; `--engine bogus` -> throws before boot with a message naming the invalid value + valid engines. RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T036 [US2] Write `acryl-cli/tests/engine-cli.spec.ts`: `parseAcrylArgs` handles `--engine`; the CLI exits `usage` on an unknown engine without booting. Proof: `corepack pnpm --filter acryl-cli test`.
- [ ] T037 [US2] Update `acryl-cli` help text in `cli/run.ts` for `--engine <name>`. Proof: snapshot/`--help` output.
- [ ] T038 [US2] `corepack pnpm run verify` + `check`; quickstart B2 manual run. Commit US2 + `docs/DEVELOPMENT-LOG.md` checkpoint.

**Checkpoint**: engine selectable by row + flag; invalid input fails loud and early.

---

## Phase 5: User Story 3 - Hot-swap the engine mid-project (Priority: P3)

**Goal**: edit the `acryl-engine` row + `/reload` swaps the engine HOT; ordered
disposal; PENDING -> reactivation; in-flight cancellation; transactional rollback.

**Independent test**: [quickstart.md](./quickstart.md) "Phase B3" (SC-007).

- [ ] T039 [US3] Ensure the engine adapter fiber owns **every** engine resource in one effect tree so HMR unload runs a complete ordered disposer (plan §3); add an explicit in-flight-turn `AbortController` guard whose disposer aborts and awaits quiescence before the engine root disposes. Proof: T042.
- [ ] T040 [US3] Add the `engine.select` / `engine.swap` `ControlOperation` kinds + `restartClass: 'HOT'` to `acryl-control/src/contracts/operations.ts`; emit an `engine.swap` event (`{ from, to, operationId }`, `emit` dispatch, no veto) from the `acryl-engine` plugin on config change. Proof: T043.
- [ ] T041 [US3] Confirm `/reload` (HMR transactional apply) on the `acryl-engine` row: old adapter fiber disposed -> new adapter activated -> `AcrylEngine` consumers ride PENDING -> reactivate keyed on service availability; on new-engine activation failure, HMR restores the prior composition and the `ControlOperation` ends `RECOVERABLE`. Wire any missing glue in `plugin-acryl-engine.ts`. Proof: T042.
- [ ] T042 [US3] Write `acryl-harness-runtime/tests/engine-swap.spec.ts`: start `dsh`, run a turn, change row to `pi`, `/reload`; assert ordered disposal of `dsh` resources, no duplicate registration, consumers went PENDING then reactivated against `pi`, `ctx.runtime.engine === 'pi'`; in-flight turn cancelled first; swap back and forth N times with no leak growth; forced `pi` activation failure rolls back to healthy `dsh`. RED first. Proof: `corepack pnpm --filter acryl-harness-runtime test`.
- [ ] T043 [US3] Write `acryl-control/tests/engine-operation.spec.ts`: the `engine.swap` `ControlOperation` transitions `CREATED -> ... -> SUCCEEDED` on success and `-> RECOVERABLE` on rollback; the `engine.swap` event fires once per swap with correct `{from,to}`. Proof: `corepack pnpm --filter acryl-control test`.
- [ ] T044 [US3] `corepack pnpm run verify` + `check`; quickstart B3 manual run (edit row, `/reload`, observe swap without process restart). Commit US3 + `docs/DEVELOPMENT-LOG.md` checkpoint.

**Checkpoint**: HOT engine swap works with full disposal, reactivation, rollback.

---

## Phase 6: Polish & cross-cutting

- [ ] T045 [P] Run `/speckit-analyze` then `/speckit-converge` on this ledger; append any specified-but-unbuilt work to this file. Proof: converge output attached to `evidence/`.
- [ ] T046 [P] Fill `specs/028-harness-engine-swap/evidence/` with the RED/GREEN/gate command output per the methodology §19.5 template for T012, T026, T027, T035, T042.
- [ ] T047 [P] Update `docs/ACRYL-ROADMAP.md` M9 exit-criterion checkboxes and the M2 footnote to reflect delivered state; update `docs/onboarding/new-agent-onboarding-prompt.md` release/milestone line if the milestone is complete.
- [ ] T048 [P] Update the `checklists/requirements.md` notes and mark the ledger state (Completed / partial) with acceptance-evidence links.
- [ ] T049 Add a Wayfinder candidate ticket `specs/000-wayfinding/issues/05-cordis-chord-interop.md` (post-M9) per `research-pi-spike.md` §3 strategic note.

---

## Dependencies

```text
Phase 1 (T001-T003)
   └─> Phase 2 / Foundational (T004-T017)      [BLOCKS all user stories]
          ├─> Phase 3 / US1 (T018-T031)        MVP
          │       └─> Phase 4 / US2 (T032-T038)   (needs the pi adapter to select)
          │               └─> Phase 5 / US3 (T039-T044)   (needs selection to swap)
          └─> Phase 6 / Polish (T045-T049)     (after the stories it evidences)
```

- US2 depends on US1 (a second engine must exist to select).
- US3 depends on US2 (selection is the swap mechanism).
- Within Phase 2: T004 -> T005 -> T006; T007/T008/T009 parallel; T010 -> T011 -> T012; T013-T016 after T011.
- Within US1: T018/T019/T020 (design) before T021-T024; T021 -> T022 -> T023 -> T024; T026/T027/T028 after their impl; T030 can run parallel once T025 lands.

## Parallel opportunities

- Phase 1: T002, T003 in parallel with T001 done.
- Phase 2: T006 ∥ (T007, T008, T009); test files are independent of each other.
- US1 design: T018 ∥ T019 ∥ T020.
- Polish: T045-T049 largely parallel.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That delivers `acryl tui --engine pi`
end-to-end with DSH continuity and clean teardown - the walking skeleton and the
M9 exit criterion's core. US2 (selection ergonomics) and US3 (HOT-swap) are
incremental deliveries on top, each its own checkpoint commit.

Phase 2 must ship with SC-004 proven (default `dsh` unchanged) before US1 starts.
