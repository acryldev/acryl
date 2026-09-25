# Feature Specification: Agent UI Control (agents operate ACRYL itself)

**Tracking:** to be filed (`acryldev/acryl` issue) when this leaves `needs-triage`

**Feature Directory**: `specs/041-agent-ui-control`
**Created**: 2026-09-25
**Status**: needs-triage. Nothing is built. This spec, `plan.md` (the Cordis mini-design) and `tasks.md` (spikes first) are the whole deliverable of the first pass.
**Authority**: `.specify/memory/constitution.md` (everything is a plugin; canonical state durable), root `CLAUDE.md` (Cordis development protocol, boundaries), `docs/cordis/cordis_system_guide_for_coding_agents.md`, `specs/037-guardrailed-self-extension` (an agent that edits ACRYL through guarded seams), `specs/040-agentic-multiplexer-ade` (the ADE surfaces this makes drivable). Related but separate: `specs/015-development-canvas`.
**Input**: user direction 2026-09-25 (two parts; the second is Scope B below): give the agent inside an ACRYL surface (Desktop, and Web if possible) a built-in protocol or method to control the app itself, "computer-use style but for our instance of the app specifically": change any setting, click any field, type any text, "perform any operation that user can perform within the app." Asked whether there is precedent.

## Two scopes, one tool set

- **Scope A - the agent inside the app operates its own app** (everything in this spec up to "Scope B").
- **Scope B - ACRYL CLI as the outside operator and rescue tool.** The same capability, driven from outside the process: manage, configure, drive, patch and repair ACRYL Desktop and Web, including when the app is broken and cannot launch. Added 2026-09-25 (user: "an external entity that steps outside of the box to fix things from an outside perspective").

Both scopes share one typed tool vocabulary (`settings.*`, `plugin.*`, `workspace.*`, `ui.*`), so an instruction works the same whether the agent is inside the app or the CLI is outside it.

## Why this exists

An ACRYL agent can today edit files and run commands, but it cannot operate the product it lives in. A user has to add a project, flip a plugin, change a model or set up a workspace by hand, and every time we lacked a service for something we wrote a fragile DOM click (fixed real instances: the Settings trigger and the "Add workspace" trigger in `acryl-workspace`). This milestone replaces those one-offs with one governed capability, and makes "ask the agent to set it up" a real workflow (onboarding, self-configuration, guided support, end-to-end self-testing of the app).

## Precedent (what we are standing on)

| Prior art | Idea | What we take |
|---|---|---|
| Anthropic computer use, OpenAI Operator/CUA | Drive any app from screenshots and simulated mouse/keyboard | Only as the last-resort layer for canvas-like regions (terminal, editor) |
| Playwright MCP, Chrome DevTools MCP, Claude in Chrome | Accessibility-tree snapshot with element refs, then `click(ref)` / `type(ref, text)` | The core of layer 2: cheaper, faster and more reliable than pixels |
| Electron + Chrome DevTools Protocol, Playwright Electron, Spectron | Automate an Electron window from outside | Desktop-only extra (screenshots, dialogs); not the primary path |
| WebMCP (W3C proposal, `navigator.modelContext`) | Pages register tools for agents instead of being scraped | Layer 1's shape: named typed tools; keep our registry able to mirror to WebMCP later |
| VS Code and Emacs command registries | Every user action is a named command | Layer 1: every capability is a typed command, so most operations never touch the DOM |
| OS accessibility APIs (macOS AX, Windows UIA), Apple App Intents, Android app functions | OS-level semantic control | Out of scope (we control our own renderer), noted as the model to mirror |

## Three layers, cheapest and most reliable first

1. **Typed capability tools.** Settings, sessions, workspaces, worktrees, plugin lifecycle and layout are exposed as Harness tools (`settings.get/set`, `workspace.create`, `session.open`, `plugin.enable/disable`, ...). Exact, testable, validated. Preferred whenever a service exists.
2. **Semantic UI driving.** Tools `ui.snapshot`, `ui.click`, `ui.type`, `ui.select`, `ui.press`, `ui.scroll`, `ui.wait` operate on the accessibility tree of our own window with stable refs. Covers everything that has no service yet, for both Desktop and Web because they share the renderer.
3. **Pixel fallback.** `ui.screenshot` (and region click) only for canvas-like regions (xterm, Monaco) whose content is not in the DOM tree.

A tool must try down the layers in order; the agent is instructed to prefer layer 1, then 2, then 3.

## User stories

### US1 (P1): Agent performs a setting change through a typed tool

An agent is asked "switch the default model and turn off the Changes tab plugin". It calls `settings.set` and `plugin.disable`. The change is visible in the UI at once, is persisted like a user change, and is written to the audit log.
**Independent test**: headless Loader test where the tool changes a setting and the same service the UI reads reports the new value.

### US2 (P1): Agent operates the UI where no service exists

An agent is asked "add my repo at `~/code/foo` as a project". It calls `ui.snapshot`, finds the Projects "+" control, clicks it, and completes the folder flow, pausing for the user where the OS chooser needs a human. The DOM-click helper in `acryl-workspace` is replaced by this.
**Independent test**: jsdom render test drives a real component tree by refs (click, type, select) and observes state changes; refs stay valid across re-renders and go stale safely.

### US3 (P1): Safety holds

- Password, token, API-key and payment fields never appear in snapshots and cannot be typed into.
- Destructive or outward-facing actions (delete, send, publish, change permissions) go through the normal approval pipeline; approving one call does not approve the next.
- The agent cannot change its own permission, policy or approval settings, or disable this plugin.
- A visible "agent is driving" indicator with a kill switch is shown for the whole run; the user's own input is never blocked and takes precedence.
- Every call is recorded in an audit log the user can read.
**Independent test**: each rule has a test that tries to violate it and fails closed.

### US4 (P2): Web parity

The same layer 1 and 2 tools work in `acryl-web`. Only layer 3 differs (no native screenshot).

### US5 (P2): External agents

Claude Code, Codex or another ACP client can use the same tools through an ACRYL-hosted MCP endpoint, behind the same policy pipeline and off by default.

### US6 (P3): Self-testing

The agent (or CI) runs scripted end-to-end scenarios against a real window using these tools, so UI regressions like the missing right-pane host are caught before the user finds them.

## Scope B: ACRYL CLI as operator and rescue

### What exists today (verified in the repo, 2026-09-25)

- One shared plugin on/off override file per profile (`runtime/acryl-harness-runtime/src/plugin-lifecycle-state.ts`); the CLI and the Desktop Lifecycle panel already agree through it.
- A plugin health diagnosis (`plugin-doctor.ts`) and CLI market install (`cli-market-install.ts`, `cli-market-plugins.ts`).
- Profile home resolution and layout (`acryl-home.ts`, `profile-layout.ts`), which is what lets the CLI find a Desktop's state on disk even when the app will not start.

### Two modes of control

1. **Offline (app not running or broken).** The CLI edits the same durable state the app reads at boot: profile config, plugin overrides, installed packages. This is the rescue path and must not need the app process at all.
2. **Online (app running).** The CLI connects to the running Desktop or Web instance through an authenticated local channel and calls the same tools the in-app agent uses, including layer 2 UI driving. This is "hey acryl, hide Chats and open branch-123".

### User stories

- **B1 (P1) Rescue.** Desktop or Web will not launch. The user runs `acryl repair` (or asks the CLI agent). It diagnoses (bad plugin row, failed install, corrupt override file, pnpm store mismatch, broken profile, bad build) with a readable report, proposes minimal fixes, shows the diff, and applies them only after approval, keeping a backup so every repair is reversible. Example fixes: disable the plugin that fails activation, restore the last known-good profile, reinstall a package, reset one setting.
- **B2 (P1) Configuration by request.** "Enable plugins 1, 4 and 6", "set the default model", "hide Chats". Offline it edits durable state; online it applies live through the tools, and the result is verified by reading state back, not assumed.
- **B3 (P1) Install and activate.** "Install plugin XYZ into Acryl-Desktop and activate it." Resolves the package, installs it into the target profile through the existing market install path, adds and enables its Loader row, and if the app is running triggers the live reload; reports PENDING dependencies honestly. Untrusted packages need explicit approval, and a failed activation rolls back to the previous state automatically.
- **B4 (P2) UI manipulation from outside.** With the app running, the CLI can snapshot and drive the window ("open branch-123", "fill this field") through the same `ui.*` tools.
- **B5 (P2) Orientation.** The CLI carries navigation aids so the agent knows the architecture and where to patch: a generated map of the repo (packages, slots, services, Loader rows), the routed extension docs and verified examples from `specs/037`, the layout gate, and graft. It answers "where does this live and what depends on it" before touching anything.
- **B6 (P3) Cross-surface.** One command targets Desktop, Web or a named profile (`--target desktop|web`, `--profile`), so a broken dev profile can be repaired from a working one.

### Scope B safety

- Outside control is a stronger capability than in-app control, so it is **local-only**: same-user, loopback or Unix-socket, authenticated with a per-profile secret the app creates, never a network listener.
- Offline edits are backed up first, written atomically, and logged in the same audit log as Scope A; `acryl repair --undo` restores the previous state.
- Anything that leaves the machine, installs code, or deletes user data needs explicit approval, one action at a time.
- The CLI agent may not edit credentials or approval policy through these tools; those stay a human action.
- A repair never runs the broken component to diagnose it; diagnosis is static (files, manifests, logs) first.

## Functional requirements

- **FR-001** One typed contract for UI operations, with a canonical snapshot shape (role, name, state, ref), transformed once at the boundary.
- **FR-002** Refs are short-lived and scoped to a snapshot generation; using a stale ref returns a typed error, never a click on a different element.
- **FR-003** Snapshots are bounded (size cap, viewport-first, pagination) and redact sensitive fields by rule, not by trust in the agent.
- **FR-004** Every tool is a normal Harness tool that traverses the policy pipeline, honors `exec.signal`, and unregisters when its owning Fiber unloads.
- **FR-005** The plugin is a toggleable Loader row (row id equals package name) and follows PENDING semantics when its dependencies are missing.
- **FR-006** It works only against the ACRYL window it lives in: no other window, no OS-level input.
- **FR-007** Layer 1 tools are provided by the packages that own the capability, not by this plugin, so it never becomes a parallel implementation of settings or sessions.
- **FR-008** Actions and results are audit-logged with tool name, target, outcome and the approving decision.
- **FR-009** (Scope B) Offline operations depend only on files and the shared runtime package, never on starting Desktop or Web.
- **FR-010** (Scope B) Every mutation, offline or online, is reversible: pre-image backup, atomic write, and a documented undo.
- **FR-011** (Scope B) The online channel is authenticated per profile, local-only, and reuses the same tool contract as Scope A; there is no second, CLI-only vocabulary.
- **FR-012** (Scope B) Diagnosis output is machine-readable and human-readable, and every proposed fix names the file or row it will change before anything is written.

## Out of scope

Controlling other applications or the OS (that is Anthropic computer use), recording user macros, autonomous background operation without a visible indicator, and a public marketplace API for third-party UI drivers.

## Open questions (continued for Scope B below)

## Open questions

1. **Host to Client transport.** The Connection RPC is unary Client to Host. A Host-side agent tool must reach the page. Options: a Client-initiated long-poll or stream the page holds open, or a Client-side Harness tool executor if one exists. Spike T001 decides.
2. **Where the tools execute.** Tools run in the Host, the DOM lives in the Client. Confirm whether the Harness supports a tool whose `execute` is delegated to the connected Client and how it behaves with several windows.
3. **Accessibility quality.** How many of our controls have real roles and names? Poor names make refs useless, so the milestone may need an `aria-label` pass, tracked as a task, not hidden.
4. **Approval granularity** for UI clicks: per action, per task, or per surface region.
5. **Offline vs online arbitration.** If the app is running, does an offline edit fight it? Proposal: detect a live instance (lock or socket) and refuse offline writes to state the app owns, routing through the online channel instead.
6. **Trust of the CLI agent.** The CLI agent has a model behind it too. Should destructive repair always require a human, or may a pre-approved repair recipe run unattended (for example in CI)?
7. **Channel discovery.** How the CLI finds the running instance and its secret: a well-known file in the profile home with restrictive permissions is the leading option.
8. **Known-good snapshots.** Whether repair keeps rolling profile snapshots at each successful boot, so "restore last known good" always has something to restore.
