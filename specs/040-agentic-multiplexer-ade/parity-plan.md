# Feature Parity Plan: Orca and Nimbalyst into the ACRYL ADE

**Spec**: [spec.md](./spec.md) (040, Scope A is the target of this plan) | **Plan**: [plan.md](./plan.md)  | **Wireframes**: [design/wireframes-current-vs-planned.md](./design/wireframes-current-vs-planned.md)
**Written**: 2026-09-23 | **Status**: draft for review, no code changed

## Purpose

Spec 040 already carries a four-product competitive scan (Orca, Superset, super.engineering, Nimbalyst) and five stories (A1-A5). This document extends it: it decides, per feature, what ACRYL takes from **Orca** and **Nimbalyst**, in what form (design or code), in what order, and what it deliberately leaves alone. It is the input to `research.md` and `tasks.md`, which 040 says must not be written until its open questions are resolved.

Where 040 and this plan disagree, 040 wins until this plan is merged into it.

## Sources and how well they were read

| Source | Path | Snapshot | License |
|---|---|---|---|
| Orca | `acryldev/_reference_projects/orca` | `8d6fec597b` (2026-09-23) | MIT, Lovecast Inc. |
| Nimbalyst | `acryldev/_reference_projects/nimbalyst` | `ca2628d7b` (2026-09-22) | MIT, Nimbalyst Inc. (the collaboration sync server is a separate, non-included project) |
| Mockup v1 (Lovable) | `acryldev/ux-ui-design-mockup-acryl/ux-ui-design-mockup-acryl-desktop-and-web` | n/a | ours |
| Mockup v2 (Base44) | `.../ux-ui-design-mockup-acryl-desktop-and-web-v2` | n/a | ours |

**Evidence level.** Read: both READMEs, Nimbalyst `docs/FEATURE_INVENTORY.md`, directory layout of both, and the v1/v2 mockup structure. **Not yet read: implementation internals** of any candidate. Every row below marked `verify` needs a read of the named path before a task is written from it. Nothing here is a claim about code quality.

## Ground rules

1. **Design first, code second.** Both projects are Electron apps (Orca: `electron.vite`, main/preload/renderer; Nimbalyst: `packages/electron`). ACRYL is Cordis plugins over an unmodified DSH. Their main-process services do not transplant. The default is: take the interaction design and the algorithm, re-express both as a Cordis service or Client contribution. Copy source only for pure, framework-free logic (state reducers, parsers, diff-anchor math), and only after reading it.
2. **MIT obligation.** Any copied or closely adapted source keeps the upstream copyright and permission notice. Concretely: a `THIRD_PARTY_NOTICES.md` at the repo root listing each upstream (name, license, copyright line, snapshot hash), plus a one-line provenance comment at the top of each adapted file naming the upstream path. Ideas and behavior described in our own words need no notice, but the plan still records the source for traceability.
3. **Cordis law wins.** Every taken feature goes through the mini-design in the root `CLAUDE.md` (capability boundary, provides/consumes, effects and disposal, config, events, verification). A feature that needs a parallel lifecycle or DI system is rejected, not adapted.
4. **Constitution stays.** Room persistent, agents disposable, canonical state durable. Anything that makes a UI construct the only record of an event is rejected (see the Nimbalyst session-store rows).
5. **Mockups are the visual contract.** Where a feature has a place in the v1 or v2 mockup, it lands there. Where it does not, adding it needs a mockup change first, not an ad hoc UI.

## Parity matrix

Verdict key: **Take-design** (re-implement from the idea), **Take-code** (adapt pure logic with notice), **Have** (ACRYL already ships or 040 covers it), **Defer**, **Reject**.
Priority: P1 core parity, P2 strong differentiator, P3 later.

### A. Worktrees, sessions, agent status

| # | Feature | Orca | Nimbalyst | ACRYL today | Verdict | Pri |
|---|---|---|---|---|---|---|
| A1 | Worktree-aware project/branch rail with live agent-status dot | `renderer/src/components/AgentStateDot.tsx`, `store/worktree-*` | Git worktrees section of the feature inventory | Spec 040 story A1, not built | Have (spec). Take-design for status semantics (`verify` Orca's state set against 040's running/review/idle/clean) | P1 |
| A2 | Fan one prompt across N agents in isolated worktrees, compare, merge winner | README "Parallel Worktrees" | Parallel sessions per worktree | v2 `MultiAgent.jsx` mockup only (`fan-out --n 5 --merge winner`) | Take-design. New story, not in 040 | P1 |
| A3 | Agent dashboard: sessions bucketed by state (needs input, running, done) with unread | `components/dashboard/` (`build-dashboard-bucket-counts`, `dashboard-card-bucket`) | Agent navigation badge, read/unread, macOS menu-bar panel | Nothing | Take-design | P1 |
| A4 | Session kanban by phase | none | Phase columns backlog/planning/implementing/validating/complete; board in `collab-client/src/trackers-ui/board/` | 040 story A4 (P2) | Have (spec). Take-design for phase model and drag-reparent (`verify`) | P2 |
| A5 | Session search, resume, fork/branch, pin, archive | `ai-vault`, `ai-vault-search` (`verify`) | Full-text session search, branching, pinning, tags | Nothing | Take-design. Must sit on ACRYL's durable session log, not a second store | P2 |
| A6 | Follow or import external Claude Code / Codex sessions | `components/agent-session-continuation` (`verify`) | "Follow external agent sessions" (off by default) | Nothing; directly serves Continuous Mode | Take-design | P2 |
| A7 | Agent-spawns-agent (`spawn_session`, workstreams) | Orca CLI `orca worktree create` driven by agents | `spawn_session` MCP tool, workstreams, interrupt-to-instruct | `acryl-control` agent teams exist; UI does not | Take-design, map onto `ctx.agentTeams`. Confirms 040 open question 2 | P2 |
| A8 | Account/profile switching and usage/rate-limit awareness | `main/claude-accounts`, `codex-accounts`, `claude-usage`, `rate-limits` | Rate-limit warning widgets, context-window usage with pace | Auth exists in `acryl-control`; no UI parity | Take-design | P2 |

### B. Review and git

| # | Feature | Orca | Nimbalyst | ACRYL today | Verdict | Pri |
|---|---|---|---|---|---|---|
| B1 | Changes / Review / Checks panel | GitHub checks state (`components/github-checks-tab-state.ts`) | Git integration section | 040 story A2 | Have (spec) | P1 |
| B2 | Diff tile | Monaco diff views | Side-by-side diff, red/green | 040 story A3 | Have (spec) | P1 |
| B3 | **Line comments on a diff that are sent back to the agent** | `components/diff-comments/` (range drag, zone cards, popover) | Mockup annotations to agent | Not in 040. v2 mockup Review tab has threads anchored to `file:line` | Take-code candidate for the anchor and range math (`diff-comment-line-range.ts`), Take-design for the send-to-agent flow | P1 |
| B4 | Per-change approve/reject of agent edits, approve-all/reject-all | Not confirmed | `PendingReviewBanner.tsx`, red/green per tool call | Not in 040 | Take-design | P1 |
| B5 | Durable interactive prompts (ask user, plan approval, commit proposal, tool permission) that survive restart | `agent-hooks/` (`verify`) | `interactivePromptTools.ts`, `GitCommitConfirmationWidget.tsx` | Nothing in the ADE | Take-design. Persisted as room events, not UI state | P1 |
| B6 | AI-drafted commit with confirmation | Not confirmed | GitCommitProposal | Nothing | Take-design, rides on B5 | P2 |
| B7 | GitHub PRs and issues in-app; GitLab, Linear, Jira, Bitbucket, Azure DevOps | `main/github`, `linear`, `jira`, `gitlab`, ... | GitHub issues importer extension | Nothing | Defer. Ship GitHub only, as a Cordis plugin; others are separate plugins later | P3 |

### C. Canvas, tiles, editors

| # | Feature | Orca | Nimbalyst | ACRYL today | Verdict | Pri |
|---|---|---|---|---|---|---|
| C1 | Terminal splits, scrollback that survives restart | "Terminal Splits" | Embedded ghostty terminal | `acryl-workspace` PTY tile shipped (Scope A slice) | Have. Take-design for scrollback restore (`verify` how Orca persists it) | P2 |
| C2 | Floating terminal, command palette (Cmd+J) | `components/floating-terminal`, `cmd-j` | Cmd+L session search | Shortcuts registry exists (`acryl-shortcuts`) | Take-design | P3 |
| C3 | Design Mode: click an element in the embedded browser, send HTML, CSS, screenshot to the agent | `components/browser-pane/annotate` | Mockup annotations | Browser tile shipped; 040 links it to spec 039 (mount anchors) | Take-design. Overlaps 039, so plan jointly | P2 |
| C4 | Task/tracker records that agents read and write, plain files on disk | none | `tracker-core`, `tracker-engine`, `tracker-schema`; status in markdown | 040 has Kanban and Doc tiles only | Take-design for the record schema; storage must be plain files plus the room log. Do not adopt their sync engine | P2 |
| C5 | Rich visual editors (Mermaid, Excalidraw, CSV, mockup, data model) | none | `extensions/*`, Lexical/Monaco | 040 explicitly cut ER/Spreadsheet/Mockup tiles | Defer. Keep 040's cut | P3 |
| C6 | Infinite project canvas of live editors | none | `extensions/canvas` (`.canvas`) | ACRYL's canvas is the tile canvas | Reject as a separate concept; ACRYL's tile canvas already is this | n/a |
| C7 | Extension SDK with one `EditorHost` contract | Plugins in `main/plugins` | `packages/extension-sdk` | Cordis plugins plus `cordis-plugin-market` | Reject. Cordis plugins are the extension system; a second SDK violates law 3 | n/a |

### D. Automation, remote, mobile

| # | Feature | Orca | Nimbalyst | ACRYL today | Verdict | Pri |
|---|---|---|---|---|---|---|
| D1 | Scriptable CLI that drives the app (`worktree create`, browser `click`/`fill`) | `src/cli`, `skills`, `skill-guides` | `packages/cli` | `acryl-cli` exists; not an app-control CLI | Take-design. Aligns with the v2 mockup's "command surface" (`team run`, `agent send`, `fan-out`) | P2 |
| D2 | Automations (scheduled or triggered agent runs) | `main/automations` | Scheduled wakeups (`schedule_wakeup`) | Nothing | Defer to after A2/A7 | P3 |
| D3 | Agent-usable skills bundled with the app | `skills/`, `skill-guides` | Planning extension slash commands | ACRYL has its own skill system | Take-design only for the "agents drive the ADE" skill set once D1 exists | P3 |
| D4 | SSH / remote worktrees with port forwarding | `main/ssh` | Cloudflare sandbox package | Nothing | Defer. Large surface, no mockup, no 040 story | P3 |
| D5 | Mobile companion (iOS/Android) | `mobile/` | `packages/ios`, `android` | Nothing | Reject for this milestone | n/a |
| D6 | Team collaboration, shared docs, E2E encrypted share links | none | `collab-*`, `IDENTITY_AUTH_AND_ROOMS.md` | Nothing | Reject. Depends on Nimbalyst's hosted sync server, which is not part of the MIT repo | n/a |

### E. Prototype and feedback loop

| # | Feature | Source | ACRYL today | Verdict | Pri |
|---|---|---|---|---|---|
| E1 | Agent writes an HTML prototype, the human annotates elements or text live in the browser, queued feedback returns to the agent by long-poll (`lavish-axi <file>` / `poll`, Mermaid to editable whiteboard, export and share) | `kunchenguid/lavish-axi` (MIT, npm `lavish-axi`), installed globally and used for the spec 040 UX pages | Browser tile has no annotate mode; spec 039 mount anchors cover only ACRYL's own UI | Take-code, remake as ACRYL-native and ship as a standard part of the ADE and coding-agent environment. Overlaps C3 (Design Mode) and spec 039, so plan those three together | P1 |

Rationale from the maintainer: HTML is the best prototype format for both humans and agents, and annotating a live prototype is the shortest feedback loop.

## What this adds to spec 040

Existing stories A1-A5 are unchanged. The plan proposes these new stories, each needing its own acceptance scenarios before tasks are written:

- **A6 Fan-out and compare** (matrix A2, v2 `MultiAgent.jsx`). P1.
- **A7 Agent dashboard and attention queue** (A3). P1. Shares its state source with A1's rail dots and A4's kanban; that single source is 040 open question 2.
- **A8 Diff review loop** (B3, B4, B5, B6). P1. Comments and approvals become room events; the agent receives them as a structured message, not as terminal input.
- **A9 Session history: search, fork, external import** (A5, A6). P2.
- **A10 Tracker records** (C4). P2. Decide against the v2 mockup's Kanban card whether trackers and session phases are one concept or two (see open question 2 below).
- **A11 App-control CLI and command surface** (D1). P2.

## Sequencing

1. **Resolve 040's open questions 1, 2 and 5.** Nothing below is buildable until the session/phase seam is known (question 2). Question 5 is now partly answered: Nimbalyst's board is a source to read, license-clear.
2. **Read pass on the `verify` rows** and write `research.md`. Record for each: what the upstream does, what we take, and whether any code is copied.
3. **Stand up attribution once**: `THIRD_PARTY_NOTICES.md` and the per-file provenance convention, before the first adapted file lands.
4. **Slice order**, each a coherent buildable commit: A1 rail, A2 panel plus A3 diff tile, A7 dashboard (reuses the rail's status source), A8 review loop, A6 fan-out, then P2 items.
5. Each slice gets its Cordis mini-design and a real Loader activation test, per the root `CLAUDE.md`.

## Explicit non-goals

Mobile apps, hosted collaboration and share links, a second extension SDK, an infinite canvas as a separate product, the full visual-editor suite, SSH remotes, and issue-tracker integrations beyond GitHub. Each is either outside 040's thesis or depends on infrastructure ACRYL does not have.

## Open questions

1. **Trackers versus session phases.** Nimbalyst keeps both (a tracker of plans, bugs and todos, and a session kanban). Are they one entity or two in ACRYL? This decides A4 versus A10.
2. **Where do review comments and approvals live** so they are durable and agent-independent: the room event log, a `.acryl` file per worktree, or both? Constitution principle IV constrains this.
3. **Is code copying acceptable at all**, or is this design-only? The plan assumes copying pure logic is fine under MIT with notices. If the preference is clean-room, rows marked Take-code become Take-design.
4. **v2 mockup drift.** Several proposed stories (A6, A8) appear in v2 only as static UI. Update the mockup first, or let the spec lead?
