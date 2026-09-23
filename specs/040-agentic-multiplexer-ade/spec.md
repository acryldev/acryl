# Feature Specification: ACRYL Agentic Multiplexer ADE

**Tracking:** to be filed (`acryldev/acryl` issue) when this leaves `needs-triage`

**Feature Branch**: `040-agentic-multiplexer-ade`
**Created**: 2026-09-23
**Status**: needs-triage — this is a synthesis + implementation-shaped spec written from a real product-direction conversation, not yet broken into a `plan.md`'s ordered slices. Read alongside `specs/015-development-canvas` (the existing, shipped P1/P2 canvas this extends) before touching either.
**Authority**: `.specify/memory/constitution.md` (Everything is a plugin; agents disposable, room persistent; compose DSH, don't fork; canonical state durable). `specs/015-development-canvas` (the canvas this milestone grows — its Terminal/File/Browser tile trio and `dsh-plugin-development-canvas`/`acryl-development-canvas` package boundary are the base this spec does not re-litigate). `specs/033-acryl-blends-runtime-contract` and `specs/036-cordis-ecosystem-and-acryl-blends` (the plugin-composition and Blends context this ADE's tiles must stay compatible with). `pi/packages/tui` (`@earendil-works/pi-tui`, read directly, not assumed) as the real substrate for Scope B.
**Input**: user direction, in conversation, 2026-09-23, with two screenshots of `croft` (`github.com/vitali87/croft`, `terminaltrove.com/croft`) and three local design-mockup projects under `ux-ui-design-mockup-acryl/` (`-cli`, `-desktop-and-web`, `-desktop-and-web-v2`, the last of which is the richest and is this spec's primary source for Scope A's concrete component inventory). Explicit ask: plan a full agentic-multiplexer ADE for Desktop/Web competing with Orca (`onorca.dev`), Superset (`superset.sh`), super.engineering, and Nimbalyst (`nimbalyst.com`); separately evaluate recreating croft's TUI-IDE shape in TypeScript on the existing `pi-tui` stack for ACRYL CLI, "not just a minimal coding-agent CLI... a whole IDE (ADE) for agentic development in TUI mode."

## Two scopes, one product thesis

Both scopes are the same claim in two runtimes: **the ADE is the persistent room; every pane — chat, terminal, editor, browser, diff, kanban, doc — is a disposable, closable tile that plugs into an extensible slot.** `specs/015-development-canvas` designed and shipped this thesis once already, but only as a market-example plugin (`cordisplugins/acryl-development-canvas` + `-web`) — checked directly against `apps/acryl-desktop/src/profile.ts`, the real app's advanced mode today runs plain upstream DSH packages, not this system. Scope A's real job is making that design first-party and required, not extending an example. Scope B is the same thesis attempted in a terminal, which no competitor in the brief operates in — it is the differentiated bet, not a port for its own sake.

- **Scope A — Desktop/Web ADE, competitive-parity feature set.** Grow the existing canvas from its shipped three tile kinds (Terminal, File, Browser) to the fuller multiplexer set every competitor in the brief already ships: worktrees, git (staged changes, review threads, checks), a real file editor with search, diffs, a Kanban board keyed to agent-session phase, a doc/spec viewer, and the canvas stays open-ended (a "build a card type" affordance already exists in the v2 mockup — a plugin, scaffolded by an agent, is how the catalog grows, matching Constitution Principle I).
- **Scope B — Acryl CLI as a TUI ADE.** A second, separate surface (not a replacement for the current single-pane `/command`-driven CLI mockup) that recreates croft's VS Code-in-a-terminal shape — multi-pane layout, file tree, embedded terminal panes, diffs — in TypeScript on `pi-tui`, simulating the same room-of-tiles view Desktop has, for operators who live in a terminal and never want to leave one.

---

## Competitive scan (what the four named products all share)

Read as a feature floor, not a spec in itself — this is the set every one of Orca, Superset, super.engineering, and Nimbalyst ships in some form, per the user's own framing, cross-checked against what the richest local mockup (`-desktop-and-web-v2`) already designed for:

| Feature | Already in `specs/015` (shipped) | In the v2 mockup (designed, not built) |
|---|---|---|
| Worktrees / branches, agent-status-aware | No | `LeftRail.jsx`: project → branch tree, per-branch status dot (running/review/idle/clean), last-active time, hover diff stat |
| Git (staged changes, commit box) | No | `RightPanel.jsx` "Changes" tab: per-file status letter, +/- stat, staged count, commit-message box |
| Code review threads | No | `RightPanel.jsx` "Review" tab: file:line-anchored threads, resolved/unresolved |
| CI checks | No | `RightPanel.jsx` "Checks" tab: pass/fail/running per check |
| File editor with search | Partial (File tile has no search) | `CodeEditor.jsx` (tile), `RightPanel.jsx` "Files" tab (tree, filterable) |
| Diffs | No | `DiffView.jsx` tile kind, explicitly "side-by-side or inline" |
| Development canvas w/ agents + chat | Yes (Chat tile) | `ChatSession.jsx` tile kind, `agentTabs` model |
| Browser tabs | Yes (Browser tile) | `BrowserCard.jsx`, description explicitly says "Embedded web with Design Mode" — ties directly to the already-parked `specs/039-visual-mount-anchors` |
| Kanban board | No | `KanbanCard.jsx` tile kind, "Sessions by phase" |
| Doc viewer | No | `SpecDoc.jsx` tile kind |
| Terminal(s) | Yes (Terminal tile) | `TerminalCard.jsx` (tile) **and** `TerminalStrip.jsx` (persistent bottom dock, separate from tiles) |
| Extensible tile catalog | Yes (canvas-card slot exists) | `CanvasAddPicker.jsx`: 9 named kinds (terminal, editor, browser, diff, agent, kanban, diagram, spreadsheet, mockup) plus an explicit "Build a card type / Agent scaffolds a plugin" row, footer text "N of 58 UI slots · canvas-card slot is extensible" |

Two kinds in the mockup catalog are **not** part of this milestone and are called out explicitly so they are not silently promised: **ER/Diagram** and **Spreadsheet/UI-Mockup** tiles are real, named ideas in the mockup but have no upstream source, no existing library primitive, and no requirement below — same posture this project already takes with Chart/Form in `specs/038-ui-component-library` (a real idea, explicitly not in this slice, not silently dropped).

---

## Scope A — Desktop/Web ADE

### User Scenarios & Testing *(mandatory)*

#### User Story A1 - Worktree-aware sidebar replaces the flat session list (Priority: P1)

Today's advanced-mode shell has no persistent, git-aware navigation rail. A developer opens Desktop and sees, in one glance, every project, every branch/worktree under it, which ones an agent is actively running in (a pulsing status dot), which are in review, which are idle, and — on hover — the live diff stat for that branch, without opening a tile.

**Why this priority**: every competitor named in the brief leads with this. Without it, "worktrees" is a word in this spec, not a feature.

**Independent Test**: mount the rail against a fixture of 2 projects × 3 branches each with mixed statuses; assert status dots render the right color per fixture state, assert branch search filters the tree, assert selecting a branch is the thing that changes which worktree the rest of the canvas (tiles, terminal, editor) is scoped to.

**Acceptance Scenarios**:

1. **Given** the ADE shell, **When** it loads, **Then** a left rail shows every known project, each expandable to its branches/worktrees, with a live status dot per branch sourced from real agent-session state (not a mock).
2. **Given** the rail, **When** the user types in the branch filter, **Then** only matching branches remain visible, across all expanded projects.
3. **Given** the rail, **When** the user selects a different branch, **Then** every open tile that is worktree-scoped (editor, terminal, diff, git panel) re-scopes to that worktree's working directory; tiles that are not worktree-scoped (a standalone browser tab) do not move.
4. **Given** a branch with no live agent session, **When** its status is computed, **Then** it renders `idle` or `clean` (never a stale `running` dot after the agent session actually ended).

---

#### User Story A2 - Git/Review/Checks panel (Priority: P1)

A right-hand panel with four tabs — Files, Changes, Review, Checks — gives the same at-a-glance git awareness the rail gives for branches, but scoped to the *current* worktree's working tree: staged/unstaged file list with per-file +/- stats, a commit-message composer, inline code-review threads anchored to file:line, and CI check status.

**Why this priority**: this is the other half of "git" from the competitive floor, and it is what makes the canvas usable as a review surface, not just an editing surface.

**Independent Test**: fixture a worktree with 3 changed files, 2 review threads (1 resolved), 3 checks (1 running). Assert each tab's badge count matches the fixture. Assert clicking a changed file opens/focuses that file's editor tile.

**Acceptance Scenarios**:

1. **Given** the panel's Files tab, **When** the user clicks a file, **Then** an editor tile for that file opens or focuses (reusing `specs/015`'s existing "one tile per open path" behavior, not creating a duplicate).
2. **Given** the panel's Changes tab, **When** the current worktree has staged changes, **Then** each changed file shows its status letter (M/A/D/R), +/- stats, and the tab header shows the total changed-file count.
3. **Given** the panel's Review tab, **When** a thread is unresolved, **Then** it is visually distinct from a resolved one and both are anchored to a real `file:line`, not free text.
4. **Given** the panel's Checks tab, **When** a check is `running`, **Then** its icon animates and updates to `pass`/`fail` without a manual refresh.

---

#### User Story A3 - Diff tile (Priority: P1)

A canvas tile kind, addable from the existing "+" picker (`specs/015`'s `CanvasAddPicker`, now growing its catalog), that renders a real diff — side-by-side or inline, toggle between the two — for a file, a commit, or the whole worktree's pending changes.

**Why this priority**: diffs are the connective tissue between "an agent changed something" and "a human decides whether that's right." Every competitor treats this as core, not optional.

**Independent Test**: open a Diff tile against a fixture file with known added/removed lines; assert both view modes render the same logical diff; assert closing and reopening the tile against the same path does not duplicate a tile (same rule as File tiles today).

**Acceptance Scenarios**:

1. **Given** the "+" picker, **When** the user chooses Diff, **Then** a tile opens showing the current worktree's full pending diff by default.
2. **Given** an open Diff tile, **When** the user toggles side-by-side/inline, **Then** the same diff renders in the chosen layout without reloading.
3. **Given** a Diff tile opened from a specific Changes-panel file row, **When** it opens, **Then** it scopes to that one file, not the whole worktree.

---

#### User Story A4 - Kanban tile keyed to agent-session phase (Priority: P2)

A tile kind showing sessions/tasks as cards on a board, columns keyed to phase (e.g., queued → running → review → done), sourced from real session/task state, not a static mock.

**Why this priority**: this is the piece that turns "a canvas of tiles" into "a room you can run a multi-agent workflow from," which is the actual product thesis (`specs/036`), not just a feature checklist item. P2 because A1-A3 are the floor; Kanban is differentiating on top of it.

**Independent Test**: fixture 4 sessions across 3 phases; assert the board renders one card per session in the right column; assert a session's phase transition (fixture-driven) moves its card without a full board re-render.

**Acceptance Scenarios**:

1. **Given** a Kanban tile, **When** it opens, **Then** columns are populated from real session/task phase state.
2. **Given** a session changes phase, **When** the board is open, **Then** the card moves columns live.
3. **Given** a card, **When** clicked, **Then** the corresponding Chat/Agent tile opens or focuses.

---

#### User Story A5 - Doc/Spec viewer tile (Priority: P2)

A tile kind that renders a markdown doc (a `spec.md`, `plan.md`, `README`) read-only with real markdown rendering, distinct from the File tile's editable buffer.

**Why this priority**: this project's own artifacts (specs, ADRs, handoffs) are exactly the kind of thing worth reading inside the same room an agent is working in, rather than context-switching to a separate app.

**Independent Test**: open a Doc tile against a real `specs/*/spec.md`; assert headings, tables, and code fences render correctly; assert it is not editable (no keystroke mutates the source file).

**Acceptance Scenarios**:

1. **Given** the "+" picker, **When** the user chooses Doc, **Then** a file picker scoped to markdown files opens, and the chosen file renders read-only.
2. **Given** a Doc tile, **When** the source file changes on disk (an agent edits it), **Then** the tile reflects the update live or on next focus, at minimum not silently going stale forever.

---

### Edge Cases (Scope A)

- Rail status dots must never show `running` for a session that has actually exited — status must derive from real session lifecycle events, not a client-side timer.
- Switching worktrees while a Terminal tile has a live child process: the existing tile does not silently re-target; either it stays scoped to its original worktree or it is explicitly closed — never a process whose cwd silently diverges from what the tile displays.
- A Diff tile against a file that no longer exists (deleted since the tile opened) shows an explicit "file removed" state, not a crash or blank pane.
- Two Diff tiles against the same path do not duplicate (same one-tile-per-target rule as File tiles).
- Kanban board with zero sessions shows a calm empty state, same posture as the existing empty-canvas state in `specs/015`.

### Requirements *(mandatory)*

- **FR-A001**: The advanced-mode shell MUST present a worktree-aware left rail (project → branch tree) sourced from real project/worktree state, replacing or subsuming today's flat session list.
- **FR-A002**: Each branch/worktree row MUST show a live status derived from real agent-session lifecycle state (not a client-side mock or stale timer).
- **FR-A003**: Selecting a branch/worktree in the rail MUST re-scope every worktree-bound open tile to that worktree.
- **FR-A004**: A right-hand panel MUST provide Files, Changes, Review, and Checks tabs, each sourced from real git/CI state for the current worktree.
- **FR-A005**: The canvas "+" picker MUST grow to include Diff, Kanban, and Doc tile kinds, contributed the same way Terminal/File/Browser already are — as canvas-card slot entries, not a shell-level special case.
- **FR-A006**: Diff tiles MUST support both side-by-side and inline layouts and MUST follow the existing one-tile-per-target de-duplication rule.
- **FR-A007**: Kanban tiles MUST derive columns and cards from real session/task phase state and MUST update live on phase transitions.
- **FR-A008**: Doc tiles MUST render markdown read-only and MUST NOT be able to mutate the source file.
- **FR-A009**: Every new tile kind and the rail/panel MUST be expressed as Cordis plugin contributions (Constitution Principle I) — no new privileged, non-pluginized shell path.
- **FR-A010**: None of Scope A's new surfaces MAY appear in compatibility mode, matching `specs/015`'s existing FR-002.
- **FR-A011**: ER/Diagram, Spreadsheet, and UI-Mockup tile kinds from the mockup catalog are explicitly OUT of this milestone's requirements — named in `CanvasAddPicker`'s design, not committed here.

### Success Criteria *(mandatory)*

- **SC-A001**: A developer can go from "open Desktop" to "see every worktree's live agent status" in under 5 seconds, with zero manual refresh.
- **SC-A002**: A developer can review a change end-to-end (open Changes tab → open Diff tile → open Review thread → write a commit message) without leaving the canvas.
- **SC-A003**: 100% of status dots in a headless test suite match the fixture's real session lifecycle state, including the transition to idle after a session ends.
- **SC-A004**: Adding Diff, Kanban, and Doc to the "+" picker requires zero changes to the picker's own shell code — only new canvas-card slot contributions (proves FR-A005/A009 are real, not aspirational).

---

## Scope B — Acryl CLI as a TUI ADE

### Grounding: what's real, checked directly, not assumed

**croft's actual feature set** (`github.com/vitali87/croft`, fetched 2026-09-23): three-pane VS Code-style layout (Explorer / Editor / Panel-with-tabs) with an activity bar switching Explorer, Search, Source Control, Remote (SSH), Run/Debug, Extensions, Testing; tree-sitter syntax highlighting; full LSP (completion, hover, go-to-def, rename, quick fixes, inlay hints); multi-cursor; minimap; git gutter + inline blame + commit graph; a real terminal with splits, shell integration, and durable history; a test explorer; zero-config task runner; DAP debugging (Python/JS-TS/Rust/C/C++); file/PDF/spreadsheet preview; persistent sessions with collaboration (`croft attach`); remote execution over SSH (`croft remote`). Rust, single static binary, explicitly positioned as "a complete VS Code replacement in the terminal."

**`pi-tui`'s actual current capabilities** (`pi/packages/tui`, `@earendil-works/pi-tui`, read directly, not assumed): differential rendering with synchronized (flicker-free) output; `TuiMainScreen` and `TuiAltScreen` (application-owned viewport with mouse/trackpad/keyboard scrolling) behind one `TUI` interface; layout primitives (`VStack`, `HStack`, `Box`, `ScrollView`, `Spacer`, `MouseRegion`); a genuinely capable `Editor` component (undo stack, kill-ring, word navigation, autocomplete for file paths and slash commands); `SelectList`, `SettingsList`, `Markdown`, `Loader`; inline image rendering via Kitty/iTerm2 graphics protocols; bracketed-paste handling for large pastes; native modules per-platform (darwin/linux/win32) for clipboard and low-level terminal control.

**What `pi-tui` does NOT yet have, checked directly, not assumed**: no embedded child-PTY-in-a-sub-region primitive (no `node-pty`-style dependency anywhere in the package; `ProcessTerminal` controls the *host* terminal pi-tui itself runs in, which is a different problem from rendering an *interactive nested terminal pane*, the thing a real "Terminal" tile needs); no tree-sitter or LSP client integration; no multi-pane split-with-resize layout manager (the existing `Box`/`Stack` primitives are single-region containers, not a resizable pane tree); no file-tree component; no diff-rendering component; no git integration at all.

This is the honest floor for Scope B: **the text-editing, rendering, and single-region-layout substrate is real and reusable; the specifically multi-pane, terminal-in-terminal, and language-intelligence pieces are net-new engineering, not "mostly there already."** Any plan that treats this as a thin wrapper over existing pi-tui primitives is wrong; a plan that treats it as starting from zero is also wrong. Both are checked facts above, not guesses.

### User Scenarios & Testing *(mandatory)*

#### User Story B1 - Toggle from single-pane CLI to multi-pane TUI ADE (Priority: P1)

Today's CLI mockup (`ux-ui-design-mockup-acryl-cli`) is a single-pane transcript with slash commands and modal popups (files/market/plugins/trajectory/model) — a real, already-designed baseline, not something this milestone replaces. Scope B adds a **second mode**, entered explicitly (a flag or in-session command), that replaces the single transcript with a croft-shaped multi-pane layout: a file-tree sidebar, an editor region, a bottom terminal-tab strip, and the existing chat/transcript as one pane among several rather than the whole screen.

**Why this priority**: without this toggle existing and being trivially reversible, Scope B is a rewrite of the CLI, not an addition to it — and the existing single-pane mockup remains the right default for a quick terminal session.

**Independent Test**: launch in default mode, confirm today's transcript UI; send the mode-switch command; confirm the multi-pane layout replaces it with no data loss (transcript history is still reachable as a pane); switch back; confirm return to the exact prior state.

**Acceptance Scenarios**:

1. **Given** the CLI in default mode, **When** the user issues the ADE-mode command, **Then** the screen reflows to a multi-pane layout without losing the current session's transcript.
2. **Given** ADE mode, **When** the user issues the exit-ADE-mode command, **Then** the screen returns to the single-pane transcript, scrolled to where it left off.
3. **Given** either mode, **When** a session is durably logged (per Constitution Principle IV), **Then** switching modes never loses or duplicates a logged event.

---

#### User Story B2 - Resizable multi-pane layout with a file tree and terminal tabs (Priority: P1)

Inside ADE mode: a left file-tree pane (open/expand directories, open a file into the editor pane), a main editor pane, and a bottom terminal strip that can hold multiple terminal tabs — each a real, independently-interactive embedded PTY, not a read-only log tail.

**Why this priority**: this is the actual "croft in TypeScript" claim. Without a real nested interactive terminal, this is a file browser with a chat window, not an IDE.

**Independent Test**: open ADE mode against a fixture directory tree; expand/collapse nodes; open a file into the editor; open two terminal tabs, run a command that produces known output in each, switch focus between them, confirm each tab's output and scrollback are independent and correct; resize a pane boundary and confirm content reflows without corruption.

**Acceptance Scenarios**:

1. **Given** the file tree, **When** the user opens a file, **Then** its contents load into the editor pane, reusing `pi-tui`'s existing `Editor` component rather than a new one.
2. **Given** the terminal strip, **When** the user opens a new terminal tab, **Then** a real child PTY starts, scoped to the current worktree's cwd, with independent scrollback from any other open tab.
3. **Given** two terminal tabs with live processes, **When** the user closes one, **Then** only that tab's process is disposed; the other is unaffected.
4. **Given** a pane boundary, **When** the user drags or keyboard-resizes it, **Then** every pane's content re-renders correctly at the new size, with no torn/partial frames (this is exactly what `pi-tui`'s differential/synchronized rendering exists to guarantee, and the acceptance check for that guarantee holding under a real resize).

---

#### User Story B3 - Diff and git-status panes in the TUI (Priority: P2)

A pane (or a mode of the file tree) showing changed files with status letters, and a diff view for a selected file — the TUI equivalent of Scope A's Changes tab and Diff tile, same underlying git data source.

**Why this priority**: git-awareness is core to the competitive floor in both surfaces; P2 because B1/B2 (mode toggle, real panes, real embedded terminals) have to exist first.

**Independent Test**: fixture a worktree with known changed files; assert the git-status pane lists them with correct status letters; assert selecting one renders a correct diff in the diff pane.

**Acceptance Scenarios**:

1. **Given** ADE mode, **When** the user opens the git-status pane, **Then** it lists changed files sourced from the same real git state Scope A's Changes tab uses (one data source, two renderers).
2. **Given** a changed file selected in that pane, **When** the diff pane opens, **Then** it shows a correct, real diff, rendered with terminal-safe formatting (added/removed line markers, not reliant on GUI color alone).

---

### Edge Cases (Scope B)

- A terminal tab's child PTY MUST be disposed when its tab closes, when ADE mode is exited, and when the CLI process itself exits — no orphaned processes in any of the three paths (mirrors `specs/015`'s FR-007/FR-011 for the Desktop canvas, same law, different surface).
- Resizing a pane below a usable minimum must clamp, not render a negative-space or corrupted frame.
- A terminal in the terminal strip that has never received a resize event (freshly opened, pane not yet laid out) must not crash on first output.
- Switching worktrees inside ADE mode: file tree, editor, and terminal strip re-scope together, or ADE mode requires an explicit close-and-reopen — this milestone does not require silent live re-scoping the way Scope A's rail does; state which one is chosen before implementation (open question below).
- A terminal that does not support Kitty/iTerm2 graphics or truecolor must degrade to a plain-text-safe rendering, not fail to start.

### Requirements *(mandatory)*

- **FR-B001**: The CLI MUST offer an explicit, reversible mode switch between today's single-pane transcript UI and a multi-pane ADE UI, with no data loss on either transition.
- **FR-B002**: ADE mode MUST provide a file-tree pane, an editor pane (built on `pi-tui`'s existing `Editor` component), and a terminal strip supporting multiple independent tabs.
- **FR-B003**: Each terminal tab MUST run a real, independently-interactive child PTY, scoped to a worktree's working directory, with disposal guaranteed on tab close, ADE-mode exit, and process exit.
- **FR-B004**: Pane boundaries MUST be resizable, and every pane MUST re-render correctly (no torn frames) after a resize, verified against `pi-tui`'s synchronized-output guarantee.
- **FR-B005**: A git-status pane and a diff pane MUST exist, sourced from the same real git data Scope A's equivalents use.
- **FR-B006**: ADE mode's session log MUST remain durable and agent-independent per Constitution Principle IV regardless of which mode is active at any given moment.
- **FR-B007**: Terminal-in-terminal PTY embedding MUST be implemented as a new, explicitly-scoped addition to `pi-tui` (or a sibling package), not bolted directly onto the CLI's own process/rendering loop — keeping the reusable-library boundary `pi-tui` already has.
- **FR-B008**: Tree-sitter syntax highlighting and LSP integration are explicitly OUT of this milestone's requirements — named as the reason croft is a "complete VS Code replacement" and ACRYL's TUI ADE, in this slice, is not attempting parity on that specific axis. State this to the user as a real scope cut, not a silent omission.

### Success Criteria *(mandatory)*

- **SC-B001**: A user can switch into ADE mode, open a file, open two terminal tabs, run a real command in each, and switch back to single-pane mode, all within one session, with zero crashes and zero orphaned processes (checked via process-table inspection in tests, not assumption).
- **SC-B002**: Resizing any pane boundary 20 times in a row in a headless render-loop test produces zero corrupted frames.
- **SC-B003**: The git-status and diff panes show data identical to Scope A's equivalents when pointed at the same worktree (proves the "one data source, two renderers" claim in FR-B005 is real).

---

## Key Entities (both scopes)

- **Worktree**: a git working tree bound to a branch; the unit both the Desktop rail and the CLI's ADE-mode scope tiles/panes to.
- **Tile** (Scope A, extends `specs/015`'s existing entity): closable canvas pane; kind now includes `diff`, `kanban`, `doc` alongside the shipped `chat`, `pty`, `file`, `browser`.
- **Pane** (Scope B, new entity, the TUI analog of Tile): a resizable region in the ADE-mode layout tree; kind includes `file-tree`, `editor`, `terminal`, `git-status`, `diff`.
- **PTY session**: Host-owned (Scope A) or `pi-tui`-owned (Scope B) child process bound to one Terminal tile/pane; disposed with its tile/pane or the owning fiber/mode.
- **Session/task phase**: the state a Kanban card and a rail status dot both derive from — one real source, two presentations.

## Assumptions

- Scope A adapts the design and Cordis Fiber-ownership pattern already worked out in `specs/015-development-canvas` and its reference plugin (`cordisplugins/acryl-development-canvas` + `-web`) — activation transactionality and the compatibility-mode boundary are proven patterns to reuse, not re-derive — but ships as a new first-party package required in advanced mode, replacing the upstream `dsh-client-ui-sidebar`/`dsh-client-ui-conversation` rows, not as a change to the reference plugin itself.
- Scope B is additive to the existing single-pane CLI mockup, not a replacement — both are real, both stay.
- "Blend" in the user's framing is used loosely for "the whole product effort," not a claim that this ADE is itself an ACRYL Blends artifact (`specs/036`); if the intent was the latter, that needs its own explicit decision before implementation.
- ER/Diagram, Spreadsheet, UI-Mockup tile kinds (Scope A) and tree-sitter/LSP (Scope B) are named, real ideas from the source material, explicitly cut from this milestone's requirements, not silently dropped — same posture as Chart/Form in `specs/038`.
- Real session/task-phase state (Kanban, status dots) is assumed to already exist somewhere in DSH's session model (`ctx.sessions`, `ctx.agentTeams` per the Constitution's list of seams to reuse); this spec does not yet confirm the exact seam — that is Scope A's first open question below.

## Open Questions (not answered here — resolve before `plan.md`)

1. **Scope A or Scope B first?** Scope A extends a shipped, well-understood surface; Scope B is a genuinely new surface with the single hardest unknown (embedded PTY-in-TUI-pane rendering) in the whole spec. Worth a spike on that one unknown, isolated, before committing either scope's ordering.
2. **Which real DSH seam backs "session/task phase" for Kanban and rail status dots?** Named as an assumption above, not yet confirmed against real `ctx.sessions`/`ctx.agentTeams` shape.
3. **Scope B worktree re-scoping**: silent live re-scope (matching Scope A's rail) or explicit close-and-reopen? Flagged as an edge case above, deliberately left open.
4. **Does Scope B ship as part of `acryl` CLI directly, or as a separate, optionally-installed surface** (the user's own "we can experiment and even maybe make it a separate surface" framing) — affects packaging, default-on/off, and how much of FR-B008's cut scope is ever revisited.
5. **Kanban/Diagram/Spreadsheet tile provenance**: are these to be built ACRYL-native, or is there a real shadcn/ui or third-party source to port from, matching the discipline `specs/038` already established for every other component in this library? Not researched in this pass.
