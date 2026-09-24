# Implementation Plan: ACRYL Agentic Multiplexer ADE

**Branch**: `040-agentic-multiplexer-ade` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/040-agentic-multiplexer-ade/spec.md`

## Summary

Two scopes, sequenced independently because they share a thesis but not a codebase. **Scope A** brings ACRYL's own workspace shell into the real, shipped app for the first time — today's advanced mode runs plain upstream DSH packages (checked directly in `apps/acryl-desktop/src/profile.ts`), not the tile/canvas system `specs/015` designed. That design (and its reference implementation, `cordisplugins/acryl-development-canvas` + `-web`, a market-example plugin) is the pattern to build from, not a repo to keep extending. This milestone builds a new first-party package, required in advanced mode the same way `@acryl/ui` already is, with the competitive-floor tile set: a worktree-aware rail, a git/review/checks panel, and three new tile kinds (Diff, Kanban, Doc) alongside the reference plugin's Chat/Terminal/File/Browser four. **Scope B** is new: a second, explicitly-toggled mode for ACRYL CLI that recreates croft's multi-pane TUI-IDE shape on `pi-tui`, gated on one real unknown (embedded interactive child-PTY rendering inside a `pi-tui` sub-region) that does not exist in the library today and must be spiked before the rest of Scope B is planned in task-level detail.

## Technical Context — Scope A

**Language/Version**: TypeScript 5, Node `^22.19.0 || >=24.0.0`, React (Desktop/Web Client)

**Primary Dependencies**: same as `specs/015`: `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-slots`, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`. New for this scope: `@acryl/ui`'s already-shipped `Table`, `InputGroup`, `ScrollArea`, `Sidebar` (T045, `specs/038`) are the real, verified-in-browser building blocks for the rail and panel — this milestone should consume them, not re-invent a file tree or a scrollable sidebar from scratch. A real diff-rendering library (not yet chosen — open question in `spec.md`) is a new dependency.

**Storage**: Rail status and Kanban phase read from real session/agent-team state (seam TBD, `spec.md` open question 2); no new durable store proposed here — reuse whatever `ctx.sessions`/`ctx.agentTeams` already persists.

**Testing**: Vitest headless, matching `specs/015`'s own bar: fixture-driven status-dot correctness (including the stale-`running` edge case), tile de-duplication, PTY disposal on worktree switch.

**Target Platform**: same as `specs/015` — Desktop advanced mode, macOS/Windows first. Web parity is a real target per the user's "Desktop/Web" framing but is not separately gated in this plan; the Client-side pieces (rail, panel, tiles) are plain React/Cordis-Client and should work on Web wherever the Canvas package itself already does.

**Constraints**: corrected after user review (2026-09-23) — `cordisplugins/acryl-development-canvas` and `-web` are a **reference example** of the Cordis plugin pattern, not the real target. Checked directly against the actual shipped app (`apps/acryl-desktop/src/profile.ts`): advanced mode today runs **pure upstream DSH packages** in the `ui-sidebar` and `ui-conversation` rows (`@deepseek-ai/dsh-client-ui-sidebar`, a plain session list; `@deepseek-ai/dsh-client-ui-conversation`, plain chat) — there is no ACRYL-owned canvas/tile system active in production at all right now. This milestone's real job is to give ACRYL its own first-party workspace shell for the first time, as a **required** row in that same composition — the exact pattern `apps/acryl-desktop/src/profile.ts` already uses for `@acryl/ui` (`UI_LIBRARY_ROW_ID`), the extension-context pack, and the system-prompt package: `patches.push({ insert: [{ id: ROW_ID, name: PACKAGE }] })`, resolved from this new package's own dependency closure, not a market-optional install. The `ui-sidebar` and `ui-conversation` rows get replaced by ACRYL-owned equivalents; `cordisplugins/acryl-development-canvas`'s tile-state-machine code is a legitimate pattern to read and adapt, not a repo to keep extending.

**Scale/Scope**: same order of magnitude as `specs/015` — tens of tiles, single-digit-to-low-dozens of worktrees per project, not hundreds.

## Technical Context — Scope B

**Language/Version**: TypeScript, on `pi`'s existing toolchain (`pi/tsconfig.base.json`, its own build scripts) — this is a `pi-tui`/`pi` ecosystem addition, not an `acryl` repo package, since the CLI mockup and the TUI substrate both live in the `pi` workspace family per the user's own framing ("our current pi-tui existing stack").

**Primary Dependencies**: `@earendil-works/pi-tui` (`pi/packages/tui`) for rendering/layout/editor primitives, confirmed real and reusable (see spec.md's grounding section). **Net-new**: a PTY-embedding layer — most likely `node-pty` (the same dependency Scope A's Terminal tiles already use, so the two scopes would share a battle-tested primitive rather than each choosing independently) wired into a new `pi-tui` sub-region renderer that forwards ANSI output into a pane's render buffer and forwards resize/input events to the child process. This is genuinely new code; nothing in `pi-tui` today does this (checked directly).

**Storage**: same durability law as Scope A (Constitution Principle IV) — ADE-mode session activity is still logged through whatever `pi`'s coding-agent package already uses for durable session history; mode-switching must not create a second, divergent log.

**Testing**: `pi`'s existing `node --test` harness (per `packages/tui/package.json`'s own `test` script) for the new pane-resize/PTY-disposal primitives; needs a process-table-inspection-capable test (matching the spec's SC-B001) to actually prove zero orphaned child processes, not just assert a promise resolved.

**Target Platform**: wherever `pi`/ACRYL CLI already runs — the native modules `pi-tui` already ships per-platform (darwin/linux/win32) set the real platform floor; PTY embedding must clear the same bar or explicitly narrow it.

**Constraints**: `pi-tui` is a published package (`@earendil-works/pi-tui`) with its own versioning and its own README/API surface — this milestone's PTY-embedding work should land as a new, clearly-scoped export of that package (or a sibling package under `pi/packages/`) rather than a fork, matching Constitution Principle III's "compose, don't fork" law applied to this library too, even though it's not DSH itself.

**Scale/Scope**: one ADE-mode session at a time, a handful of terminal tabs — this is a single-operator terminal tool, not a multi-window desktop shell; do not scope-creep it toward session-multiplexing across windows (that is tmux/croft's `attach`/`remote` territory, explicitly out per FR-B008's sibling cuts).

## Constitution Check

- **Everything is a plugin** (Scope A): every new surface (rail, panel, Diff/Kanban/Doc tiles) is a canvas-card slot contribution or a sibling Client contribution, same pattern `specs/015` already proved. PASS by construction, contingent on actually following FR-A005/A009 rather than special-casing the rail in the shell.
- **Everything is a plugin** (Scope B): less directly applicable — `pi`/ACRYL CLI is not a Cordis host today. TRANSITIONAL: this plan does not require Scope B to become Cordis-pluginized to ship: it should stay internally modular (a pane-kind registry, mirroring the Tile-kind pattern) even without Cordis, so a future Cordis-on-CLI effort is not blocked.
- **Agents disposable / room persistent**: both scopes' PTY sessions die with their tile/pane, never outlive it. Directly testable (SC-A00x process checks are implicit in `specs/015`'s existing suite; SC-B001 makes it explicit for Scope B).
- **Compose DSH, do not fork**: Scope A reuses `specs/015`'s existing DSH seams unchanged. Scope B is explicitly outside DSH (it's the `pi` ecosystem) — the applicable law is the adjacent one (compose `pi-tui`, do not fork it), honored by FR-B007.
- **Canonical state durable and agent-independent**: both scopes must not let a UI-only construct (a tile, a pane, a mode switch) become the only record of something that happened — FR-B006 states this explicitly for Scope B because mode-switching is new and durability could silently regress there; Scope A inherits `specs/015`'s already-accepted in-memory-canvas-snapshot posture (not yet durable, documented there, not re-litigated here).
- **Generated capabilities outside kernel**: N/A for this milestone's hand-authored surfaces; becomes directly relevant the moment "Build a card type / Agent scaffolds a plugin" (already named in the v2 mockup's `CanvasAddPicker`) is implemented — that is a natural, real follow-on to this milestone, not part of it.

## Project Structure

### Documentation (this feature)

```text
specs/040-agentic-multiplexer-ade/
├── spec.md
├── plan.md              (this file)
├── research.md          (not yet written — open questions in spec.md feed it)
├── data-model.md         (not yet written — Tile/Pane/PTY-session shape, extending specs/015's)
├── design/               (UX prototypes, decisions, cordis-mini-design.md for slice 1)
├── parity-plan.md        (Orca/Nimbalyst feature parity, decisions of 2026-09-24)
├── tasks.md              (slice 1 only; written 2026-09-24. Open question 2 (session/phase seam) is still open and blocks the rail and attention queue, not slice 1)
```

### Source code — Scope A (first-party, inside this workspace — corrected 2026-09-23)

```text
plugins/acryl-workspace/             # NEW first-party package (name TBD) — required advanced-mode row,
  cordis.patch.yml                   # not a market-optional install
  src/index.ts                       # Host: registers as required ui-sidebar + ui-conversation replacement
  src/client/index.ts
  src/client/workspace/
    state.ts                        # tile/pane state machine — pattern read from
                                     # cordisplugins/acryl-development-canvas's state.ts, not copied wholesale
    rail/                           # worktree-aware left rail (replaces dsh-client-ui-sidebar's row)
    panel/                          # Files/Changes/Review/Checks right panel
    tiles/chat|pty|file|browser/    # ported from the reference plugin
    tiles/diff/                     # new
    tiles/kanban/                   # new
    tiles/doc/                      # new
  tests/
apps/acryl-desktop/src/profile.ts   # MODIFIED: 'ui-sidebar'/'ui-conversation' rows point at the new
                                     # package instead of the upstream DSH defaults, in advanced mode
```

### Source code — Scope B (in `pi/packages/`)

```text
pi/packages/tui/
  src/                              # existing — Editor, layout primitives, reused as-is
pi/packages/tui-pty/                # NEW package (or a new export of tui/ — decide in research.md)
  src/pty-pane.ts                   # embeds a child PTY's output into a pi-tui sub-region
  src/pty-pane-resize.ts            # forwards pane resize -> PTY resize
pi/packages/coding-agent/
  src/modes/ade/                    # NEW: the ADE-mode layout tree, file tree, pane registry, mode toggle
```

## Phase 0 / Phase 1

Not yet written. Per this repo's own process (`specs/README.md`): resolve `spec.md`'s five open questions first (especially open question 1 — Scope A-or-B-first — and the Scope B PTY-embedding spike), then produce `research.md` (the PTY-embedding spike's findings belong here), `data-model.md` (Tile/Pane/PTY-session shapes for both scopes), and only then `tasks.md`. Writing `tasks.md` before the PTY-embedding unknown is spiked would produce task estimates for Scope B's hardest piece that are guesses dressed as a plan — worth naming plainly rather than doing.
