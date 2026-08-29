# Research: ACRYL pi-tui Durable Session Surface

## Runtime decision

`acryl-harness-runtime` owns normal pinned DeepSeek Harness profile boot and exposes the resulting root to the direct TUI host. Durable DSH sessions and agent handles remain the canonical conversation state. The TUI must not duplicate them.

## Superseded design

The former owner-or-attach endpoint, capability credential, and active-control lease design is superseded by `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md` and has been removed from the implementation. A launched surface starts its own normal local runtime. No socket, listener, endpoint, lease, heartbeat, attachment, polling, or recovery design is part of this feature.

## Tomo reference baseline

The concrete behavioral reference is `tomowang/dsh-tui` commit `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1`, package `@tomowang/dsh-tui` 0.7.0, MIT, built on `@earendil-works/pi-tui` 0.84.2. This feature ports only compatible terminal-presentation modules. It replaces Tomo's direct DSH/Cordis bootstrap and session access with `startDirectHost()` and `createAcrylSessionBridge()`.

## C1 mapping record

C1 has run Tomo successfully in this workspace and is the authority for concrete Tomo-to-ACRYL API and lifecycle mapping. Add the verified module mapping and any pi-tui/DSH lifecycle corrections here before T005 begins. Do not alter the renderer in parallel with C1.

## Decision 7 (2026-08-29, C1): adopt tomowang/dsh-tui via a direct runtime adapter

**Decision:** Port the concrete terminal implementation of `tomowang/dsh-tui` at
`f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` (`@tomowang/dsh-tui` 0.7.0, MIT,
pi-tui 0.84.2) into `acryl-tui` over `startDirectHost()` +
`createAcrylSessionBridge()`. Do not re-author a smaller TUI.

**Verified facts (inspection, 2026-08-29):**

- ACRYL pins `@deepseek-ai/dsh-*` at `0.1.1-rc.2`; Tomo's peer range is
  `^0.1.1-rc.2`. Same API surface; tomowang 0.7.0 already boots against ACRYL's
  rc.2 package set (verified by running the launcher from ACRYL's installed
  `@deepseek-ai/dsh@0.1.1-rc.2`).
- rc.2 `AgentStatus = 'idle' | 'running'`; the bridge's `waiting | failed` are
  derived surface states, not rc.2 values.
- rc.2 `agents.create/resume` accept `{ sessionId, meta, agentOptions, setup }` —
  `setup` runs `installModelSelection(agentCtx, ref)` + `presets.mount(...)`.
  The current bridge does not pass `setup` (Tomo does).
- rc.2 session service exposes `sessions.flush(session): Promise<boolean>` (the
  `session/flush` durability checkpoint). Tomo flushes before exit; the bridge
  currently does not.
- Tomo's `subscribeEvents` counterpart is `ctx.on('session/event')` writing into
  `TuiStore.appendEvent` (seq-dedupe replay boundary) with `BlockAssembler`
  folding `assistant/chunk` deltas. The durable log entries are the presentation
  source; streaming is fold-of-deltas, not a separate transport.
- `acryl-control`'s `AcrylSessionClient` (protocol/client.ts) is now orphaned —
  no surface imports it. It is kept, not deleted, this milestone.
- `specs/019` T001–T003 artifacts exist; T004/T005 artifacts were removed by
  commits `3285a7f`, `89a2de1`, `0f6ce15`, `515c0c3`.

**Assumptions (to verify at T011):**

- A direct in-process adapter may pass rc.2 `SessionEvent` records through the
  bridge without a protocol layer (M2 may re-introduce transports).
- The runtime profile composition rows (persona, agent-presets `standard`,
  session-stats, `hmr` off) are sufficient for the slice's toolset; the `cordis`
  preset's `tool-cordis` needs `dsh-cordis-host-runner` (verified presence in
  ACRYL's rc.2 package set) — deferred with approvals.
- `acryl tui` will run against the default `DSH_HOME` (`~/.dsh`) unless the
  caller sets it; `dev:local` sets `~/.dsh-acryl`. Session continuity holds
  within one home; cross-home continuity is out of scope.
- Tomo's `@earendil-works/pi-tui@0.84.2` types compile under ACRYL TS 6.0.3
  (Tomo uses TS 5.9). Expect minor type-fit fixes only.
