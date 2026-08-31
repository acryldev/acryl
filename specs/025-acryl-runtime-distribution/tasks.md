# Tasks: ACRYL Runtime and Distribution Milestone

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, and `contracts/` in this directory.

**Tests**: Required. Every production behavior change follows red-green-refactor and proves the intended artifact, lifecycle, or transport outcome before replacing existing behavior.

## Phase 1: Baseline and shared safeguards

- [ ] T001 Record fresh v0.1.17 comparable CLI and Desktop artifact inventories in `specs/025-acryl-runtime-distribution/evidence/` without modifying release artifacts.
- [ ] T002 [P] Add failing artifact-manifest unit tests in `scripts/inspect-artifact.test.mjs` for foreign native packages, forbidden release files, missing required files, and byte-budget failures.
- [ ] T003 Implement the manifest parser and artifact inspector in `scripts/inspect-artifact.mjs` with exact offending-path diagnostics.
- [ ] T004 [P] Add failing CLI payload verification tests in `scripts/verify-cli-archive-payload.test.mjs` for archive extraction and target native validation.
- [ ] T005 Implement `scripts/verify-cli-archive-payload.mjs` and add it to `.github/workflows/release.yml` before upload.
- [ ] T006 [P] Add regression tests in `acryl-tui/tests/cli-run.spec.ts` covering `--version`, `tui --json`, and Web command dispatch while preserving the v0.1.17 authorization flow tests.
- [ ] T007 Run the Phase 1 baseline gate from `quickstart.md` and commit the safeguard/evidence checkpoint.

## Phase 2: User Story 1 - Lean target-specific terminal distribution (Priority: P1)

**Goal**: Ship a portable terminal archive that has only target runtime assets and proves no-host-Node behavior.

**Independent Test**: Build a target archive, verify its manifest, execute `--version` and `tui --json` with `PATH=/usr/bin:/bin`, and confirm the authorization/session test suite remains green.

- [x] T008 [P] [US1] Add failing platform-native selection tests in `scripts/prune-target-native.test.mjs` for target-qualified native package and prebuild paths.
- [x] T009 [US1] Implement target-aware optional native dependency pruning in `scripts/build-cli-archive.mjs` without removing target `node-pty`, ripgrep, Sharp/libvips, Koffi, or required loader files.
- [x] T010 [P] [US1] Add failing release-file pruning tests in `scripts/prune-release-payload.test.mjs` for source maps and retained runtime/license assets; declarations, tests, and docs remain gated by a later explicit allowlist.
- [x] T011 [US1] Implement CLI source-map pruning in `scripts/prune-release-payload.mjs` and invoke it after dependency layout materialization.
- [ ] T012 [US1] Remove the CLI publication library export only if `import 'acryl'` has no supported consumer; otherwise document and retain the API in `acryl-tui/package.json` and `acryl-tui/README.md`.
- [ ] T013 [US1] Update `scripts/build-cli-archive.mjs`, `.github/workflows/release.yml`, and `scripts/verify-npm-entrypoint.mjs` so archives and npm publication use explicit release manifests rather than an unchecked maximal closure.
- [ ] T014 [US1] Run all target-native/payload tests, build one local archive, run no-host-Node smoke, compare its measured size to baseline, and commit the CLI reduction checkpoint.

## Phase 3: User Story 1 - Lean Desktop distribution (Priority: P1)

**Goal**: Remove foreign native files, unnecessary release maps/files, and unsupported Electron locales without changing Desktop behavior.

**Independent Test**: Package a comparable local Desktop target, mount/inspect it, pass native/path manifests and current Desktop closure tests.

- [ ] T015 [P] [US1] Add failing package verification cases in `acryl-desktop/tests/verify-packaged-runtime.spec.ts` for foreign native payloads, forbidden maps, and unsupported Electron locales.
- [ ] T016 [US1] Add target-specific native package staging/pruning in `acryl-desktop/scripts/` and connect it to each Electron Builder target.
- [ ] T017 [US1] Narrow `acryl-desktop/package.json` `asarUnpack` and Desktop package `files` rules using a runtime allowlist, retaining module-resolution, native executable, and license requirements.
- [ ] T018 [US1] Configure release-only source-map exclusion and supported `electronLanguages` in `acryl-desktop/package.json`; preserve development maps and supported English/Chinese UI behavior.
- [ ] T019 [US1] Run `corepack pnpm --filter acryl-desktop run check:mac-package`, build a comparable local DMG, verify it, record size evidence, and commit the Desktop reduction checkpoint.

## Phase 4: Foundational capability boundaries

- [ ] T020 [P] Add failing capability composition tests in `acryl-harness-runtime/tests/capabilities.spec.ts` for required dependencies, optional absence, provider removal, and disposal.
- [ ] T021 Define `RuntimeCapability`, runtime composition selection, and typed errors in `acryl-harness-runtime/src/capabilities/` according to `data-model.md`.
- [ ] T022 Extract common profile loading, patch assembly, boot, and idempotent disposal into `acryl-harness-runtime/src/composition.ts` with a compatibility wrapper from `src/index.ts`.
- [ ] T023 Update `acryl-harness-runtime/tests/profile.spec.ts` to prove existing terminal profile behavior, HMR guard behavior, and v0.1.17 authorization rows remain unchanged through the shared composition API.
- [ ] T024 Run runtime package checks and commit the shared-composition foundation checkpoint.

## Phase 5: User Story 2 - Optional Web and plugin-management capabilities (Priority: P2)

**Goal**: Make terminal core independent of Web UI and package-management closure while retaining opt-in Web and Desktop installation behavior.

**Independent Test**: Terminal-only closure passes session/auth smoke without Web or package-management capabilities; each optional capability can be installed, activated, and disposed independently.

- [ ] T025 [P] [US2] Add failing terminal-core closure tests in `scripts/runtime-closure.test.mjs` asserting Web, Market, Canvas, and PNPM capability packages are absent.
- [ ] T026 [US2] Split Web boot from `acryl-harness-runtime/src/index.ts` into a Web capability entry module and make `acryl-tui/src/cli/run.ts` lazy-load it only for `acryl web`.
- [ ] T027 [P] [US2] Add failing plugin-management ownership tests in `acryl-harness-runtime/tests/plugin-management.spec.ts` proving terminal boot cannot invoke package-manager operations and Desktop adapter operations remain available when the capability is active.
- [ ] T028 [US2] Extract PNPM/package installation ownership into the plugin-management capability; adapt `acryl-desktop/src/desktop-runtime-environment.ts`, `profile-materializer.ts`, and Market integration through typed injection.
- [ ] T029 [US2] Move Canvas and Market composition from the terminal core closure into their declared capability bundles, retaining their current Desktop Loader rows and recovery behavior.
- [ ] T030 [US2] Add explicit missing-capability guidance for `acryl web` and future `acryl plugins` commands in `acryl-tui/src/cli/run.ts` and associated CLI tests.
- [ ] T031 [US2] Update archive/npm assembly scripts to derive terminal dependencies from explicit core/TUI profile ownership; run terminal-only session/auth smoke plus optional Web/Desktop capability smoke and commit the capability split checkpoint.

## Phase 6: User Story 3 - Shared composition and session façade (Priority: P3)

**Goal**: Make direct, Web, and Desktop surfaces use shared profile composition and a surface-neutral session client contract.

**Independent Test**: A fixture session has equivalent durable event/output semantics through direct and remote client transports; Desktop recovery tests remain green.

- [ ] T032 [P] [US3] Add contract tests in `acryl-control/tests/session-client.spec.ts` for open, event replay, subscription, prompt, cancellation, error, and disposal semantics.
- [ ] T033 [US3] Export the surface-neutral session client contract from `acryl-control` and adapt `acryl-harness-runtime/src/session-bridge.ts` as the direct transport implementation.
- [ ] T034 [P] [US3] Add failing shared boot tests in `acryl-harness-runtime/tests/composition.spec.ts` and `acryl-desktop/tests/profile.spec.ts` covering profile/patch ordering, root disposal, and Desktop-owned preparation.
- [ ] T035 [US3] Replace duplicated Desktop common boot steps with `bootAcrylRuntime()` while preserving Electron recovery, diagnostics, updater, native services, and profile checkpoints in `acryl-desktop/src/main.ts` and Desktop-specific modules.
- [ ] T036 [US3] Implement a Web/API session-client transport behind the same contract and update Web-facing client adapters without exposing a raw Cordis context.
- [ ] T037 [US3] Move shared profile/plugin inventory/lifecycle operations behind Cordis services and convert TUI/Desktop/Web projections to consume those services.
- [ ] T038 [US3] Run direct/Web/Desktop fixture parity, lifecycle replacement, and Desktop recovery verification; remove only proven-dead duplicated boot paths and commit the surface-parity checkpoint.

## Phase 7: User Story 4 - Explicit attachable local runtime (Priority: P4)

**Goal**: Add an opt-in loopback runtime that supported surfaces can attach to without replacing current direct launch defaults.

**Independent Test**: Start a fixture runtime, attach/detach two supported clients, preserve a durable session, reject incompatible clients, and prove complete shutdown.

- [ ] T039 [P] [US4] Add endpoint state and compatibility tests in `acryl-control/tests/runtime-endpoint.spec.ts` for loopback validation, stale metadata, token references, and version mismatch.
- [ ] T040 [US4] Define runtime endpoint records and authenticated protocol contracts in `acryl-control/src/` without storing bearer secrets in project files.
- [ ] T041 [P] [US4] Add failing Cordis lifecycle tests in `acryl-harness-runtime/tests/local-runtime.spec.ts` for start, duplicate start, attach, detach, graceful stop, and owned-resource cleanup.
- [ ] T042 [US4] Implement a loopback-only local runtime capability with one owner, endpoint lifecycle, session-client transport, ordered disposers, and durable session preservation.
- [ ] T043 [US4] Add `acryl serve` and `acryl attach` command grammar/dispatch/tests in `acryl-tui/src/cli/` while preserving direct `acryl tui` defaults.
- [ ] T044 [US4] Add Web attach behavior through the Web capability and Desktop start/attach behavior only after current Desktop startup/recovery tests prove compatibility.
- [ ] T045 [US4] Run attach/detach, stale record, incompatibility, multi-client, signal shutdown, and leak tests; document server policy and commit the explicit-local-runtime checkpoint.

## Phase 8: Release, documentation, and retirement

- [ ] T046 [P] Update `docs/RELEASE-FOUNDATION-HANDOFF.md`, `README.md`, `README.en.md`, and `README.zh.md` with the actual supported distribution channels and optional capability behavior.
- [ ] T047 Update `docs/DEVELOPMENT-LOG.md` in a documentation-only checkpoint for each implementation commit using canonical commit hashes.
- [ ] T048 Run `corepack pnpm run check`, target package checks, artifact manifest checks, portable archive smoke, Desktop package verification, and the complete quickstart validation before authorizing a release.
- [ ] T049 Reconcile this milestone's evidence and mark only completed tasks as complete; add newly discovered work to this same `tasks.md` rather than creating another feature folder.

## Dependencies & Execution Order

- T001-T007 establish baselines and block payload removals.
- T008-T019 are Phase 1 payload work and complete before dependency ownership changes.
- T020-T024 establish shared composition before optional capability splitting.
- T025-T031 complete core/optional closure separation before surface façade work.
- T032-T038 complete shared composition/session parity before local runtime work.
- T039-T045 are strictly gated on passing phase 1-3 artifacts and lifecycle checks.
- T046-T049 close each shipped increment and the full milestone.

## Parallel Opportunities

- T002/T004/T006 can proceed independently after baseline collection.
- T008/T010 and T015 can proceed independently after artifact manifest rules exist.
- T020 and documentation of current capability dependencies can proceed alongside Desktop payload work.
- T032 and T034 can proceed in parallel after the common composition API is stable.
- T039 and T041 can proceed in parallel after the session façade passes parity tests.

## Implementation Strategy

1. Complete and release payload safety plus measurable size reductions first.
2. Split dependency ownership while retaining compatibility wrappers.
3. Consolidate runtime composition and surface contracts with parity tests.
4. Add the local runtime only as an explicit new operating mode.
5. Release only after all target artifact and runtime gates pass.
