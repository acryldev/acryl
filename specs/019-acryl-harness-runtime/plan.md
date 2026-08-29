# Implementation Plan: ACRYL pi-tui Terminal Surface (M1)

**Revision 2026-08-29 (C1).** This revision supersedes the 2026-08-26 owner-or-attach
plan below it. The cross-process ownership/lease design was removed from the code
(`3285a7f`, `89a2de1`, `515c0c3`) and is replaced by the runtime-surface decision in
[`docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`](../../../ACRYL-RUNTIME-SURFACE-CONTRACT.md):
ACRYL implements behavior once in the ACRYL Runtime; TUI/Electron/Web are surfaces
invoking the same runtime semantics.

## Design (governing)

**Goal.** `acryl tui` presents one ordinary local DSH/Cordis runtime as a full-screen
pi-tui coding agent. The first vertical slice is:

```text
acryl tui -> native durable DSH session -> prompt -> streamed output/tool state
          -> cancel -> clean escape/dispose -> resume the same session
```

**Runtime ownership.** `acryl-harness-runtime` owns profile boot
(`bootAcrylHarnessProfile`), agent/session handles, durable-log projection, and
shutdown. `acryl-control` owns the typed semantic contracts. `acryl-tui` owns only
terminal presentation lifecycle.

**Bootstrap.** `acryl-tui/src/host/direct.ts` `startDirectHost()` is the sole
bootstrap: one root via `bootAcrylHarnessProfile({ profile })`. No daemon, no
sockets, no ownership/attachment, no leases.

**Session seam.** `acryl-harness-runtime/src/session-bridge.ts`
`createAcrylSessionBridge(ctx, options)` is the only session access:
- `open(resumeSessionId?)` — create or resume one native agent, await `whenIdle()`.
- `subscribeEvents(sessionId, listener)` — incremental typed durable
  `SessionEvent` records (the same events the durable log carries), added in this
  revision for streaming presentation.
- `snapshot` / `subscribe` — retained for the probe and other surfaces.
- `submitPrompt(sessionId, text)` / `cancel(sessionId)`.
- `dispose()` — idle-wait, `sessions.flush`, then dispose handles.

**Terminal presentation.** Port concrete Tomo code from
`tomowang/dsh-tui` @ `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` (0.7.0, MIT,
pi-tui 0.84.2) rather than writing a new renderer: `store.ts`, `render.ts`,
`markdown.ts`, `tui/{theme,piTheme,text,liveText,Spinner,bannerText,statsFormat}.ts`,
`tui/{CustomEditor,promptAutocomplete,commands,fileMention,fileIndex,miniTextField}.ts`,
`tui/TuiApp.ts`, `tui/actions.ts`. Only Tomo's direct-Cordis plugin
(`src/index.ts`), bundle startup (`src/startup.ts`, `cordis.patch.yml`), and
network update check are NOT ported.

**ACRYL replacements.** `startDirectHost()` + `createAcrylSessionBridge()` replace
Tomo's `ctx.inject` bootstrap and direct `ctx.agents` access. Tomo's bundle-patch
composition rows move into runtime-owned profile composition (persona,
agent-presets default `standard`, session-stats, `hmr` disabled) — they are runtime
capability, not surface code.

**Dependencies.** `@earendil-works/pi-tui` exactly `0.84.2` (normal dependency of
`acryl-tui`, never vendored/patchable by default) and `diff`. `ink`, `react`,
`@types/react`, `ink-testing-library` are removed once the pi-tui surface is
functional.

**Gates per chunk.** Focused vitest → package `typecheck` → package `build` →
commit; manual TTY smoke when available after the app shell lands. Ink removal only
after the pi-tui loop is demonstrably functional. Git history preserves the
superseded design; `docs/DEVELOPMENT-LOG.md` receives the canonical checkpoint
after implementation commits.

## Boundaries and lifecycle rules

- Direct adapter only. No attach protocol, credentials, leases, heartbeats,
  sockets, polling, daemon, or recovery in this milestone.
- Profile composition: ordinary pinned profile + user patch layers. The ACRYL
  runtime profile must keep `hmr` disabled (Tomo disables it; an enabled HMR
  demands `--expose-internals` and fights the terminal).
- Every subscription, handle, and the alt-screen mount are owned by one owning
  lifecycle and fully disposed before root disposal; `dispose()` is idempotent.
- No edits to `deepseek-harness/`. No GUI/Web-parity claims.

## Acceptance (final proof)

`corepack pnpm --filter acryl-harness-runtime run check`,
`corepack pnpm --filter acryl-tui run check`, then in a real TTY:
`corepack pnpm --filter acryl-tui exec acryl tui` — create session, submit a
prompt, watch streamed text plus a live tool spinner, Ctrl+C cancels, exit prints
a resumable session id; `acryl tui --resume <id>` replays and continues the same
durable session.

---

## Superseded 2026-08-26 design (history, not actionable)

> The owner-or-attach, capability-credential, local-control-endpoint, and
> active-control-lease design described below was removed on 2026-08-29
> (`3285a7f` "remove speculative direct host ownership", `89a2de1` "remove unused
> ownership endpoint modules", `515c0c3` "remove obsolete tui control state"). Its
> task artifacts are marked superseded in `tasks.md`. It is kept here only so the
> ledger history explains why `T004`/`T005` are no longer checked. The rest of the
> original 2026-08-26 plan remains available in git history at `77dd782~`.
