# Tasks: ACRYL Agent, Plugin, Registry, and Blend Ecosystem

**Status**: Planned. Do not implement until the prerequisite repair gate is complete.

## Prerequisite gate

- [ ] P001 Repair 019 owner-or-attach defects: cross-process exclusive ownership, concurrent acquisition reservation, ordered release, generation identity, active-control lease, and no bypass boot path.
- [ ] P002 Add tests for the repaired owner/attach protocol, lease loss, read-only attached clients, and race/restart behavior; pass independent review.

## Phase 1: Durable project state and policy

- [ ] T001 Define `.acryl/` schema for agent registry, jobs, plugin proposals, installed registry, policy, marketplace publications, and room events.
- [ ] T002 Implement atomic portable project-state read/write, schema validation, startup reconciliation, and SQLite-index recovery behavior.
- [ ] T003 Implement global permission matrix with Safe, Developer, and YOLO presets and explicit policy receipts.
- [ ] T004 Implement proposal-before-creation and final-manifest permission comparison with escalation rejection/approval paths.

## Phase 2: Plugin safety lifecycle

- [ ] T005 Implement plugin candidate checkpoint, staging, activation settlement, health verification, quarantine, rollback, and controller recovery report.
- [ ] T006 Prove repeated failed activation leaves the prior composition healthy and no leaked Cordis resources remain.
- [ ] T007 Implement default in-process Cordis execution and a manifest-level future isolation selection seam without adding a default sandbox runtime.

## Phase 3: Delegated workers

- [ ] T008 Define one durable `DelegatedAgentJob` contract with capability token, artifact paths, pause/resume, evidence, and ordered disposal.
- [ ] T009 Implement generic terminal connector: ACRYL-owned PTY, scoped `acryl` CLI, file artifacts, lifecycle capture, and process cleanup.
- [ ] T010 Implement ACP connector as the same job contract with structured event mapping.
- [ ] T011 Add workspace-mode setting: current workspace default, per-run override, and optional default isolated worktree.
- [ ] T012 Prove offline job continuation and controller-gated runtime mutation after restart.

## Phase 4: Package sources and Blends

- [ ] T013 Define ACRYL Registry source/package contract and separate adapter contract for external DSH stores.
- [ ] T014 Implement package provenance, publisher signature, compatibility, permissions, editable-source, sealed-artifact, and local-fork records.
- [ ] T015 Implement Blend manifest, create-isolated-project operation, and initial composition verification.
- [ ] T016 Implement apply-to-existing-project planning, conflict detection, explicit controller resolution, and durable apply record.
- [ ] T017 Implement manual vendor-update merge flow for local editable forks.

## Phase 5: Controllers and publication

- [ ] T018 Add GUI/Web controller projections for jobs, proposals, permissions, recovery, packages, Blends, and active-control state.
- [ ] T019 Add Marketplace publication approval and explicit YOLO auto-publish policy flow with immutable evidence.
- [ ] T020 Add generic second-client tests proving a read-only surface cannot mutate without active-control authority.

## Deferred platform work

- [ ] D001 Remote ACRYL Registry hosting, commercial transactions, licensing backend, seller portal, and SaaS `webblends` deployment require a separate approved specification after local package/Blend workflows are proven.
