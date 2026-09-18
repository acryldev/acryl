# 05 — Session Bridge and the TUI

The TUI never touches `ctx` services ad hoc; it goes through **one seam**:
`createAcrylSessionBridge()` (`acryl-harness-runtime/src/session-bridge.ts`), and
projects the durable session log into `TuiStore` (`acryl-cli/src/tui/store.ts`) which the
pi-tui shell renders. This file documents that data flow.

## The bridge interface

```ts
interface AcrylSessionBridge {
  open(resumeSessionId?: string): Promise<string>
  snapshot(sessionId: string): Promise<AcrylSessionSnapshot>
  events(sessionId: string): readonly SessionEvent[]          // full durable log (replay/seed source)
  subscribe(sessionId, listener, onError?): Promise<AcrylSessionSubscription>
  subscribeEvents(sessionId, listener): Promise<AcrylSessionEventSubscription>  // live stream
  submitPrompt(input: { sessionId: string; text: string }): Promise<void>
  cancel(sessionId: string): Promise<void>
  dispose(): Promise<void>
}
```

Construction: `createAcrylSessionBridge(ctx, { profile, generationId, attachment: 'owner', cwd })`.

- `attachment: 'owner'` — this surface **owns** the session (the alternative is an
  attached viewer, which the web protocol client uses).
- Snapshot types (`AcrylSessionSnapshot`, `AcrylTranscriptItem`, `AcrylToolProjection`)
  come from **`acryl-control`**, so the terminal, web, and desktop all speak the same
  session vocabulary.
- The bridge wraps `ctx.agents` / `ctx.sessions` (`@deepseek-ai/dsh-agent`,
  `@deepseek-ai/dsh-session`) — it is an adapter, not a re-implementation.

## Projection logic

The bridge reduces the typed durable `SessionEvent` log into presentation shapes:

- **Transcript items** — `user/message` (source `user`) and `assistant/message` events
  become `{ id: 'event-<seq>', author, text }` after joining text content blocks.
- **Tool projections** — `tool/call` opens a `AcrylToolProjection` keyed by `callId`
  with `status: 'running'`; `tool/result` updates it. The map is folded from the whole
  log, so a fresh subscriber sees current state immediately.

This folding is deterministic and log-based: **the durable log is the source of truth**,
the bridge is a pure-ish view over it, and `TuiStore` is a cache of that view.

## `attachSession()` — what happens at mount

`acryl-cli/src/tui-app/session.ts`:

```ts
const bridge = createAcrylSessionBridge(host.ctx, { profile, generationId, attachment:'owner', cwd })
const id     = await bridge.open(resumeId)                 // open or --resume <id>
storeSetStatus(store, await bridge.snapshot(id))           // seed status
bridge.subscribeEvents(id, event => {                      // live tail
  store.appendEvent(event)                                 //   1. append raw event
  void bridge.snapshot(id).then(next => storeSetStatus(store, next))  // 2. refresh status
})
const agent   = host.ctx.agents?.get?.(SessionId(id))       // agent handle for the session
const session = agent?.session
```

The store receives two channels: raw `SessionEvent`s for the transcript pane and
periodic `AcrylSessionSnapshot`s for status/model/tool state. Both derive from the same
durable log, so a later `--resume` reproduces the exact same view.

## Prompt lifecycle

- **Submit** — `bridge.submitPrompt({sessionId, text})` → the bridge writes a user
  message (`createUserMessage` from `dsh-llm`) into the session and drives the agent
  turn. Turn/step/tool events stream back through `subscribeEvents`.
- **Cancel** — `bridge.cancel(sessionId)` (Ctrl+C in the TUI) aborts the running turn;
  the durable log records the interruption, so resume is consistent.
- **Blank-session semantics** — a session is "blank" until the first `turn/start`;
  injected context (AGENTS.md, skill catalog, cron notices) is not a turn. This mirrors
  harness semantics so `/presets` can offer a preset switch on a not-yet-started session.

## Slash commands (all ride the same runtime)

From the TUI's `/help`:

| Command | Runtime service it drives |
|---|---|
| `/model` | `ctx.llm` × `ctx.settings` × `ctx.credentials` — the provider-profile overlay (see below) |
| `/trajectory` | Durable turn/step event ledger (`TrajectoryLedger`/overlay) |
| `/tools` | `ctx.tools` registry — browse/expand tool cards |
| `/context` | `ctx.token-meter` — context-window usage |
| `/plugins` | `ctx.loader.entries()` — plugin tree with Fiber states (`active/pending/loading/failed/unloading/disposed`) |
| `/presets` | `agent-presets` service — view/switch presets (blank-session gate) |
| `/goal`, `/plan`, `/compact` | `goal` / `plan-mode` / `command-compact` services |
| `/clear` | Flush session, re-attach fresh one (durable history stays on disk) |

Overlay components live in `acryl-cli/src/tui/**` (`ModelProfileOverlay`,
`TrajectoryOverlay`, `ToolCardsOverlay`, `ContextOverlay`, `PluginsOverlay`,
`AgentPresetsOverlay`, `ApprovalOverlay`, `QuestionOverlay`, `LoginOverlay`).
Approval/question overlays consume the `user-approval` / `user-questions` services —
the same approval pipeline a web client would use.

## `/model` provider join (the subtle part)

`loadProviders()` re-joins three services and refreshes the overlay:

1. `ctx.llm.listConfigurableProviders()` — which providers *can* be configured.
2. `ctx.settings.describe({redactSecrets:true})` — the stored profile per provider
   (`settingsNs`/`settingsPath`, `apiKeyEnv` reference, model overrides).
3. `ctx.credentials.describe(apiKeyRef)` / `readRecord('llm-pi-ai/<providerId>')` —
   whether a key exists. **Two credential addresses are checked** because a `/login`
   sign-in (OAuth or typed key) writes pi-ai's own credential record, not `apiKeyEnv`.

After any settings write, the code awaits `setImmediate` (`flushSettingsWatchers()`):
`settingsSvc.update()` resolves on document commit, but `dsh-llm-pi-ai`'s registry
rebuild runs on a promise chained *after* that commit — reading `ctx.llm` immediately
would race the watcher and show pre-write state. This is documented in-file as a
deliberate sequencing contract.

## Exit and resume

- Normal exit (`/exit`, `/quit`, Ctrl+D) disposes the TUI handle, then the bridge, then
  the direct host (root Fiber dispose), and prints:
  `resume with: acryl tui --resume <sessionId>` (with the id prefix stripped via
  `stripSessionIdPrefix` for readability).
- Continuity is **file-based**: `~/.dsh/sessions/**` JSONL written by
  `session-persistence-jsonl`. A new process resumes by replaying the log through the
  same bridge — no server keeps state, and nothing lives only in the TUI process.

## Data flow diagram

```
┌──────────────────────────── one Node process (direct host) ────────────────────────────┐
│                                                                                        │
│  pi-tui shell (TuiApp, overlays)                                                       │
│        ▲  render/store state                                                           │
│        │ events from TuiStore                                                          │
│  TuiStore ── appendEvent(SessionEvent)                                                 │
│        ▲          └── setStatus(AcrylSessionSnapshot)                                  │
│        │ events + snapshots                                                            │
│  AcrylSessionBridge  (acryl-harness-runtime, types from acryl-control)                 │
│    open/snapshot/events/subscribeEvents/submitPrompt/cancel                            │
│        │ calls                                                                          │
│  ctx.agents / ctx.sessions / ctx.tools / ctx.settings / ctx.credentials / ctx.llm      │
│        │ durable appends                                                                │
│  ~/.dsh/sessions/<id>.jsonl   (session-persistence-jsonl)                               │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
        next run: acryl tui --resume <id> → same log replayed through the same bridge
```
