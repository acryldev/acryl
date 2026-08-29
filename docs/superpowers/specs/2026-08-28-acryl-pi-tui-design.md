> **SUPERSEDED 2026-08-29.** This plan was transferred into the active Spec Kit ledger `specs/019-acryl-harness-runtime/` (see its `plan.md` revision and `tasks.md`). The repository does not maintain a parallel planning system; keep changes in the ledger.

# ACRYL pi-tui terminal surface design

## Goal

Replace ACRYL's React Ink readiness screen with a usable, full-screen pi-tui coding-agent surface that presents one ordinary local DeepSeek Harness and Cordis runtime.

## Architecture

`startDirectHost()` remains the only bootstrap path. It creates the normal local profile and is disposed when the terminal UI exits. The terminal controller creates or resumes one native durable DSH agent session through `createAcrylSessionBridge()` and treats the bridge snapshots as presentation input only.

The ACRYL renderer ports the small, compatible core of Tomo Wang's `dsh-tui`: its pi-tui alternate-screen composition, scroll-following transcript, prompt editor, store-driven incremental rendering, key handling, and spinner/status layout. Tomo's direct Cordis bootstrap, profile/model configuration, transport ownership, and feature overlays are not imported because ACRYL already owns runtime construction and this milestone has no need for those capabilities.

The TUI store projects durable transcript messages and tool states, plus live snapshot changes, into immutable render state. It does not persist data or create a parallel session loop. Prompt submission and cancellation call the bridge. `Ctrl+C` cancels a running turn; pressing it again when idle exits the UI. An optional CLI resume session id uses the same native bridge `open(resumeSessionId)` path.

## Boundaries

- No daemon, socket, listener, ownership, lease, heartbeat, polling, attach, or recovery protocol.
- No modification to `deepseek-harness/`.
- No RLM, routing, Fleet, marketplace, GUI/Web parity, model controls, approvals/questions, plans, goals, compaction, shell mode, or plugin presentation.
- The existing `--json` direct-host readiness path remains headless and does not mount pi-tui.

## Verification

Focused tests cover bridge prompt submission, durable-stream projection into the store, cancellation dispatch, renderer-to-runtime disposal, and stale `.acryl/control` state being ignored. Package tests and typechecks run sequentially because workspace package builds generate declarations consumed by downstream packages.
