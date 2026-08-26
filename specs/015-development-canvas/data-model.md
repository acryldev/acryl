# Data model: Development Canvas

## CanvasSnapshot

| Field | Type | Rules |
| --- | --- | --- |
| tiles | `CanvasTile[]` | Ordered; empty is valid |
| menuOpen | `boolean` | "+" popover |

Transitions:

- `create()` -> one `chat` tile, menu closed
- `addTile(kind)` -> append tile; if `kind === 'chat'` and one already exists, no-op
- `closeTile(id)` -> remove; if a `pty` tile, caller must dispose the Host session
- `setMenuOpen(open)`
- `updateTile(id, patch)` -> merge kind-specific fields

## CanvasTile

| Field | Type | Rules |
| --- | --- | --- |
| id | string | Opaque, unique in the snapshot |
| kind | `'chat' \| 'pty' \| 'file' \| 'browser'` | Immutable after create |
| title | string | Display only |
| commandId | string? | `pty` only; allowlisted id |
| sessionId | string? | `pty` only; Host session |
| path | string? | `file` only |
| content | string? | `file` only |
| url | string? | `browser` only; `http:`/`https:` after submit |

## PtySession (Host)

| Field | Type | Rules |
| --- | --- | --- |
| id | string | Equals tile `sessionId` |
| commandId | allowlisted id | Spawn argv comes from the catalog |
| chunks | string[] | Bounded scrollback |
| status | `'starting' \| 'running' \| 'exited' \| 'error'` | |
| exitCode | number \| null | Set on exit |

Transitions: create -> running -> exited/error; `write(data)`; `dispose()` idempotent (kill + wait).

## AgentCommand

| id | argv | purpose |
| --- | --- | --- |
| shell | `$SHELL` or `cmd.exe` | Interactive shell |
| claude | `claude` | Claude Code CLI |
| codex | `codex` | Codex CLI |
| opencode | `opencode` | OpenCode |
| gemini | `gemini` | Gemini CLI |
| pi | `pi` | Pi |

Unknown ids are rejected before spawn.
