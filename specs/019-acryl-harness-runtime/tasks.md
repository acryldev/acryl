# Tasks: ACRYL pi-tui Durable Session Vertical Slice

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), and [local control contract](contracts/local-control.md).

## Single vertical-slice rule

Do not start GUI, Web, provider selection, approval dialogs, session browsing,
or another agent adapter. Every task below serves one human flow:

```text
acryl tui -> prompt -> durable native response -> exit -> --resume -> continue
```

Every behavior task follows RED-GREEN-REFACTOR. A checkbox is checked only
after its focused test, commit, and evidence are complete.

## Phase 1: Contract and runtime foundation

- [x] T001 Add validated `AcrylSessionSnapshot`, transcript/tool projections,
  and four-command `AcrylSessionClient` types in
  `acryl-control/src/contracts/session.ts`; test invalid external payloads in
  `acryl-control/tests/session-contract.spec.ts`.
- [x] T002 Add the local protocol client for snapshot, subscribe, prompt, and
  cancel operations in `acryl-control/src/protocol/client.ts`; RED-GREEN test
  request/response parsing and subscription disposal in
  `acryl-control/tests/session-client.spec.ts`.
- [x] T003 Add a runtime-owned native DSH session bridge in
  `acryl-harness-runtime/src/session-bridge.ts` that creates or resumes one
  durable session, projects durable transcript/basic tool state, sends prompts
  through the native agent, and cancels its active turn; test it against the
  pinned profile in `acryl-harness-runtime/tests/session-bridge.spec.ts`.
- [x] T004 Extend `acryl-harness-runtime/src/index.ts` with the only
  owner-or-attach entry point, returning a selected session identity and an
  `AcrylSessionClient`; prove startup rollback, owner reuse, and no second root
  in `acryl-harness-runtime/tests/owner-or-attach.spec.ts`.
- [ ] T005 Mount the session bridge behind the existing control endpoint in
  `acryl-control/src/protocol/service.ts` and runtime owner composition; test
  prompt persistence, response replay, cancellation, and endpoint cleanup in
  `acryl-control/tests/session-control.integration.spec.ts`.

## Phase 2: pi-tui presentation

- [ ] T006 Add exact `@earendil-works/pi-tui@0.80.7` runtime dependency and
  necessary reference-renderer dependencies to `acryl-tui/package.json`; add
  `docs/acryl/dsh-pi-tui-provenance.md` without a vendor directory or package
  patch.
- [ ] T007 Replace the superseded Ink mount with a minimal pi-tui
  transcript/composer/status renderer in `acryl-tui/src/pi-surface/`; it must
  consume only `AcrylSessionClient` snapshots and submit/cancel commands.
  Add renderer tests with a fake client in `acryl-tui/tests/pi-surface.spec.ts`.
- [ ] T008 Replace `acryl-tui/src/host/direct.ts` with a thin
  owner-or-attach request to `acryl-harness-runtime`; assert that TUI code has
  no direct Cordis, DSH session, or DSH agent access in
  `acryl-tui/tests/host-boundary.spec.ts`.
- [ ] T009 Add `--resume <session-id>` to `acryl-tui/src/cli/grammar.ts` and
  connect `acryl-tui/src/cli/run.ts` to the pi-tui renderer; on controlled exit
  print the selected session ID and preserve durable state. Test fresh and
  resumed invocation in `acryl-tui/tests/cli-run.spec.ts`.

## Phase 3: End-to-end proof and stop point

- [ ] T010 Add one generic second-client contract test in
  `acryl-control/tests/session-client.spec.ts` proving a non-TUI client can
  consume the same profile/generation/session snapshot without direct DSH
  access.
- [ ] T011 Run and record focused PNPM checks in
  `specs/019-acryl-harness-runtime/evidence/first-pi-tui-vertical.md`:
  `corepack pnpm --filter acryl-control run check`,
  `corepack pnpm --filter acryl-harness-runtime run check`, and
  `corepack pnpm --filter acryl-tui run check`.
- [ ] T012 Run the local launcher smoke in
  `specs/019-acryl-harness-runtime/evidence/first-pi-tui-vertical.md`: owner
  starts, prompt persists, response renders, process exits, and `--resume`
  replays and continues the same session. Record the manual user observation.

## Dependencies

```text
T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012
```

T006 may begin after T001, but the renderer must not be merged or tested as a
feature before its real control-client path exists.

## Definition of done

The vertical slice is done only when the human acceptance command in `plan.md`
works with an already-authenticated profile. Do not continue to GUI, Web,
advanced tool UI, provider choice, or attachment enhancements until the human
has tested this flow.
