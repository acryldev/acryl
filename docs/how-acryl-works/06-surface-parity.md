# 06 — Surface Parity: TUI, Web, Desktop Over One Runtime

ACRYL's constitution says the room/runtime is the source of truth and surfaces are
presentations. This file shows exactly how that holds for the CLI surface — and where
it deliberately stops being true.

## One factory, three surfaces

`acryl-harness-runtime/src/index.ts` exports two boot factories:

| Factory | Used by | Profile | Extra seam |
|---|---|---|---|
| `bootAcrylHarnessProfile({profile})` | **TUI** (direct host) | named (default `acryl`) | — |
| `bootAcrylWebProfile({cmdlineArgs, prepare})` | **Web** | fixed `web` | `provideCmdline(hostCtx, …)` before entries mount; reads `webStartup` (default `http://127.0.0.1:3080`) |

The Desktop (`acryl-desktop`, Electron) does not go through these two functions: its
`src/main.ts` is a thin Electron bootstrap that boots the DSH Host via Cordis using
`@deepseek-ai/dsh-app-boot` primitives (`boot`, `loadLayeredEnv`, `resolveProfileDir`)
directly, with its own `~/.dsh-acryl` home — the same composition idea, owned by the
desktop package.

## TUI vs Web vs Desktop

| Aspect | TUI (`pnpm acryl`) | Web (`acryl-web`) | Desktop (Electron) |
|---|---|---|---|
| Process model | **Direct host** — one process owns the Cordis root; no server | Runtime serves HTTP/WebSocket on loopback; renderer is sandboxed, no Electron APIs | Electron main boots Host via Cordis; renderer served over loopback |
| Session access | In-process `AcrylSessionBridge`, `attachment: 'owner'` | `acryl-control` protocol client over transport | Host/client faces in `acryl-desktop` |
| UI toolkit | `@earendil-works/pi-tui` (alternate-screen terminal) | DSH web app (`dsh-web-app` bundle) | Desktop shell + Development Canvas |
| Capability patches | Persona + `agent-presets` + `session-stats` + `authorization` | `authorization` only (non-TUI selection) | Desktop profile composes its own rows |
| DSH home | `~/.dsh` (shared) | `~/.dsh` | `~/.dsh-acryl` (isolated) |
| Session continuity | `--resume <id>` over `$DSH_HOME/sessions` JSONL | Same durable sessions via protocol | Same durable sessions via protocol |

What makes them "the same runtime": all three compose the pinned `@deepseek-ai/dsh-*`
harness into Cordis roots with the same service vocabulary (`sessions`, `agents`,
`tools`, `llm`, `settings`, `credentials`, `approval`, …), all write the same durable
session log, and all project snapshots through `acryl-control` types. The ACRYL-specific
model-facing tool (`acryl_workspace_status`) is installed on every profile boot through
`installAcrylWorkspaceStatusTool(ctx)`.

## Why the CLI rejects `web` and `gui`

`acryl-cli/src/cli/run.ts`:

> *"The `acryl` CLI is the terminal surface only. The browser (`acryl web`) and Electron
> (`acryl gui`) surfaces are separate distributions and are NOT wired into this package,
> so the CLI stays lightweight and does not pull the `dsh-web-app` / host / client bundle
> into its publish closure."*

Both commands throw a directed error telling the user to install the separate
distribution. This is a **publish-closure guarantee**, enforced by the dependency graph:
`acryl-cli` depends on `acryl-harness-runtime` (which does include `dsh-web-app` for
composition purposes), but the CLI package's own surface code never imports the
client-UI bundle, and `pnpm pack` of `acryl-cli` ships `lib/**` only.

## Direct host: the design point

For the terminal surface, hosting the runtime in-process is a feature:

- **No bootstrap order problems** — the TUI is alive only after `ctx.get('sessions')`
  and `ctx.get('agents')` exist; there is no client/server race.
- **No transport layer** — the bridge is function calls, so cancellation and snapshots
  are immediate and total (no partial-failure states to reconcile).
- **Continuity is external anyway** — durable sessions live in `$DSH_HOME/sessions`
  JSONL, not in the process. The process is disposable; the room (the log) survives.
  That is the same "disposable workers, durable room" principle the ALLAGENT
  constitution encodes.
- **Trade-off acknowledged** — a direct host cannot share its runtime with another
  surface while running. Attaching a second viewer to the *same live session* is the
  web/desktop protocol layer's job (`AcrylSessionAttachment` vs `'owner'`), not the
  TUI's.

## Where the seams live (summary)

```
                       ┌──────────────────────────────────────────┐
                       │        acryl-harness-runtime             │
                       │  bootAcrylHarnessProfile (tui)           │
                       │  bootAcrylWebProfile (web)               │
                       │  createAcrylSessionBridge (shared seam)  │
                       │  coding capabilities (surface-scoped)    │
                       └───────┬───────────────────┬──────────────┘
                               │ in-process        │ HTTP/WS loopback
                               ▼                   ▼
                     ┌─────────────────┐   ┌──────────────────┐
                     │  acryl-cli      │   │  acryl-web       │
                     │  (this doc's    │   │  (separate dist) │
                     │   surface)      │   └──────────────────┘
                     └─────────────────┘
                     desktop: acryl-desktop boots the same harness
                     composition itself (Electron main, ~/.dsh-acryl)
```

The TUI is, in the end, the smallest possible proof of the architecture: one process,
one Cordis root, one durable log — and a terminal UI that is just a projection of it.
