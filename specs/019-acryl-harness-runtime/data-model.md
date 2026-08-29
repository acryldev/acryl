# Data Model: ACRYL pi-tui Durable Session Surface

## Durable runtime facts

- **Profile**: named, user-configured DSH profile selected by `--profile`.
- **Session ID**: native durable DSH session identity. Created by the bridge or explicitly supplied with `--resume`.
- **Session event**: native durable DSH fact from which transcript messages and tool lifecycle are projected.

## Ephemeral presentation facts

- **AcrylSessionSnapshot**: bridge-derived view of one active native session: transcript, tools, and agent running/idle state.
- **AcrylTuiState**: in-process copy of the current snapshot plus display error. It is discarded when the TUI exits.
- **Tui renderer**: alternate-screen terminal resource. It has no durable state and owns no agent/session handle.

The removed endpoint/lease/credential entities are not part of this data model.
