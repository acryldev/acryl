# ACRYL ADE — CLI/TUI mockup brief for a design agent (Claude Design / Lovable)

Companion document to `acryl-ui-design-system.md` in this same folder (the
Desktop/Web brief). This one is the **CLI/TUI-specific** version: same
product, same underlying features, reworked entirely for a **terminal**
surface. Two real screenshots of ACRYL's actual running CLI sit in
`uiref/cli-tui-uiref/` next to this file — study them first; they are not
inspiration, they are the current, real, shipping product.

Do not treat this as "the Desktop brief with a dark terminal skin." A
terminal has a fundamentally different interaction model — no floating
windows, no drag targets, no mouse-first hover states, one character grid,
keyboard-only navigation, ANSI color instead of a token/gradient system.
Design *for that model*, the way the two reference screenshots already do.

---

## 1. What you're designing

ACRYL's **CLI** is one of the product's three surfaces (alongside Desktop
and Web — see the companion brief for those), and it is deliberately the
**minimal, lightweight one**: no Electron shell, no browser engine, no GUI
frame — a real terminal-native TUI, fast to start, fast to render, usable
over SSH with zero graphics stack. But "minimal" describes its *footprint*,
not its *feature set*: the design goal is to pack in everything meaningful
from the full ACRYL Agentic Development Environment (ADE) — self-authoring,
plugin marketplace, trajectory inspection, multi-surface awareness — using
a purely text/keyboard-driven vocabulary.

Mock up the **actual CLI product**: a real terminal window, real monospace
type, real ANSI-safe color, real keyboard-only flows. The output should
read as screenshots of a working terminal session, not a GUI mockup with a
terminal font applied.

---

## 2. Product philosophy for this surface specifically

### 2.1 Minimal footprint, maximal capability

No window chrome beyond the terminal emulator's own title bar. No mouse
dependency (every screenshot in `uiref/cli-tui-uiref/` shows a footer hint
line like `↑↓/jk move · →/enter open · esc close · type to filter` —
keyboard is the only required input device). Startup is fast and the first
frame a user sees (both reference screenshots) is an ASCII/pixel-art ACRYL
mark, the active provider/model, the working directory, and a build
stamp — oriented, not decorated.

### 2.2 Convention over configuration, with a real starter (same as Desktop/Web)

The CLI ships with a complete default command set from first launch (see
§3.2's real command list) — a developer never needs to configure anything
to get a working agent session with file browsing, git awareness, and
provider management. Same principle as the GUI surfaces, expressed as a
slash-command palette instead of a sidebar.

### 2.3 Extreme extensibility — visible even in a terminal

The stem-cell/Blend growth model (see the companion brief §2.2) applies
identically here: `/plugins` shows the live-loaded plugin tree, `/market`
opens the plugin marketplace **from inside the terminal**, and an agent can
write, install, and hot-reload its own plugins in the same session — all of
it representable in text. Design the CLI so this reads as clearly as it
does in the GUI: a plugin tree with provenance, a live "building a plugin
now" status line, a market browser with the same install/provenance
information the Desktop/Web market surface has, just rendered as list rows
and box-drawing characters instead of cards.

---

## 3. What ACRYL's CLI has today — grounded in the real product

### 3.1 Startup and session-orientation screen (`uiref/cli-tui-uiref`, screenshot 1)

- ACRYL pixel-art mark (a generated half-block ANSI logo — see
  `apps/acryl-cli/src/tui/logoArt.generated.ts` — this is a real rendered
  asset, not a placeholder) plus the wordmark rendered the same way.
- Orientation header directly under the mark: active provider/model
  (`deepseek-official/deepseek-flash`), working directory (full path), a
  build stamp (short commit hash + time).
- The agent's own **first response is self-orienting**: in the reference
  screenshot the agent describes what it can do in *this* repo, groups its
  available skills by purpose (This repo/Cordis, Code quality, Codebase
  understanding, Planning/specs, Design/frontend, Ops/tooling — with real
  skill names as inline links), and proposes next steps. Design this
  first-response moment as a real, dense, information-rich screen — not a
  one-line greeting.
- A persistent **session status line** just above the input: session id,
  active provider/model, run state (`running`), and a live event count
  (`47 events`) — the trajectory ledger's running size, visible at all
  times without opening `/trajectory`.

### 3.2 The real slash-command palette

Verified directly from source (`apps/acryl-cli/src/tui/commands.ts`) and
the reference screenshot — this is the complete, real, built-in command
set:

| Command | What it does |
| --- | --- |
| `/help` | Show help and available commands |
| `/login` / `/logout` | Configure or remove provider authentication (API key) |
| `/model` | Manage LLM provider profiles |
| `/trajectory` | Browse the turn/step event ledger — the DSH-native durable record of everything the session did |
| `/tools` | Browse and expand tool cards |
| `/context` | Show context-window usage |
| `/plugins` | Show the loaded plugin tree |
| `/presets` | Show and switch agent presets (only while the session is blank) |
| `/goal` | Set or view the long-running goal (`/goal <objective>`, `clear`, `edit <objective>`, `pause`, `resume`) |
| `/plan` | Enter plan mode, optionally with a message; `/plan off` to leave |
| `/compact` | Summarize and compact session history |
| `/clear` | Clear the screen and start a new session |
| `/exit`, `/quit` | Exit ACRYL |
| `/files` | Browse, view, and edit files — opens a popup overlay (§3.3) |
| `/files:<plugin-name>` | Same file browser, scoped to one installed plugin's own files |
| `/plugin:<plugin-name>` | Same pattern, plugin-scoped |
| `/market` | Browse and install ACRYL plugins — the in-terminal plugin marketplace |

Beyond the static list, ACRYL's self-authoring system (spec 037, shared
across all three surfaces) adds commands the CLI must represent
identically to Desktop/Web:

- **`/reload`** — lists every installed extension (project- and
  global-scope) with its sync state: in sync, changed, or **stale** (source
  moved/deleted); `/reload new` installs a newly-discovered workspace
  extension folder (human opt-in); `/reload remove-stale` clears a dangling
  one.
- **`/blend snapshot`** / **`/blend verify`** — capture the live plugin
  composition as a portable Blend, or verify one offline.

Design the palette itself (the `/` autocomplete dropdown, shown live in
screenshot 1) as a first-class, dense list view: command in one color
column, description in a second, keyboard-navigable, filterable by typing —
exactly as shown, just given full visual-system treatment.

### 3.3 Popup TUI windows (the `/files` pattern — screenshot 2)

The reference screenshot shows the canonical **overlay** pattern: a
bordered floating panel drawn on top of the still-visible conversation
transcript (the transcript dims/stays behind, not replaced), containing:

- A breadcrumb path header (`/Users/musichen`).
- A scrollable list with a directory-up row (`↑ ..`) and folder/file rows
  (folder icon glyphs, plain filenames, one `AGENTS.md` file example shown
  with a distinct file glyph).
- A footer hint bar inside the popup itself: `DIR  ..` (current selection
  type) on the left, `↑↓/jk move · →/enter open · esc close · type to
  filter` on the right.
- The session status line stays visible below the popup, unobstructed.

**This is the general popup pattern to design for every secondary TUI
view** — not just files. Use the same bordered-overlay-with-breadcrumb-and
-footer-hint grammar for: the plugin marketplace (`/market`), the plugin
tree (`/plugins`), the trajectory ledger (`/trajectory`), tool-card
inspection (`/tools`), and the provider/model manager (`/model`). One
consistent overlay chrome, different content per command — this is the CLI
equivalent of the GUI surface's modal/panel system.

### 3.4 Self-introspection ("where am I running")

The reference screenshot shows the agent producing a real structured
**"Where I run"** table on request: `Surface: TUI (terminal)`, `Profile`,
`Working dir`, `DSH home`, `Session`, `Host` (OS/version). This is the
pi.dev-style self-architecture-awareness capability referenced throughout
this project (see spec 037) made concrete and visible in the terminal.
Design a clean, aligned key/value table treatment for this — it should read
as a diagnostic/about panel the agent can produce inline, not a wall of
prose.

### 3.5 Skills catalog

Also shown inline in the reference screenshots: a **grouped skills
catalog** (~90 skills at the time of the screenshot), bulleted by purpose
category (This repo/Cordis, Code quality, Codebase understanding,
Planning/specs, Design/frontend, Ops/tooling), each skill name a distinct
inline reference. Worth a dedicated popup treatment (`/skills`, if/when it
becomes its own command) using the same overlay grammar as §3.3, grouped
and searchable rather than a flat list.

### 3.6 Component vocabulary already available

The CLI is built on a `pi-tui`-derived component set: `Container`,
`VStack`/`HStack`, `Box`, `Text`/`TruncatedText`, `Markdown`, `SelectList`,
`SettingsList`, `Input`, `Editor`, `ScrollView`, `Loader`/
`CancellableLoader`, `Spacer`, `Image` (half-block/ANSI image rendering —
how the startup mark itself renders). Spec 038 (this folder) is unifying
this with the Web/Desktop token system into one cross-surface vocabulary —
**design as if a terminal theme service already exists**: every color in
the mockup should read as coming from a named semantic role (background,
border, accent, success/warn/error, muted text), not a one-off ANSI code
picked per screen, matching the same 79-token discipline the GUI brief
describes.

---

## 4. Competitive CLI landscape — reach feature parity with these

ACRYL's CLI competes directly with today's leading terminal coding agents.
Design toward parity with the **shared core** below, and note the
distinctive extras as inspiration for ACRYL's own roadmap (§6).

### 4.1 The shared core (every serious CLI coding agent has these)

| Capability | What it means concretely |
| --- | --- |
| Streaming chat transcript | Scrollable message history, tool calls rendered inline as expandable cards |
| Slash-command palette | Autocomplete dropdown, filterable, keyboard-navigable |
| Model/provider switching | In-session, no restart required |
| Plan/ask vs. execute modes | A distinct "thinking out loud before acting" mode, visibly different styling |
| Session management | Resume a previous session, list recent sessions, clear/start fresh |
| Context-window visibility | Live usage indicator, compact/summarize action |
| File operations surfaced | Read/edit/search shown as distinguishable tool-call card types, not opaque text |
| Permission/approval prompts | A clear accept/deny/always-allow moment for risky actions |
| Theming | Light/dark or multiple named themes, respects terminal capabilities |

### 4.2 Distinctive extras worth designing for

- **Claude Code CLI**: named subagents with their own tool/context scope;
  hooks (pre/post tool-use shell callbacks); MCP server integration shown
  as a connection-status list; `/ide` and `/vim` mode toggles; a
  `/statusline` customizable footer; background task monitoring
  surfaced inline (a task notification arriving mid-session, distinct from
  the main turn). ACRYL's own subagent-provider extension type (§3.7 of
  the companion brief) is the real seam a similar view could grow from —
  worth a dedicated CLI screen (§7).
- **OpenCode CLI**: a strong multi-provider-first design (many models
  visibly available from one picker, not one primary provider with
  alternates buried); session sharing (a session gets a shareable link);
  LSP-backed inline diagnostics in file/edit tool cards.
- **Codex CLI**: explicit sandbox/approval-policy modes shown as a visible,
  named setting (not hidden config) — e.g. a clearly labeled
  read-only/auto-edit/full-access mode indicator always on screen; a
  dedicated `/diff`-style review step before applying a batch of changes.
- **pi.dev / pi-coding-agent** (the closest architectural relative — ACRYL's
  own extension router and system-prompt shaping were explicitly built to
  pi.dev's real pattern, see spec 037's `PI-PARITY.md`): extension
  discovery and installed-extension awareness baked directly into the
  system prompt rather than a separate command; a lightweight
  topic-routed doc reference system (short pointers, not inlined docs) —
  ACRYL already does this; keep it visually legible when a topic
  reference surfaces mid-conversation (a distinct inline citation style,
  not a plain link).

### 4.3 What NOT to copy

Don't chase a GUI-in-a-terminal aesthetic (heavy box-drawing borders
everywhere, faux-3D panels, mouse-hover states that don't exist in a real
terminal). Every strong terminal coding agent today reads as *text-first*:
color and alignment carry the hierarchy, not decoration. Match that
restraint.

---

## 5. The canonical TUI information architecture

Unlike the GUI surfaces' persistent multi-pane layout (see the companion
brief §5), a terminal has **one primary surface** (the scrolling
transcript) and **layered overlays** for everything else. Design around
this shape:

```
┌───────────────────────────────────────────────────────────────────┐
│  Startup header: mark · provider/model · working dir · build stamp  │
├───────────────────────────────────────────────────────────────────┤
│                                                                       │
│   Scrolling transcript:                                              │
│     - user turns                                                     │
│     - assistant turns (streamed)                                     │
│     - tool-call cards (expandable, one visual style per tool kind)   │
│     - plan-mode turns (visibly distinct styling)                     │
│     - system/status notices (compact, muted)                         │
│                                                                       │
│   ┌─── Popup overlay (when a command opens one) ──────────────────┐ │
│   │  breadcrumb / title                                            │ │
│   │  scrollable list or content body                               │ │
│   │  footer: keybinding hints, left = context, right = navigation  │ │
│   └─────────────────────────────────────────────────────────────┘ │
│                                                                       │
├───────────────────────────────────────────────────────────────────┤
│  session id · provider/model · run state · event count               │
├───────────────────────────────────────────────────────────────────┤
│  > input line, with live `/` autocomplete dropdown above it          │
└───────────────────────────────────────────────────────────────────┘
```

Every secondary view (files, market, plugins, trajectory, tools, model
picker, and any new roadmap view in §6) is the **same overlay chrome**,
different content — this consistency is what makes a text-only interface
feel designed rather than improvised. Popups never fully replace the
transcript behind them (a dimmed/visible transcript communicates "you can
still see where you were").

---

## 6. Roadmap — CLI-specific, beyond parity

These extend the CLI toward ACRYL's own destination (mirrors the
companion brief's §6, reworked for text-mode). Design at least a few as
distinct popup screens or clearly-labeled future states:

### 6.1 Self-authoring, visible in the terminal

A live view (its own overlay, or a distinct transcript notice style) for
"the agent is building a plugin right now": file(s) being written, a
hot-reload confirmation the moment it activates, then the new
plugin appearing in `/plugins`' tree with correct provenance (`local`) —
all without leaving the transcript. This is the sharpest differentiator
versus every competitor in §4 and deserves the same visual weight here
that the companion brief gives it in the GUI.

### 6.2 Expanded `/market`

Beyond "browse and install": provenance badges per plugin (local/registry/
git/linked, matching §3.2's `/reload` states), a featured/"Acryl-package"
tag (see `specs/036-cordis-ecosystem-and-acryl-blends`), and a clear
private-registry affordance for teams — same overlay grammar as `/files`,
richer content.

### 6.3 Local plugin/extension discovery

A dedicated view (could fold into `/plugins` or `/reload`) that answers
"what has this agent already built for me, locally, in this workspace or
globally on this machine" — distinct from the published market: local
plugins grouped by scope (project vs. global), each with a build/edit
timestamp and a one-key "graduate to the market" action.

### 6.4 Trajectory, made a first-class inspection surface

`/trajectory` already exists as the DSH-native turn/step event ledger.
Design it as a genuinely useful debugging/audit view: a filterable,
timestamped event list (tool calls, model turns, plugin hot-reloads,
approvals), not just a raw log dump — this is real, durable session state
worth making legible, not just accessible.

### 6.5 Multi-agent / subagent view in text mode

A CLI-appropriate answer to the companion brief's multi-agent orchestration
screen (§6.4 there): a compact status list of running subagents/delegated
tasks (name, state, brief progress line), expandable into that subagent's
own transcript without losing place in the parent session.

### 6.6 Worktree awareness

The GUI brief's worktree-rail concept (companion §5) has no direct TUI
equivalent yet — consider a lightweight `/worktree` overlay (same grammar
as `/files`) listing available worktrees with change-count badges, so a
developer can switch context without leaving the terminal.

---

## 7. Concrete screens to produce

Prioritized list — same "populated + relevant empty/edge state" bar as the
companion brief, and the same light/dark note **does not directly apply**
here (a terminal typically has one dark-optimized default and possibly a
light-terminal variant — design for both if reasonable, but don't force a
literal light/dark toggle that doesn't match how terminal color schemes
actually work).

1. **Startup / first-turn orientation** — mark, header, the agent's
   self-orienting first response (§3.1).
2. **Main transcript with an in-flight tool call** — a streaming assistant
   turn, an expandable tool-call card mid-execution, the session status
   line.
3. **`/` command palette open** — the autocomplete dropdown over a partial
   input.
4. **`/files` popup** — exactly the reference pattern (§3.3), fully
   restyled.
5. **`/market` popup** — plugin browse/install, provenance badges (§6.2).
6. **`/plugins` popup** — the loaded plugin tree, provenance shown per
   node.
7. **`/trajectory` popup** — the event ledger, filterable (§6.4).
8. **`/goal` and `/plan` mode** — how a long-running goal and plan-mode
   turns read differently in the transcript.
9. **Self-authoring live moment** (§6.1) — a plugin being written and
   hot-reloaded, shown inline.
10. **Permission/approval prompt** — a risky-action confirmation moment.
11. **"Where I run" self-introspection table** (§3.4).

---

## 8. Visual/system constraints for the design agent

- **Real terminal chrome**: design inside an actual terminal-emulator
  frame (traffic-light buttons, a title showing the working directory or
  "ACRYL," as both reference screenshots do) — not a browser window with a
  monospace font.
- **Monospace grid discipline**: every layout decision (column alignment,
  box-drawing borders, table rendering) must respect a fixed character
  grid — no GUI-style arbitrary pixel offsets.
- **ANSI-safe, token-driven color**: design as if a small named palette
  drives everything (background, border, muted/foreground text, accent,
  success/warn/error) with explicit terminal-safe values, not
  gradients or shadows — matching the semantic-token discipline in the
  companion brief, translated to what a terminal can actually render.
- **Keyboard-first, always show the hint bar**: every popup needs its own
  footer hint line (as shown in the reference), and any screen introducing
  a new interaction should show its keybinding, not assume it's memorized.
- **Respect real rendering constraints**: this product already deals
  carefully with terminal quirks (Kitty keyboard protocol detection,
  modifyOtherKeys escape sequences, half-block ANSI image rendering for
  the startup mark) — design content that plausibly renders in a real
  terminal (box-drawing characters, half-block/ANSI art, 256-color or
  true-color assumptions stated), not web-only effects (blur, drop
  shadows, smooth gradients) with no terminal equivalent.
- **Accessibility**: this product has a real screen-reader-friendly output
  mode (flat text, no decorative borders/animation). Note, for at least one
  screen, how the same information reads in that flattened mode.
- **Brand mark**: use the same real ACRYL identity as the companion brief,
  translated into the existing generated pixel/half-block wordmark shown in
  both reference screenshots — do not invent a new mark for this surface.

---

## 9. Reference material index

- `uiref/cli-tui-uiref/` (next to this file) — two real screenshots of
  ACRYL's actual running CLI: the startup/self-orientation screen with the
  full command palette open, and the `/files` popup overlay pattern.
- `uiref/` (parent folder) — the three GUI reference screenshots from the
  companion brief, useful for cross-surface consistency even though this
  document targets the terminal.
- `acryl-ui-design-system.md` (this folder) — the Desktop/Web companion
  brief; §2 (philosophy), §3.5–3.7 (self-authoring, market, multi-provider
  runtime), and §6 (roadmap) describe the same underlying product this
  document reworks for text-mode.
- `apps/acryl-cli/src/tui/commands.ts` — the real, current slash-command
  source (§3.2).
- `specs/037-guardrailed-self-extension/` — the self-authoring capability
  behind §3.2's `/reload`/`/blend` commands and §6.1.
- `specs/036-cordis-ecosystem-and-acryl-blends/spec.md` — the Blend/registry
  model behind §6.2's marketplace provenance.
- `specs/038-ui-component-library/` (this folder) — the in-progress
  cross-surface token/component unification referenced in §3.6.
