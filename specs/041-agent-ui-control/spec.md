# Feature Specification: Agent UI Control (agents operate ACRYL itself)

**Tracking:** to be filed (`acryldev/acryl` issue) when this leaves `needs-triage`

**Feature Directory**: `specs/041-agent-ui-control`
**Created**: 2026-09-25
**Status**: needs-triage. Nothing is built. This spec, `plan.md` (the Cordis mini-design) and `tasks.md` (spikes first) are the whole deliverable of the first pass.
**Authority**: `.specify/memory/constitution.md` (everything is a plugin; canonical state durable), root `CLAUDE.md` (Cordis development protocol, boundaries), `docs/cordis/cordis_system_guide_for_coding_agents.md`, `specs/037-guardrailed-self-extension` (an agent that edits ACRYL through guarded seams), `specs/040-agentic-multiplexer-ade` (the ADE surfaces this makes drivable). Related but separate: `specs/015-development-canvas`.
**Input**: user direction 2026-09-25: give the agent inside an ACRYL surface (Desktop, and Web if possible) a built-in protocol or method to control the app itself, "computer-use style but for our instance of the app specifically": change any setting, click any field, type any text, "perform any operation that user can perform within the app." Asked whether there is precedent.

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

## Functional requirements

- **FR-001** One typed contract for UI operations, with a canonical snapshot shape (role, name, state, ref), transformed once at the boundary.
- **FR-002** Refs are short-lived and scoped to a snapshot generation; using a stale ref returns a typed error, never a click on a different element.
- **FR-003** Snapshots are bounded (size cap, viewport-first, pagination) and redact sensitive fields by rule, not by trust in the agent.
- **FR-004** Every tool is a normal Harness tool that traverses the policy pipeline, honors `exec.signal`, and unregisters when its owning Fiber unloads.
- **FR-005** The plugin is a toggleable Loader row (row id equals package name) and follows PENDING semantics when its dependencies are missing.
- **FR-006** It works only against the ACRYL window it lives in: no other window, no OS-level input.
- **FR-007** Layer 1 tools are provided by the packages that own the capability, not by this plugin, so it never becomes a parallel implementation of settings or sessions.
- **FR-008** Actions and results are audit-logged with tool name, target, outcome and the approving decision.

## Out of scope

Controlling other applications or the OS (that is Anthropic computer use), recording user macros, autonomous background operation without a visible indicator, and a public marketplace API for third-party UI drivers.

## Open questions

1. **Host to Client transport.** The Connection RPC is unary Client to Host. A Host-side agent tool must reach the page. Options: a Client-initiated long-poll or stream the page holds open, or a Client-side Harness tool executor if one exists. Spike T001 decides.
2. **Where the tools execute.** Tools run in the Host, the DOM lives in the Client. Confirm whether the Harness supports a tool whose `execute` is delegated to the connected Client and how it behaves with several windows.
3. **Accessibility quality.** How many of our controls have real roles and names? Poor names make refs useless, so the milestone may need an `aria-label` pass, tracked as a task, not hidden.
4. **Approval granularity** for UI clicks: per action, per task, or per surface region.
