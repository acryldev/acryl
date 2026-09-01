# Feature: ACRYL Rebase onto Native DSH/Cordis Seams

## Objective

`acryl-control`, `acryl-harness-runtime`, `acryl-tui`, and `acryl-desktop` currently
re-implement framework capabilities that DeepSeek Harness (DSH) and Cordis already ship
(verified against `@deepseek-ai/dsh-*` packages). This feature removes the parallel
framework and re-bases the ACRYL control plane and runtime onto native seams, then proves
the plugin philosophy end-to-end with one real model-facing Tool that is a genuine Cordis
plugin (inject `ctx.tools`, register via `ctx.tools.register(defineTool(...))`, canonical
typed output, honors `exec.signal`, traverses the tool policy pipeline, disposes on unload).

Outcome: ACRYL no longer has a second session store, second agent/provider framework,
second terminal launcher, or second architecture inspector. Surfaces are thin consumers of
one runtime. A future capability is added by defining a Cordis seam, not by patching a core.

## User scenarios

1. Given a running `acryl`/`acryl tui` session, when a user asks a question, the tool
   pipeline uses the **same** DSH session-log + projection model the surface renders from
   (one source of truth), not a parallel store.
2. Given the Development Canvas, when a user starts an external agent terminal, the canvas
   reserves the agent through `ctx.subagents`/`ctx.terminals` seams, and the PTY id never
   doubles as the agent runtime handle.
3. Given a profile restart, when an agent run ends, every owned resource (process, socket,
   PTY, subscription, timer, plugin registration) is disposed by its owning `ctx.effect()`
   disposer with no orphaned workers.

## Functional requirements

- FR-001: The session/transcript/tool projections surfaced by `acryl-control`, the TUI, and
  the desktop must derive from the DSH session event log through `@deepseek-ai/dsh-session-projection`
  (or `dsh-session-stats`). No second hand-rolled projection store may remain.
- FR-002: Agent control (`acryl-control`) must be a thin adapter over `ctx.agents` /
  `ctx.loader` / `ctx.subagents`, not a custom provider registry with its own capability
  vocabulary. The custom `AcrAgentControlService` provider/binding map must be removed.
- FR-003: The runtime architecture inspector must use `@deepseek-ai/dsh-host-plugin-inventory`
  (or the documented Loader/reflect API) and must not reach into private Cordis fields
  (`ctx.root.reflect.store`, `ctx.root.registry.values()`, `fiber.getEffects()`,
  `fiber.inject`, `fiber.store`). The hand-coded `FIBER_PHASE` 0–5 table must be removed.
- FR-004: ACRYL must not maintain TWO terminal-launch mechanisms for the SAME role. The
  in-app DSH terminal plugin (`terminal.ts`) is the canonical in-app surface; the
  `desktop-terminal.ts` OS-integration launcher (tray-native macOS/Windows terminal) is a
  deliberate Electron/OS concern and is NOT a duplicate — it must stay, but must not be
  duplicated by a second in-app path. Verifed: `desktop-terminal.ts` is consumed by
  `electron-runtime.ts`, `index.ts` route, and `desktop-settings-controller.ts`.
- FR-005: No duplicate webserver implementation may be introduced. `acryl-desktop/webserver`
  is a DELIBERATE design (Desktop replaces the CLI webserver Loader row with it, documented
  in `docs/DEVELOPMENT-LOG.md`, consumed by `profile.ts`); it is not duplication to remove.
  Instead, keep exactly one webserver per surface and do not add a third.
- FR-005a: No ACRYL-owned package may re-implement a DSH/Cordis facility *without a deliberate
  decision and a tested consumer*, and no barrel export may be exposed with no consumer. Per-file
  verification (including `tests/` and `cordis.patch.yml`) found the previously-flagged
  `architecture/projection.ts`, `agent/agent-control.ts`, and `hello-world.ts` are each TESTED
  (and hello-world is a Loader-REGISTERED plugin proof). Treat their removal as a deliberate,
  review-gated refactor, not a dead-code cleanup.
- FR-006: ACRYL must ship **exactly one** real model-facing Tool as a genuine Cordis plugin
  (the Tool gate), satisfying: `inject: ['tools']`; registers via `ctx.tools.register`;
  canonical typed output split into `output.schema`/`output.render`; honours `exec.signal`;
  traverses the tool policy/event pipeline; disposes cleanly on Fiber/provider unload.
- FR-007: No ACRYL-owned package may re-declare a Cordis service key that DSH already
  provides (`ctx.fs`, `ctx.llm`, `ctx.tools`, `ctx.sessions`, `ctx.subagents`, `ctx.settings`,
  etc.) as a parallel service.

## Success criteria

- SC-001: `verifier`/`verify`/`test` gates pass and the runtime still boots a normal DSH
  profile (`corepack pnpm run local`/`dev`) with no regression in the TUI or canvas.
- SC-002: Grep/grep-tree shows no remaining `ctx.root.reflect.store`, `fiber.getEffects`,
  `CANVAS_PTY_COMMAND_IDS`-as-handle, or second `useSyncExternalStore` session projection in
  the ACRYL-owned packages.
- SC-003: The single real Tool is exercised via the DSH tool pipeline and appears as a typed
  tool call in the event log, not via a bypass.
- SC-004: A profile reload disposes the Tool's effect-owned resources (no leak / no duplicate
  registration), verified by a Loader/activation test.

## Non-goals

- Not building the room identity / relay / capability-package differentiators yet (those are
  follow-on ledgers; this feature only removes the duplicate substrate they must ride on).
- Not re-implementing authorization from scratch — only consuming the existing
  `dsh-interaction` approval seam and recording the CodeWhale monotonic-pipeline idea as a
  follow-on.
- Not decomposing the entire `acryl-desktop` Electron shell in one pass — only removing the
  specific duplicated capabilities FR-001–FR-006 name.
- Not editing anything inside `deepseek-harness/` (pinned upstream submodule, unmodified).
- Not introducing a second DI/event/lifecycle/system: all reuse comes from
  `@deepseek-ai/cordis` and `@deepseek-ai/dsh-*`.

## Edge cases

- A provider change or profile reload must unload and reactivate consumers without stale
  references or duplicate registrations (PENDING/LOADING/ACTIVE/FAILED/UNLOADING/DISPOSED).
- A Tool that is disposed mid-`exec.signal` must abort cleanly and never leave a
  half-registered handler.
- A session replay/cold start must reconstruct projection state from the log (the reason the
  projection seam must be used, not a parallel store).
- Partial writes / single-writer lease during a control-plane operation must not corrupt
  durable state.

## Assumptions and dependencies

- `deepseek-harness/` stays pinned and unmodified; ACRYL consumes `@deepseek-ai/dsh-*` +
  `@deepseek-ai/cordis`.
- `@deepseek-ai/dsh-session-projection`, `dsh-host-plugin-inventory`, and `dsh-terminal`
  exist (verified present in `deepseek-harness/packages/`).
- Work proceeds directly on `main` per current repo policy, in focused commits, and updates
  `docs/DEVELOPMENT-LOG.md` each checkpoint.
- This ledger follows `docs/workmethodology/acryl-hybrid-engineering-methodology.md`.
