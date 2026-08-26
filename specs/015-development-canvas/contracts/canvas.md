# Contract: Development Canvas Host PTY

Same-origin loopback, JSON, no-store. Forbidden unless Origin/Referer matches the renderer origin (same helper as Desktop settings).

## POST `/api/desktop/canvas/pty`

Body:

```json
{ "commandId": "shell" }
```

`commandId` is one of `shell`, `claude`, `codex`, `opencode`, `gemini`, `pi`.

200:

```json
{ "id": "pty_…", "status": "running" }
```

400 invalid body; 403 forbidden; 500 spawn failure (`{ "error": "…" }`).

## POST `/api/desktop/canvas/pty/input`

Body:

```json
{ "id": "pty_…", "data": "ls\n" }
```

200 `{ "accepted": true }`. 404 unknown id.

## GET `/api/desktop/canvas/pty?id=pty_…`

200:

```json
{ "id": "pty_…", "status": "running", "output": "…", "exitCode": null }
```

Output is the retained scrollback, not a delta cursor, in this slice.

## POST `/api/desktop/canvas/pty/close`

Body:

```json
{ "id": "pty_…" }
```

200 `{ "accepted": true }` even if already closed (idempotent).

## UI contribution (Client)

- Slot: advanced `root` center column (not compatibility).
- "+" control; kinds `pty`, `file`, `browser` (and Chat via default tile).
- Chat tile renders `renderSlot('conversation')`.
