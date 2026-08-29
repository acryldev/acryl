# Tasks: ACRYL pi-tui Terminal Surface (M1)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md).
**Revision**: 2026-08-29 (C1). Re-scoped to the tomowang/dsh-tui port per
`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` and the roadmap M1 decision.
The local-control/attach tasks of the 2026-08-26 ledger are superseded (see below).

## Single vertical-slice rule

Do not start GUI, Web, provider selection, approval dialogs, session browsing, or
another agent adapter. Every task below serves one human flow:

```text
acryl tui -> session -> prompt -> streamed output/tool state -> cancel -> dispose
```

Every behavior task follows RED-GREEN-REFACTOR. A checkbox is checked only after
its focused test, commit, and evidence are complete.

## Phase 1: Contract and runtime foundation

- [x] T001 Add validated `AcrylSessionSnapshot`, transcript/tool projections, and
  four-command `AcrylSessionClient` types in
  `acryl-control/src/contracts/session.ts`; test invalid external payloads in
  `acryl-control/tests/session-contract.spec.ts`.
- [x] T002 Add the local protocol client (`acryl-control/src/protocol/client.ts`).
  KEPT AS ORPHANED after the 2026-08-29 ownership removal: no surface consumes it
  today; a later M2 transport reuse may. Not deleted in this milestone.
- [x] T003 Add a runtime-owned native DSH session bridge in
  `acryl-harness-runtime/src/session-bridge.ts` (create/resume, snapshot
  projection, submit, cancel) tested in
  `acryl-harness-runtime/tests/session-bridge.spec.ts`.
- [x] T004 SUPERSEDED 2026-08-29: owner-or-attach entry was speculative and was
  removed (`3285a7f`). Replaced by `startDirectHost()` +
  `bootAcrylHarnessProfile()` as the sole local bootstrap.
- [x] T005 SUPERSEDED 2026-08-29: control/protocol service endpoint was removed
  (`89a2de1`, `0f6ce15`). Direct TUI adapter supersedes it for this milestone.

## Phase 2: pi-tui presentation (tomowang port)

- [x] T006 Add exact `@earendil-works/pi-tui@0.84.2` plus `diff` to
  `acryl-tui/package.json`; remove `ink`, `react`, `@types/react`,
  `ink-testing-library` only as sources stop referencing them. Add
  `docs/acryl/tomowang-dsh-tui-provenance.md` (URL, commit, license, component
  inventory). No vendor tree, no submodule, no package patch.
- [x] T007 Extend `acryl-harness-runtime/src/session-bridge.ts` with an
  incremental durable-event seam: `subscribeEvents(sessionId, listener)` emitting
  typed `SessionEvent` records; `dispose()` waits idle and `sessions.flush()`s
  before disposing handles. RED test in `session-bridge.spec.ts` first. This is
  the gap that makes streamed output surfaceable.
- [x] T008 Add the ACRYL runtime profile rows into `bootAcrylHarnessProfile`
  composition: `system-prompt` persona, `agent-presets` (default `standard`),
  `session-stats`, `hmr` disabled. Without these the host mounts a bare agent with
  no toolset/persona. Test profile boot exposes the rows (Loader activation check)
  in `acryl-harness-runtime/tests/profile.spec.ts`.
- [x] T009 Port Tomo presentation core into `acryl-tui`:
  `src/tui/store.ts`, `src/render.ts`, `src/markdown.ts`,
  `src/sessionId.ts`, `src/tui/{theme,piTheme,text,liveText,Spinner,bannerText,
  statsFormat}.ts` with their vitest suites (store/render/markdown/liveText/
  statsFormat). Copy, do not re-author.
- [x] T010 Port the editor chain: `src/tui/{CustomEditor,promptAutocomplete,
  commands,fileMention,fileIndex,miniTextField}.ts` with commands/fileMention
  suites. Pure pi-tui + file-index; no runtime deps.
- [x] T011 Port `src/tui/TuiApp.ts` + `src/tui/actions.ts`; add the ACRYL host
  adapter (new `acryl-tui/src/tui-app/session.ts`: attach/resolve bridge, seed
  store from `agent.session.events`, follow `subscribeEvents`, TuiActions over
  bridge, shutdown = cancel→whenIdle→flush→unmount) and wire it into
  `acryl-tui/src/cli/run.ts` (TTY guard, exit path). Keep `--json` headless probe.
- [x] T012 Delete the Ink surface after T011 is functional:
  `acryl-tui/src/render/{app,ink-app,contributions,status}.tsx/ts`,
  `screens/agent-workspace.ts` + Ink-only specs (`ink-app`, `renderer`,
  `agent-workspace`, `contributions`, `status`), rewrite `cli-run.spec.ts` for the
  new lifecycle. No parallel renderer beyond the migration step.
- [x] T013 End-to-end proof with recorded evidence in
  `specs/019-acryl-harness-runtime/evidence/first-pi-tui-vertical.md`:
  `acryl tui` → create → prompt → streamed text + tool state → cancel → exit →
  `--resume <id>` replays and continues. Record manual observation in a real TTY.

## Phase 3: Stop point and next parity gap

- [x] T014 Record the handoff: changed Tomo source modules, adaptation, commands,
  user-visible behavior, and the next parity gap (approvals/questions, overlays,
  prompt history, session picker, model/preset controls) in
  `specs/019-acryl-harness-runtime/research.md` (Parity ledger section).

## Dependencies

```text
T006 -> T009 -> T010 -> T011
T007 -> T011
T008 -> T011
T003 -> T007
T011 -> T012 -> T013 -> T014
```

## Definition of done

The vertical slice is done only when the human acceptance command in `plan.md`
works with an already-authenticated profile in a real TTY, and the Ink renderer is
gone. Do not continue to GUI, Web, advanced tool UI, or approval/question surfaces
until the human has tested this flow.
