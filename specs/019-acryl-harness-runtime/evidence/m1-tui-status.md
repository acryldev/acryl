# M1 pi-tui terminal surface — implementation status / handoff (2026-08-29, C1)

**Milestone:** M1 (docs/ACRYL-ROADMAP.md) — Adopt pi-tui as the terminal surface.

## Completed tasks

- **T001–T005** — contract + runtime foundation (prior work; owner-or-attach
  tasks superseded and removed).
- **T006** — exact `@earendil-works/pi-tui@0.84.2` + `diff` + only-imported dsh
  type deps in `acryl-tui`; provenance `docs/acryl/tomowang-dsh-tui-provenance.md`.
  Ink/React deps still present (removal is the gated T012).
- **T007** — `AcrylSessionBridge.subscribeEvents` (incremental durable event
  seam) + `events(sessionId)` (full durable-log accessor) + idle/flush on dispose.
  RED→GREEN in `session-bridge.spec.ts`.
- **T008** — `bootAcrylHarnessProfile` composes runtime rows (`system-prompt`
  persona, `agent-presets` default `standard`, `session-stats`).
- **T009** — Tomo presentation core ported verbatim (`store`, `render`,
  `markdown`, `sessionId`, `tui/{theme,piTheme,text,liveText,Spinner,bannerText,
  statsFormat}`, overlay `types`) + suites.
- **T010** — Tomo input/editor chain ported (`CustomEditor`, `promptAutocomplete`,
  `commands`, `fileMention`, `fileIndex`, `miniTextField`, `actions`) + suites.
- **T011** — `TuiApp` + overlay components ported; ACRYL host adapter
  `acryl-tui/src/tui-app/session.ts` (bridge→store→actions→mount/dispose); CLI
  wiring (`cli/run.ts` uses the host adapter, `--json` stays a probe, `--resume`
  added); TTY guard.

## Commits (main, pushed)

```
33439ec feat: stream durable session events and flush bridge dispose   (T007)
67bbaca feat: compose coding-agent rows into the acryl runtime profile (T008)
0b0cba5 feat: port tomowang presentation core into acryl-tui           (T006+T009)
ecefaf4 feat: port tomowang input/editor chain into acryl-tui         (T010)
7f4a697 feat: wire pi-tui shell over the runtime bridge (T011)
0d8c451 docs: mark m1 ledger tasks T006-T010 complete
5f913be docs: record M1 pi-tui runtime seam and Tomo port checkpoint
7ece18c docs: record tomowang provenance and supersede parallel pi-tui plan
218f31a (user) docs: re-scope runtime surface spec ledger
```

## Commands run (fresh, all pass)

- `corepack pnpm --filter acryl-harness-runtime test` → 11/11
- `corepack pnpm --filter acryl-harness-runtime typecheck` → pass
- `corepack pnpm --filter acryl-harness-runtime build` → pass
- `corepack pnpm --filter acryl-tui test` → 259/259 (190 ported Tomo tests)
- `corepack pnpm --filter acryl-tui typecheck` → pass
- `corepack pnpm --filter acryl-tui build` → pass

## Proven behavior (code + tests)

Bridge opens/resumes a native durable session; `subscribeEvents`/`events`
project the durable log; prompt submission persists and is replayable on resume;
cancellation aborts the turn; `dispose` idles + flushes before releasing handles;
runtime profile boots with the coding-agent rows; the ported presentation/editor
modules render and format deterministically (190 Tomo tests green in ACRYL).

## Not yet proven — TTY gate

The **interactive** full-screen pi-tui loop (`acryl tui` → prompt → streamed
text/tool → Ctrl+C cancel → exit → `--resume`) cannot be exercised from a
non-TTY shell. This is the blocker for:

- **T012** — remove React Ink (explicitly gated "only after pi-tui is
  demonstrably functional"); Ink remains as inert, unreferenced code.
- **T013** — real-TTY smoke + recorded evidence.

## Recommended next step (exact)

Run in a real terminal:

```sh
cd <acryl>
corepack pnpm --filter acryl-harness-runtime run build
corepack pnpm --filter acryl-tui run build
corepack pnpm --filter acryl-tui exec acryl tui
# then: type a prompt, watch stream, Ctrl+C, exit, and
corepack pnpm --filter acryl-tui exec acryl tui --resume <session-id>
```

If that flow works, then remove Ink (T012), record evidence (T013), and proceed
to the `v0.1.0-alpha.1` release ledger (secondary delivery).

## Parity gaps (remaining)

Approvals/questions (in-terminal answerers), overlays (`/model`, `/presets`,
`/trajectory`, `/tools`, `/context`, `/plugins`), plan/goal/compact modes, shell
mode, prompt-history persistence, session picker, and tool-card service lookup
(`getTool`) are wired as inert stubs in the host adapter — to be enabled per
capability in later increments.
