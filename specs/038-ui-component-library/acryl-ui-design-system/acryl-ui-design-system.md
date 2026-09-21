# ACRYL ADE — UX mockup brief for a design agent (Claude Design / Lovable)

This document is a prompt-spec: hand it to a design/mockup agent (Claude
Design, Lovable, or similar) as the brief for producing a full visual mockup
of ACRYL as an **agentic development environment (ADE)**. It is not an
implementation spec — nothing here describes code, components, or how to
build it. It describes **what to design**: the product's positioning, every
feature ACRYL has today (grounded in the real, running product), the
competitive feature set to reach parity with, and the roadmap direction
beyond parity. Three real reference screenshots of competitor products
already sit next to this file in `uiref/` — study them before designing.

---

## 1. What you're designing

**ACRYL** is a local-first, plugin-native **agentic development
environment**: one persistent workspace where a developer drives coding
agents (Claude Code, Codex, and others) across three surfaces — **Desktop**
(Electron), **Web** (browser), and **CLI** (terminal TUI) — with git
worktrees, diffs, terminals, and file/code context all present, and with an
open-ended composable canvas that plugins (written by the user, or by the
agent itself) can extend with anything: kanban boards, custom widgets, new
panels, new tool integrations.

Mock up the **product**, not a component library. The output should feel
like a real, finished application a developer could start using today —
screens, flows, states, both light and dark — built from a coherent visual
system, not a set of isolated widgets.

---

## 2. Product philosophy — the two things that must read clearly in the mockup

### 2.1 Convention over configuration, with a real starter

Out of the box, ACRYL ships with everything a developer needs to start
working immediately: a chat/agent panel, integrated terminals, git
awareness, a file view, diffs — the full "batteries included" set. A new
user should never face a blank canvas and a decision paralysis moment. The
default experience is opinionated and complete.

### 2.2 Extreme extensibility — the "stem cell" model

At the same time, ACRYL does not lock a developer into one predefined way of
working. Every region of the UI is a **slot** a plugin can occupy, replace,
or add to — sidebar sections, panels, chat message renderers, settings
pages, terminal overlays, even the entire main surface. A team can start
from ACRYL's default ("Blank Canvas" — the smallest viable instance, just
the agent and core tools) and grow their own opinionated environment: custom
kanban boards, a proprietary review workflow, a data-model diagram editor,
whatever the team needs — without forking ACRYL itself. What they build can
stay private forever, or graduate into a published, reusable piece (a
**Cordis plugin**), or the whole composed environment can be captured and
shared as a **Blend** (a named, versioned recipe of which plugins make up an
instance — see `specs/036-cordis-ecosystem-and-acryl-blends`).

**The mockup should visually communicate both halves at once**: a rich,
complete, default-populated interface (so it never looks empty or
unfinished), *and* visible seams — an "Add to canvas," a plugin/marketplace
entry point, an extension surface — that make clear this isn't a fixed
product surface, it's a starting composition. Competitors sell one fixed
opinionated tool. ACRYL sells the tool **and** the room to grow past it.

---

## 3. What ACRYL has today — the real, current feature set

This section is grounded directly in the running product (verified against
source, not aspirational). Use it as the floor: everything here should
appear in the mockup in some form, even where the visual design upgrades it
substantially.

### 3.1 Three surfaces, one runtime

- **Desktop** (Electron) — the fullest surface: native window chrome, a
  replaceable main frame, native OS integration (menus, notifications,
  tray).
- **Web** — the same client application running in a browser, served
  locally.
- **CLI** — a terminal TUI (built on a `pi-tui`-derived component set:
  `Container`, `VStack`/`HStack`, `SelectList`, `Editor`, `ScrollView`,
  `Markdown`, overlay-based slash commands).

All three run the same underlying agent/session runtime. A plugin can
target one, two, or all three surfaces. **Design for Desktop and Web first**
(they share one component surface today); the CLI is a text-mode
counterpart with the same conceptual model, not a lesser product — treat it
as a real target, not an afterthought, in whatever screens make sense to
show it (see §7).

### 3.2 Current core layout (chat-centric — this is the part to evolve, see §6)

The shipping interface today is centered on a **single conversation
column**, with:

- **Left sidebar** — workspace/session browsing, a session list, settings
  entry point, brand mark, plugin-contributed footer actions (e.g. a market
  entry point).
- **Center — the conversation** — the dominant column: message history,
  tool-call cards (rendered per tool type), an input composer (with model
  selector, plan-mode toggle, attachments, slash-command palette), a
  trajectory/history view, subagent views.
- **Right sidebar** — a tabbed panel: a **files** tab, a **text preview**
  tab, a **guide** tab, extensible with more tabs by plugins.
- **Settings** — a full-screen panel: general, models/providers, plugins
  (with per-plugin config cards), onboarding steps.
- **Desktop-only additions** — a replaceable main frame slot, a details
  pane, a shell-wide overlay layer (used by the plugin market, modals).

This is a real, working chat-first IDE today. The **roadmap direction
(§6)** is to promote a file/workspace-centric **canvas** to be the default
main surface, with chat as one first-class pane among several rather than
the whole screen — matching where every competitor referenced in this brief
already is.

### 3.3 The Development Canvas (the seed of the target layout)

Already shipping as a real plugin (`acryl-development-canvas`): a
composable main-surface workspace that can host, side by side:

- native PTY terminals (multiple, tabbed)
- coding-agent sessions
- files and editors
- an embedded browser
- future capability-provided tools and views

This is explicitly **the seam to design around** for the "universal central
canvas" experience described in §6 — it already exists, it just needs the
mockup's full design treatment: how multiple canvas items tile/tab/split,
how a plugin adds a new canvas item type, empty and populated states.

### 3.4 The self-authoring loop (ACRYL builds its own plugins)

A large, real, recently-shipped capability: an ACRYL agent can write,
install, hot-reload, and manage its own Cordis plugins **in the same
session**, without leaving the app or restarting anything:

- The agent (or the developer) writes a plugin; it activates immediately —
  host-code changes hot-reload automatically.
- Plugins live in two scopes: **project** (`.acryl-extensions/`, this
  workspace only) and **global** (shared across every workspace on this
  machine).
- **Provenance** is tracked and shown per plugin: `local`, `registry`
  (installed from the public market), `git`, or `linked`.
- `/reload` lists installed extensions and their sync state (in sync,
  changed, **stale** — source moved or deleted); one command re-syncs.
- A plugin manifest declares an API version and a fixed vocabulary of
  **permissions**, shown before a human approves an install.
- `/blend snapshot` captures the entire live composition (every plugin,
  pinned versions, vendored local sources) as a portable **Blend**;
  `/blend verify` checks one offline.

**Design implication**: the mockup needs a real, first-class surface for
this — not buried in settings. A developer should be able to see "what is
this instance actually made of right now," watch a plugin get built and
hot-reload live, see provenance and permissions clearly, and snapshot/export
the whole thing. This is one of ACRYL's sharpest differentiators versus
every competitor in §4 — none of them let the *product itself* grow new
capability this way.

### 3.5 The plugin market and the wider Cordis ecosystem

- **In-instance market** (`cordis-plugin-market`, a real plugin, disabled by
  default): browse, inspect, and install published Cordis plugins from
  inside a running instance.
- **Public registries** (outside the app, but worth reflecting in an
  "open in browser" / "learn more" sense): `cordisplugins.github.io` (every
  published Cordis plugin — the "npm" layer) and `acrylblends.github.io`
  (published Blends — the "Docker Hub" layer). See
  `specs/036-cordis-ecosystem-and-acryl-blends`.
- The three-layer mental model worth keeping visually consistent wherever
  the mockup touches this: **Cordis plugin** (the atom) → **Blend** (a
  composed instance recipe) → **registry** (where either gets published and
  discovered).

### 3.6 Extension surface breadth (why "extreme extensibility" is not just marketing copy)

Real, current numbers from the running product's own generated inventory —
useful for communicating scale/credibility in marketing-style screens (a
market/gallery view, an about/stats panel), not necessarily literal UI
copy:

- **169 composed plugin packages** across the product today, spanning **20
  distinct extension types** — the biggest being client-slot contributions
  (46), model-callable tools (20), storage/persistence (13), event hooks
  (12), backend routes (12), terminal/sandbox backends (9), Desktop-main
  integrations (9), plus service providers, chat commands, prompt
  contributions, LLM adapters, settings sections, skill providers, agent
  presets, subagent providers, and more.
- **58 distinct client UI slots** a plugin can occupy today (conversation
  regions, sidebar regions, settings regions, the whole main frame on
  Desktop), each independently swappable without touching core code.
- A real, shared **design-token system** already exists for Web/Desktop (79
  semantic tokens: backgrounds, borders, brand, buttons, interactive states,
  each with a light and dark value) and a separate terminal color system for
  CLI — spec 038 (this very folder) is actively unifying those into one
  cross-surface component vocabulary. **Design the mockup as if that
  unification is complete**: one token system, one component language,
  expressed consistently across Desktop/Web chrome and CLI-flavored
  moments.

### 3.7 Multi-provider agent runtime

ACRYL already supports running different **agent runtimes** side by side —
not just different models, but different *engines* driving a session:
Claude Code, Codex, a native DSH-driven agent, and ACP-compatible runtimes,
each with its own capability/fidelity profile. Provider/engine switching
should be a first-class, visible control (not buried), since it's core to
"bring your own known tools."

---

## 4. Competitive landscape — reach feature parity with these four

ACRYL is entering a now-crowded category of git-worktree-centric,
multi-agent coding IDEs. The following four were researched directly (their
real marketing sites) for this brief. They converge on a **shared core
feature set** — design ACRYL to visibly cover all of it — while each has a
few distinctive extras worth noting as inspiration, not obligations.

### 4.1 The shared core (every competitor has all of these — ACRYL must too)

| Capability | What it means concretely |
| --- | --- |
| Git worktree management | One isolated worktree per agent/session; branch list with change counts; switch between them without losing state |
| Integrated terminal(s) | Real PTYs, tabbed/split, scrollback |
| Diff viewer | Side-by-side and inline modes, staged/unstaged, per-file and per-session |
| Chat/agent session pane | Streaming conversation, tool-call visibility, reasoning shown |
| File tree / file context | Browse, search, quick-open |
| PR/MR review | Create, view, comment, approve, merge — in-app, not a browser round-trip |
| Multi-agent-CLI support | Claude Code and Codex at minimum; most support 10-25+ (Cursor, Gemini, Grok, OpenCode, Copilot, Cline, Continue, Goose, Kilocode, Qwen Code, Kimi, Antigravity, Kiro, Devin, Hermes, and more) |
| Parallel/isolated sessions | Multiple agents working simultaneously without stepping on each other's worktree |
| Layout flexibility | Split panes, tabs, floating/PiP windows |

### 4.2 Distinctive extras worth designing for (differentiators across the set)

- **Multi-agent orchestration as a first-class concept** (super.engineering:
  "one lead, five specialists" — a lead agent coordinates specialist agents
  with shared state and direct handoffs; a CLI-style `team run` /
  `agent send` command surface). ACRYL's own subagent-provider extension
  type is the real seam this could grow from — worth a dedicated screen.
- **Automations / scheduled tasks** (Superset: recurring jobs like
  "daily-triage," "changelog-draft," "dep-upgrades," shown as a
  name/schedule/last-run table). ACRYL already has a `schedule-job-workflow`
  extension type — same opportunity.
- **Remote/SSH workspaces** (Superset, super.engineering, Orca): a workspace
  that keeps running on a remote machine while the laptop sleeps; a resource
  usage indicator per remote connection.
- **Fan-out / compare-and-merge** (Orca: "fan one prompt across 5 agents,
  compare, merge the winner") — a comparison view across parallel agent
  attempts at the same task.
- **In-app browser with inspection** (Orca: "Design Mode," clicking a live
  DOM element into agent context; ACRYL's Development Canvas already
  supports an embedded browser tab — extend it with this same inspect-to
  -context affordance).
- **Live-editor canvas cards** (Nimbalyst: every artifact — a Mermaid
  diagram, an Excalidraw sketch, a data-model/ER diagram, a mind map, a
  spreadsheet, a UI mockup — is a *live, editable card* on a project canvas,
  not a static preview). This is the single closest existing product
  expression of "ACRYL's canvas accepts any tool a plugin wants to add" —
  design a canvas-card system general enough that a kanban board, a diagram
  editor, and a spreadsheet are all just different card types, not three
  different subsystems.
- **Kanban / task board tied to sessions** (Nimbalyst: sessions organized by
  phase — backlog, planning, implementing, complete; Superset: a workspace
  status board of running/ready-for-review tasks). Worth a dedicated screen
  showing agent sessions as board cards.
- **Annotate diffs inline** (Orca: markdown comments directly on diff
  lines, sent back to the agent as feedback) — richer than a plain
  side-by-side diff; design the diff viewer to support this from the start.
- **Usage/cost dashboard** (Orca: per-provider usage and rate-limit
  tracking; the reference screenshot in `uiref/` shows a live running total
  in the window chrome itself — `$1,981.83`, "2 agents running"). Surface
  cost/usage as an ambient, always-visible signal, not a buried settings
  page.
- **Native performance framing** (super.engineering markets itself as pure
  Rust/Metal, no Electron, sub-0.5s cold start). ACRYL is Electron-based on
  Desktop; don't fight this in the mockup, but do make the app *feel* fast
  and native in its motion/density — snappy transitions, no visible
  chrome-loading jank in any screen you design.

### 4.3 What NOT to copy

Don't design a literal clone of any one competitor. Every one of them
converges on the same core layout (see §5) — design **that** shared
grammar, in ACRYL's own visual language, then layer ACRYL's real
differentiators (the self-authoring loop in §3.4, the live-canvas-card
extensibility in §4.2/§6.3, the Blend/stem-cell growth model in §2.2) on
top in ways none of them have, since none of them let their own product
extend itself the way ACRYL's plugin/Cordis model does.

---

## 5. The canonical IA pattern (observed across every reference, ours included)

Every reference screenshot in `uiref/` — including one of ACRYL's own repo
open inside a competitor tool — independently converges on the same
three-region grammar. Treat this as the structural target for the *evolved*
main layout (distinct from §3.2's current shipping layout):

```
┌──────────────┬─────────────────────────────────────┬───────────────┐
│  Left rail   │           Central canvas             │  Right panel  │
│              │                                       │               │
│ Worktree /   │  Tabbed workspace:                    │  Diff / PR /  │
│ project /    │   terminal · diff · chat · file ·     │  Changes /    │
│ branch list, │   docs · canvas-cards (kanban,        │  Review /     │
│ change-count │   diagrams, custom widgets)            │  Checks       │
│ badges       │                                       │               │
│              │  Agent-session tabs across the top,   │               │
│              │  with a running-agent-count / cost     │               │
│              │  indicator in the window chrome        │               │
├──────────────┴─────────────────────────────────────┴───────────────┤
│  Integrated terminal panel (multiple named tabs, one per surface/   │
│  worktree), collapsible                                              │
├───────────────────────────────────────────────────────────────────┤
│  Git status bar: branch, uncommitted-change count, commit/push CTA  │
└───────────────────────────────────────────────────────────────────┘
```

Concretely, from the reference screenshots:

- **Left rail**: a project/repo switcher stacked above a worktree/branch
  list, each row showing a live `+adds -deletes` diff-stat badge — this is
  the primary navigation, not a session list (contrast with ACRYL's current
  session-list sidebar in §3.2).
- **Top of the central canvas**: a horizontal strip of **named agent
  session tabs** (not generic "Chat 1/2/3" — real, agent-assigned or
  user-renamed titles like "Dev-Canvas-Cordis," "Fork Agent Session With New
  Name"), plus document tabs for things like a rendered `spec.md`, alongside
  a compact **running-agent-count and live cost total** in the window
  chrome itself.
- **Central canvas body**: renders whatever the active tab is — a rendered
  document (with a Rich/Source toggle for structured specs — status,
  priority, progress, owner, tags rendered as real form widgets, not raw
  markdown), a terminal, a diff, or a chat thread. This is the slot ACRYL's
  Development Canvas (§3.3) already targets.
- **Right panel**: file tree with **Files / Changes / Review / Checks**
  tabs — i.e., the file browser and the PR-review surface share one right
  -hand region, switched by tab, not two separate panels.
- **Bottom**: a real multi-tab terminal strip, tabs named per purpose
  (matching ACRYL's own three surfaces would read naturally here — e.g.
  `acryl-WEB`, `acryl-DESKTOP`, `acryl-CLI` — plus free terminal slots).
- **Very bottom**: a persistent git status bar — current branch, uncommitted
  -change count, a one-click commit/push action.

Chat, in this pattern, becomes **one tab among many in the central canvas**
— still fully-featured, still the primary way most sessions start — rather
than the single dominant column ACRYL ships today. This is the single
biggest structural evolution to design for.

---

## 6. Roadmap — design beyond parity, toward ACRYL's own destination

Parity (§4) gets ACRYL into the category. These are the directions that go
past it — design at least a few of these into the mockup as distinct
screens or clearly-signaled future states (e.g. an empty/teaser card),
even where they're not fully speced yet:

### 6.1 The canvas as a universal card surface

Generalize the Development Canvas (§3.3) into the same "every artifact is a
live card" model Nimbalyst demonstrates (§4.2), but grounded in ACRYL's own
plugin model: a canvas card type is just a client-slot contribution from a
plugin. Concretely design for: a terminal card, a file/editor card, a
browser card, a diff card, a chat/agent-session card, a kanban-board card, a
diagram card, and an explicit "+ Add" affordance that opens a
plugin-contributed card-type picker — visually establishing that this list
is open-ended, not fixed.

### 6.2 The self-authoring surface, front and center

A dedicated view (not buried in settings) for the capability in §3.4:
"what is this instance made of," a live feed of a plugin being
scaffolded/hot-reloaded by the agent in real time, provenance and
permission badges per plugin, and a one-click Blend snapshot/export action.
This is the strongest "we are a framework, not just a tool" moment in the
whole product — give it real visual weight.

### 6.3 Blend-aware onboarding

The first-run experience should express the "start blank, grow into
anything" model directly: offer a **Blank Canvas** start (just the agent
and core tools — see the "blank state also has default core tools" point
from product direction: the agent, tools, and session object are always
present even on blank), alongside a small set of curated starter Blends
(e.g. an "Agent Workbench" or "Research Studio" style starting point),
each visually previewed as a named recipe of plugins, not just a generic
template picker.

### 6.4 Multi-agent orchestration view

A dedicated screen for coordinating more than one agent at once: a lead/
specialist relationship or a simple parallel-fan-out-and-compare view (§4.2)
— worktree-per-agent, a compare-and-merge action once attempts finish.

### 6.5 Private/enterprise differentiation, shown honestly

Somewhere in the settings or market surface, reflect that a team can run a
fully private registry and build proprietary Blends that never leave their
own git — this is real product positioning (open core, consulting/private
registries as the business model), not a hidden detail; a small,
honestly-labeled "Private registry" or "Enterprise" affordance in the
market/settings surface communicates it without overselling.

---

## 7. Concrete screens to produce

Prioritized list — produce these, in this rough order of importance. For
each: light and dark, and at least one populated + one relevant empty/edge
state where it matters.

1. **Home / first-run** — Blank Canvas vs. starter-Blend picker (§6.3).
2. **Main workspace (evolved layout)** — the full §5 grammar: left
   worktree/project rail, top agent-session tabs, central canvas showing an
   active chat session, right Files/Changes/Review panel, bottom terminal
   strip, git status bar.
3. **Central canvas — non-chat tab states** — a rendered spec/plan document
   (Rich/Source toggle, structured metadata fields), a diff view with inline
   comment annotation, a kanban board card, a diagram-editor card.
4. **Diff / PR review** — side-by-side and inline modes, staged/unstaged,
   inline comment thread, approve/merge actions.
5. **Development Canvas — multi-card layout** — several card types tiled/
   split together (terminal + browser + editor), the "+ Add" card-type
   picker open.
6. **Self-authoring / plugin lifecycle view** (§6.2) — live plugin build
   feed, provenance/permission badges, Blend snapshot action.
7. **Plugin market** — browse/install, provenance shown, an
   "Acryl-package"-style featured badge, a private-registry affordance.
8. **Multi-agent orchestration** (§6.4) — parallel worktrees/agents,
   compare-and-merge.
9. **Settings — Plugins** — per-plugin config cards, enable/disable,
   permission list.
10. **CLI (terminal) counterpart** — at minimum the main session view and
    one overlay (e.g. a plugin-list overlay), rendered in a terminal-styled
    frame, showing the same conceptual model translated to text-mode.
11. **Cost/usage ambient indicator** — how the running-cost/agent-count
    signal from the window chrome (§4.2) appears across Desktop and Web
    chrome.

---

## 8. Visual/system constraints for the design agent

- **Brand**: use the real ACRYL wordmark/mark (available at the repo root,
  `acryl-logo.png` / `acryl-logo-white.png`, 974×974, dark-theme via
  `invert(1)`) — do not invent a new logo.
- **Token-driven, not hand-picked colors**: design as if driven by one
  semantic token system (background layers, border levels, brand,
  interactive states, each with a light and dark value) applied uniformly
  across every screen — this mirrors the real 79-token system already
  shipping (§3.6) and the cross-surface unification spec 038 is building.
  Do not hand-pick one-off colors per screen.
- **Three-surface consistency**: Desktop and Web should look like the same
  product at different chrome levels (Desktop gets native window chrome and
  a couple of Desktop-only frame elements; Web does not). The CLI screen
  should feel conceptually related (same information hierarchy, same
  iconography language translated to characters/ANSI where relevant), not
  a disconnected product.
- **Accessible by construction**: keyboard-navigable focus states, visible
  focus rings, sufficient contrast in both themes, real (not decorative)
  alt text/labels implied by the design — this is a stated product
  requirement (spec 038), not optional polish.
- **Density**: this is a professional developer tool used for hours at a
  time — favor information density and speed over generous whitespace;
  every reference product in §4 reads as dense, not spacious.
- **Every region reads as a slot**: wherever plausible, give panels a
  subtle visual language (an "＋" affordance, a plugin-attribution chip, a
  drag handle) that communicates "this region can be replaced or extended,"
  without cluttering the default experience — the two philosophies from §2
  need to coexist in the same frame, not alternate screens.

---

## 9. Reference material index

- `uiref/` (next to this file) — three real screenshots: a Nimbalyst
  session showing rendered structured plan documents; a competitor
  agent-orchestration tool pointed at ACRYL's own real repository (shows
  the full worktree-rail / session-tabs / rich-doc / file-changes-review /
  multi-terminal / git-status-bar grammar in one frame); Superconductor's
  own documented UI-layout diagram (Sidebar / Central Workspace / Right
  Panel).
- `specs/038-ui-component-library/spec.md`, `research.md`, `data-model.md`
  — the real, in-progress cross-surface component/token system this
  mockup's visual language should anticipate.
- `specs/036-cordis-ecosystem-and-acryl-blends/spec.md` — the Blend/registry
  model referenced in §2.2, §3.5, §6.3.
- `specs/037-guardrailed-self-extension/` — the self-authoring capability
  in §3.4, §6.2.
- `README.md` (repo root) — product positioning, Development Canvas
  description, core principles.
