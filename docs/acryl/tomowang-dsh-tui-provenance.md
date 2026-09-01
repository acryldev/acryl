# tomowang/dsh-tui provenance

- **Upstream**: https://github.com/tomowang/dsh-tui
- **Commit**: `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1`
- **Package**: `@tomowang/dsh-tui` 0.7.0, MIT
- **Terminal library**: `@earendil-works/pi-tui` exactly 0.84.2 (normal dependency
  of `acryl-tui`; never vendored, copied, or patched by default)
- **Usage**: M1 terminal surface. ACRYL adapts the upstream terminal presentation
  to the shared runtime semantics; the upstream direct-Cordis bundle is NOT
  shipped unchanged and no submodule is added.

## Retained component inventory (ported into `acryl-tui`)

Presentation core (copied verbatim, import-path adaptations only):

- `src/tui/store.ts` — framework-agnostic durable-log projection; seq-dedupe
  replay boundary; `BlockAssembler` chunk folding; pending tool calls; shell runs.
- `src/render.ts` — `formatEvent`, `formatStreamingText`, `formatPendingToolCalls`,
  `formatToolCardSummary`, `formatReasoningSummary`, markdown-aware rendering.
- `src/markdown.ts` — detect-then-style markdown rendering.
- `src/sessionId.ts` — session id prefix strip/ensure.
- `src/tui/{theme,piTheme,text,liveText,Spinner,bannerText,statsFormat}.ts` —
  pi-tui components and formatting.

Editor and input:

- `src/tui/{CustomEditor,promptAutocomplete,commands,fileMention,fileIndex,
  miniTextField}.ts` — pi-tui Editor subclass, slash-command/@-mention completion.

Application shell:

- `src/tui/TuiApp.ts` — alt-screen `mountTui`, transcript ScrollView, dock VStack,
  overlay router, terminal title.
- `src/tui/actions.ts` — `TuiActions` contract consumed by the shell.

Tests ported alongside: `test/tui/{store,liveText,statsFormat,commands,
fileMention}.test.ts`, `test/{markdown,render}.test.ts` (and trajectory suites
when overlays are ported).

## Feature overlays — NOW ported (was deferred)

The GUI-parity feature overlays originally listed as deferrals are now live in
`acryl-tui/src/tui/{context,agentPresets,plugins,modelProfile,trajectory,toolCards,interaction,login}`
and registered as slash-commands in `src/tui/commands.ts`: `/help /login /logout /model
/trajectory /tools /context /plugins /presets /goal /plan /compact /clear /exit /quit`.
The `TuiApp` routes each via `tui.showOverlay(...)` keyed off
`store.getSnapshot().overlay.kind`, and `ApprovalOverlay` (in `tui/interaction/`)
is the dock-level approval surface. So the pi-tui terminal now exposes the
GUI's interaction model (model/preset selection, trajectory, plugin-tree
inspection, context usage, goal/plan/compact, approvals/questions).

## NOT ported (explicit)

- `src/index.ts` — Tomo's Cordis plugin, direct `ctx.agents` access, and
  in-terminal approval/question answerers. Replaced by `startDirectHost()` +
  `createAcrylSessionBridge()` + the ACRYL host adapter.
- `src/startup.ts` + `cordis.patch.yml` — bundle startup/CLI flags and the
  bundle composition patch. Replaced by `acryl-tui`'s CLI grammar and
  runtime-owned profile composition.
- `src/updateCheck.ts` — npm registry update hint (deferred).

## Divergences ledger

| Area | Upstream | ACRYL adaptation |
|---|---|---|
| Bootstrap | Cordis bundle plugin | `startDirectHost()` sole local bootstrap |
| Session access | `ctx.agents.create/resume` + `ctx.on('session/event')` | `AcrylSessionBridge` (+ incremental event seam) |
| Composition rows | bundle `cordis.patch.yml` | runtime-owned profile rows |
| CLI flags | `dsh-cmdline` + launcher | `acryl-tui/src/cli/grammar.ts` |

*Last updated: 2026-09-01 (overlays verified present; see "Feature overlays"). Update this note with every local divergence.*
