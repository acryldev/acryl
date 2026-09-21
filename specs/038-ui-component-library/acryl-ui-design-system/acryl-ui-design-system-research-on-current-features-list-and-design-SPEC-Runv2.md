## acryl ui design system research on current features list and design SPEC   Runv2

# `acryl-ui-design-system.md`

> **Purpose:** Master prompt/specification for Claude Design, Lovable, or another UI/design agent to create the **ACRYL ADE UX/UI mockup**.
>
> **Document type:** Product UX architecture + visual design brief + screen/state specification.
>
> **Primary objective:** Produce a coherent, high-fidelity mockup of the complete ACRYL Agentic Development Environment, showing both the current foundation and the planned product direction, while making ACRYL's central differentiator - **extreme extensibility on top of strong convention-over-configuration defaults** - visible in the UX itself.

---

# 1. Design Agent Role

You are designing the interface for **ACRYL**, an agent-agnostic Agentic Development Environment.

ACRYL is not intended to be:

* a clone of Claude Code;
* a clone of Codex;
* a wrapper around one coding agent;
* a conventional IDE with an AI sidebar;
* a Kanban board with terminals;
* a fixed workflow application.

ACRYL is intended to become:

> **A persistent, extensible development environment where humans, coding agents, tools, files, terminals, Git state, tasks, context, artifacts, workflows, and eventually self-generated capabilities all coexist in one composable workspace.**

The design must therefore communicate two ideas simultaneously:

### A. Convention over configuration

A newly opened project should immediately feel complete.

The user should receive a strong default development environment containing the tools developers normally need:

* project navigation;
* filesystem;
* search;
* editor;
* terminal;
* coding-agent sessions;
* Git;
* worktrees;
* diffs;
* review;
* tasks;
* browser;
* project context;
* notes/documentation;
* status;
* notifications;
* command palette;
* agent management.

The user should not need to assemble this environment manually.

### B. Extreme extensibility

The environment must also make it visually obvious that:

> **Everything can be extended.**

Developers should be able to add:

* new tools;
* new agent providers;
* new editors;
* new views;
* new widgets;
* new dashboards;
* new planning systems;
* new Kanban systems;
* new workflows;
* new commands;
* new automations;
* new integrations;
* new data models;
* new domain-specific applications;
* eventually entire self-generated application modules.

The shell is therefore **stable**, but its contents are **composable**.

ACRYL must look like a product that can grow into whatever workflow the developer needs.

---

# 2. Source Material

Before designing anything, inspect the following.

## 2.1 Existing ACRYL repository

Treat the current repository as the primary product/architecture source.

The repository currently defines ACRYL as a local-first, plugin-native, multi-surface agent workspace with a persistent development context, an agent-agnostic runtime, a Development Canvas, Cordis-based capability composition, and a direction toward interchangeable coding-agent providers. The repository currently contains dedicated runtime/control/TUI/Web/Desktop/Development Canvas/community-market packages. ([GitHub][1])

[ACRYL GitHub repository](https://github.com/acryldev/acryl?utm_source=chatgpt.com)

## 2.2 Existing internal UI reference

When running inside the actual ACRYL project, first read:

```text
/Users/musichen/_projects/p11_acr_agentcontextrelay/acryldev/acryl/specs/038-ui-component-library/acryl-ui-design-system/uiref
```

Treat this as a **visual and component reference**, not as a restriction on the product architecture.

Preserve useful existing conventions from `uiref`, but redesign the application-level composition around this document.

## 2.3 ACRYL roadmap

The current roadmap defines the direction from runtime ownership and React Ink migration through control/attach, runtime extraction, interchangeable providers, peer GUI/Web surfaces, plugin/recovery operations, continuity/relay/collaboration, and later capability distribution and packaging. 

## 2.4 ACRYL Blends

The Blends specification introduces the longer-term application-evolution layer:

```text
Package
  ↓
Profile
  ↓
Blueprint
  ↓
StemCell Blend
  ↓
Living App
  ↓
continued evolution
```

and defines evolution planning, generated/private modules, controlled UI, trusted plugin UI, sandboxed UI, checkpoints, rollback, permission diffs, validation, lineage, evolution history and a dedicated evolution UX. 

## 2.5 Competitor/reference products

Use these products as **feature-parity references**, not visual clones.

### Super Engineering

The current product emphasizes:

* workspaces;
* projects;
* worktrees;
* agent sessions;
* parallel agents;
* terminals;
* chat;
* layouts;
* Git review;
* PR/MR state;
* remote compute;
* continuity;
* orchestration;
* command-line control;
* keyboard-first workflows. ([super.engineering][2])

### Nimbalyst

The current product emphasizes:

* parallel agent sessions;
* Git worktrees;
* inline diffs;
* Markdown;
* diagrams;
* mockups;
* data models;
* spreadsheets;
* browser;
* code editor;
* task tracking;
* agent integration;
* extensions;
* context graph;
* Git/PR workflow;
* mobile monitoring. ([Nimbalyst][3])

### Superset

The current product emphasizes:

* parallel agents;
* isolated Git worktrees;
* persistent terminals;
* browser;
* file editor;
* diffs;
* PR/review;
* ports;
* automations;
* remote workspaces;
* CLI/SDK/MCP control;
* attention/state management. ([Superset][4])

### Orca

The current product emphasizes:

* multiple coding agents;
* parallel worktrees;
* terminals;
* tabs;
* panes;
* split layouts;
* agent sessions;
* session restore;
* diff viewer;
* annotated AI diffs;
* GitHub/Linear/Jira;
* browser/design mode;
* SSH worktrees;
* native search;
* usage tracking;
* CLI automation;
* rich repository previews;
* drag-and-drop files into agents. ([Orca][5])

---

# 3. Product Thesis

The visual language of ACRYL must communicate:

```text
                 ACRYL ADE

      Human
         │
         ▼
 ┌──────────────────────┐
 │ Persistent Workspace │
 └──────────────────────┘
         │
         ├── Context
         ├── Tasks
         ├── Files
         ├── Git
         ├── Agents
         ├── Terminals
         ├── Browser
         ├── Artifacts
         ├── Workflows
         └── Extensions
                  │
                  ▼
          Composable Canvas
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
      Claude     Codex      Pi
        │         │         │
        └─────────┼─────────┘
                  ▼
             ACRYL Runtime
                  │
                Cordis
                  │
                  ▼
       New capabilities can appear
```

The user should never feel like they are "inside Claude Code with extra panels".

They should feel:

> **I am inside my development environment, and agents are workers inside it.**

That distinction is fundamental.

---

# 4. Primary UX Metaphor

Use:

> **Universal Development Canvas**

as the main interaction metaphor.

The central area is not "the editor".

The central area is not "the chat".

The central area is not "the terminal".

The central area is:

> **a canvas onto which development surfaces can be placed.**

A canvas item can be:

```text
Chat
Terminal
Code Editor
Diff
File
Markdown
Task
Kanban
Browser
Preview
Diagram
Database
Log
Agent Session
Agent Fleet
Workflow
Dashboard
Context Inspector
Git Graph
Pull Request
Issue
Documentation
Image
PDF
Spreadsheet
Custom Plugin View
Custom Widget
Generated Application UI
```

This is the foundation of the design.

---

# 5. Global Application Architecture

The primary desktop composition should be:

```text
┌───────────────────────────────────────────────────────────────────┐
│                         WINDOW / TOP BAR                          │
├───────┬─────────────────────┬───────────────────────────┬─────────┤
│       │                     │                           │         │
│ GLOBAL│ PROJECT / WORKSPACE │       MAIN CANVAS         │ AUX     │
│ RAIL  │ SIDEBAR             │                           │ PANEL   │
│       │                     │                           │         │
│       │                     │                           │         │
│       │                     │                           │         │
│       │                     │                           │         │
│       │                     │                           │         │
│       │                     │                           │         │
├───────┴─────────────────────┴───────────────────────────┴─────────┤
│                      OPTIONAL BOTTOM SURFACE                     │
│ terminal / logs / jobs / diagnostics / output / ports           │
├───────────────────────────────────────────────────────────────────┤
│ STATUS / AGENTS / GIT / SYNC / RUNTIME / CONTEXT / NOTIFICATIONS │
└───────────────────────────────────────────────────────────────────┘
```

Do **not** force every screen to show every panel.

Panels must be:

* resizable;
* collapsible;
* detachable where practical;
* movable;
* reopenable;
* layout-persistent;
* context-aware.

---

# 6. Global Navigation Rail

The far-left rail is the stable ACRYL application navigation.

Suggested items:

```text
ACRYL logo

Home
Workspace
Tasks
Agents
Files
Git
Artifacts
Automations
Extensions
Market
Context
History

────────────

Search
Command Palette
Notifications

────────────

Profile
Settings
Help
```

Do not overpopulate this rail.

Its job is to provide stable application-level orientation.

The exact visible modules may change based on installed capabilities.

---

# 7. Workspace Navigation

The second-level sidebar is context-specific.

For a project/workspace, show:

```text
PROJECT

my-project
  ├── Overview
  ├── Tasks
  ├── Agents
  ├── Files
  ├── Git
  ├── Worktrees
  ├── Browser
  ├── Artifacts
  ├── Context
  └── Extensions
```

The project tree must make a critical distinction between:

### Project

A repository or folder.

### Workspace

A durable development context around one or more projects.

### Worktree

An isolated branch-backed working copy.

### Task

The unit of work being performed.

### Agent session

The worker performing the task.

The visual hierarchy should make these relationships obvious.

---

# 8. Persistent Workspace Model

ACRYL should visually reinforce:

```text
Workspace
   ├── Project A
   │    ├── Worktree 1
   │    ├── Worktree 2
   │    └── Worktree 3
   │
   ├── Project B
   │    ├── Worktree 4
   │    └── Worktree 5
   │
   └── Shared Context
```

A workspace can contain:

* several repositories;
* several related worktrees;
* multiple agents;
* shared instructions;
* task context;
* documents;
* artifacts;
* browser views;
* layouts;
* workflow state.

Cross-repository "feature contexts" should eventually be representable visually.

---

# 9. Home / Dashboard

The first screen after opening ACRYL should be an **operational dashboard**, not an empty IDE.

It should summarize:

```text
Good morning / project state

Active Work
────────────────────────────────────
Fix authentication race          Claude   Working
Refactor API client              Codex    Reviewing
Update documentation             Pi       Waiting
Release preparation              Human    Blocked

Recent Work
────────────────────────────────────
12 files changed
3 branches
2 reviews waiting
1 failed check

Attention
────────────────────────────────────
Claude needs approval
PR #128 needs review
Codex completed task

Quick Start
────────────────────────────────────
+ New Task
+ Start Agent
+ Open Project
+ Create Worktree
+ Open Terminal
+ Open Canvas
+ Search
```

This is the "mission control" layer.

---

# 10. Project Overview

Every project should have an overview page.

Show:

```text
PROJECT NAME

repository
branch
workspace
runtime
agent status
Git status
open tasks
active worktrees
ports
recent changes
recent agents
recent artifacts
```

Example:

```text
ACRYL
main
14 active tasks
6 worktrees
3 agents working
1 waiting for approval
2 failed checks
```

A small project health visualization can summarize:

```text
Agents
Git
Tests
Build
Runtime
Extensions
Ports
```

---

# 11. Agent System

Agents are first-class entities.

They are not merely terminal tabs.

The UI must expose:

```text
Agent identity
Provider
Model
Session
Current task
Worktree
Status
Activity
Capabilities
Usage
Context
Permissions
```

Example:

```text
Claude Code
● Working
Task: Fix OAuth callback race
Worktree: oauth-race
Model: Opus
Files changed: 8
Tool calls: 31
Context: 74%
```

Use explicit live states:

```text
Starting
Working
Waiting for input
Waiting for approval
Paused
Completed
Failed
Disconnected
Rate limited
Hibernating
```

---

# 12. Agent Fleet / Multi-Agent View

ACRYL must support a visual "fleet" mode.

Display agents as cards or compact rows:

```text
┌───────────────────────────────────────────┐
│ CLAUDE                                    │
│ ● Working                                 │
│ auth refactor                             │
│ worktree/auth-refactor                    │
│ 08m 41s                                   │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│ CODEX                                     │
│ ◐ Waiting for approval                    │
│ API migration                             │
│ worktree/api-v2                           │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│ PI                                         │
│ ✓ Completed                                │
│ Add tests                                  │
│ worktree/tests                             │
└───────────────────────────────────────────┘
```

Provide:

```text
filter
sort
group
search
start
stop
pause
resume
handoff
open
focus
review
compare
```

---

# 13. Agent Session View

Opening an agent should provide a complete session surface.

Structure:

```text
Agent Header
────────────────────────────────────
Claude Code
Task: OAuth race
Worktree: auth-fix
Status: Working
Model: Opus

Tabs
────────────────────────────────────
Chat | Terminal | Files | Diff | Context | Activity

Main content
────────────────────────────────────

Right panel
────────────────────────────────────
Task
Context
Changed files
Checks
Permissions
```

The UI must permit switching between:

```text
native terminal mode
+
rich chat mode
```

without changing the identity of the underlying session.

ACRYL should not make the terminal and chat feel like two unrelated workers.

They are two views into one agent session.

---

# 14. Canonical Room / Context Surface

One of ACRYL's most important differences is persistent shared project context.

Create a first-class **Room / Context** surface.

The room can contain:

```text
Human messages
Agent messages
Decisions
Task events
Artifacts
Handoffs
Reviews
System events
Agent status
```

Example:

```text
PROJECT ROOM

Alex
Let's migrate authentication to OAuth PKCE.

Claude
I inspected the current implementation...

SYSTEM
Worktree created: auth-pkce

Claude
Plan created

CODEX
I reviewed the proposed architecture...

Alex
Proceed.

Claude
Implementation complete.

SYSTEM
8 files changed
24 tests passed

CODEX
Review started
```

This is the **canonical continuity layer**.

Private vendor chat must never visually appear to be the system of record.

---

# 15. Context Panel

Create a dedicated context inspector.

Show:

```text
CURRENT CONTEXT

Task
OAuth migration

Project
ACRYL

Worktree
auth-pkce

Relevant files
src/auth/*
tests/auth/*

Instructions
CLAUDE.md
AGENTS.md

Decisions
ADR-0042

Artifacts
OAuth-plan.md
review.md

Previous agents
Claude Code
Codex

Recent handoff
...
```

Provide:

```text
Inspect
Edit
Pin
Remove
Add
Generate context packet
```

---

# 16. Handoff UX

A handoff must be visible as a first-class event.

Example:

```text
HANDOFF

Claude Code → Codex

Reason
Claude rate limit reached.

Task
Finish OAuth PKCE implementation.

Completed
- endpoint migration
- callback handler
- tests

Changed
8 files

Open
- integration test failure

Decisions
Use PKCE verifier stored server-side

Risks
Callback timeout handling

[Continue with Codex]
```

The user must understand:

> The worker changed. The project did not reset.

---

# 17. Tasks

Tasks are first-class project objects.

Each task should have:

```text
Title
Description
Status
Priority
Assignee
Agent
Worktree
Branch
Files
Artifacts
Context
Checks
Reviews
Timeline
Dependencies
```

Support views:

```text
List
Kanban
Timeline
Calendar
Graph
```

Kanban should be extensible rather than mandatory.

Example:

```text
BACKLOG
────────────────

IN PROGRESS
────────────────
OAuth migration
API redesign

REVIEW
────────────────
Dashboard update

DONE
────────────────
CI fix
```

---

# 18. Task Detail

Task screen:

```text
TASK #0421

OAuth PKCE Migration

Status: Review
Agent: Claude
Worktree: auth-pkce
Branch: feature/oauth-pkce

DESCRIPTION

...

PLAN

✓ inspect current flow
✓ create worktree
✓ migrate callback
✓ add tests
✓ validation

CHANGED FILES

8 files

CHECKS

✓ Typecheck
✓ Unit tests
✓ Lint

REVIEW

2 open comments

ARTIFACTS

plan.md
review.md
handoff.md

NEXT ACTION

Create Pull Request
```

---

# 19. Filesystem

The file browser must be a real primary navigation surface.

Requirements:

```text
recursive tree
hidden files toggle
git decorations
modified state
search
quick open
recent files
pinned files
file type icons
workspace scope
worktree scope
```

Use distinctions for:

```text
modified
new
deleted
ignored
conflict
generated
extension-owned
```

---

# 20. File Search

Search must be global and context-aware.

Search across:

```text
Files
Code
Tasks
Agents
Sessions
Artifacts
Commands
Git history
Extensions
Context
```

This is inspired by the "search everything" direction increasingly appearing in agent workspaces. Orca explicitly exposes native search across worktrees, files, agents and commands. ([Orca][5])

Keyboard-first interaction:

```text
⌘K
```

should open a global search/command switcher.

---

# 21. Code Editor

The central editor should feel professional enough for real development.

Required:

```text
Monaco-style editor
tabs
breadcrumbs
symbols
line numbers
minimap optional
inline diagnostics
find/replace
go to definition
peek
file outline
Git decorations
multi-cursor
formatting
```

Do not make the editor consume the entire identity of the product.

It is one canvas surface among many.

---

# 22. Universal Canvas

Canvas tabs should support:

```text
single surface
split vertical
split horizontal
nested splits
tabs
drag tabs
detach/float
resize
reorder
restore
save layout
named layout
```

Example:

```text
┌──────────────────────────────┬───────────────────────┐
│              CHAT            │        DIFF           │
│                              │                       │
│ Claude                       │ auth.ts              │
│                              │ - old code            │
│ ...                          │ + new code            │
│                              │                       │
├──────────────────────────────┴───────────────────────┤
│                       TERMINAL                        │
│ $ pnpm test                                           │
│ ✓ 84 passed                                           │
└───────────────────────────────────────────────────────┘
```

This is central to ACRYL.

---

# 23. Canvas Surface Types

At minimum define visual archetypes for:

### Chat

Agent conversation.

### Terminal

Real PTY.

### Editor

Source/document editing.

### Diff

Git diff/review.

### Browser

Rendered application or external website.

### Markdown

Native document/plan/spec surface.

### Task

Structured task detail.

### Kanban

Board.

### Diagram

Mermaid/visual diagram.

### Preview

Rendered app/output.

### Git Graph

Branches/commits.

### PR / Review

GitHub/GitLab-style workflow.

### Logs

Runtime/process logs.

### Context

Context graph and context packet.

### Agent Fleet

Multi-agent supervision.

### Extension View

Capability-provided custom UI.

### Evolution

ACRYL Blends evolution workflow.

---

# 24. Terminal UX

The terminal must be treated as a first-class worker surface.

Requirements:

```text
real PTY
tabs
splits
search
scrollback
copy/paste
links
resize
shell selection
working-directory awareness
agent identity
reconnect
session restoration
```

Agent terminals must visually communicate:

```text
working
waiting
completed
failed
```

Orca currently exposes exactly this style of agent-terminal state and persistent terminal interaction. ([Orca][6])

---

# 25. Git

Git is fundamental, not hidden in Settings.

Provide a Git workspace with:

```text
Current branch
Target branch
Working tree
Staged
Unstaged
Commits
Branches
Worktrees
Tags
Remotes
Stashes
History
```

Actions:

```text
Create branch
Create worktree
Switch worktree
Stage
Unstage
Commit
Push
Pull
Fetch
Merge
Rebase
Cherry-pick
Stash
Open PR
```

Use strong visual hierarchy between:

```text
source state
candidate state
review state
integrated state
```

---

# 26. Worktrees

Worktrees are one of the defining concepts of the ADE.

Each worktree should expose:

```text
name
branch
base branch
task
agent
status
path
Git status
ports
session
diff
review
```

Example:

```text
WORKTREES

● auth-pkce
  feature/auth-pkce
  Claude
  8 changed files
  24 tests passed

● api-v2
  feature/api-v2
  Codex
  14 changed files
  review pending

○ docs
  docs/update
  none
```

The product should make it visually obvious that each agent can work independently without stepping over another agent.

Super Engineering, Nimbalyst, Superset and Orca all center isolated worktrees around task execution. ([super.engineering][2])

---

# 27. Diff and Review

Diff is a core workspace surface.

Required:

```text
changed-file list
unified diff
side-by-side diff
line comments
file comments
review threads
viewed state
filter
search
collapse/expand
open file
open originating task
open originating agent
```

Review should preserve provenance:

```text
Task
  ↓
Agent
  ↓
Worktree
  ↓
Diff
  ↓
File
  ↓
Review comment
```

Super Engineering explicitly binds files, diff, threads, agent replies, checks and Git actions to the same worktree. ([super.engineering][7])

---

# 28. AI Diff Annotation

Provide the ability to attach a comment to a specific diff range:

```text
┌─────────────────────────────────────┐
│ + validateToken(token)              │
│                                     │
│ [Add review comment]                │
└─────────────────────────────────────┘
```

Comment:

```text
This should be extracted into the shared auth validator.

[Send to Claude]
[Send to current agent]
```

Orca explicitly uses annotated AI diffs as an interaction pattern. ([Orca][5])

---

# 29. Browser

Browser is a native development surface.

Use cases:

```text
localhost preview
documentation
GitHub
issue tracker
application under development
authentication flow
web debugging
generated app preview
```

Browser should support:

```text
tabs
URL
back/forward
reload
devtools hook
open in external browser
agent-assisted interaction
```

For the future, support an agent-facing Design Mode in which an agent can inspect and manipulate the visible page.

Orca currently exposes browser-based Design Mode, including sending page element information and screenshots to agents. ([Orca][5])

---

# 30. Ports

Display active development ports centrally.

Example:

```text
PORTS

5173  Web App
3000  API
6006  Storybook
4173  Preview

[Open]
[Copy URL]
[Stop]
```

Remote hosts should also surface ports associated with the active workspace.

Superset explicitly exposes ports in its development workspace. ([Superset][8])

---

# 31. Artifacts

Treat artifacts as first-class objects.

Examples:

```text
plan.md
spec.md
ADR.md
review.md
handoff.md
diagram
mockup
screenshot
PDF
JSON
CSV
report
test report
validation report
evolution receipt
```

An artifact should be able to link to:

```text
Task
Agent
Session
Worktree
File
Commit
Review
Decision
Other Artifact
```

This creates the visual basis for ACRYL's persistent context model.

---

# 32. Context Graph

The design should eventually expose relationships between objects.

Example:

```text
TASK
 │
 ├── PLAN
 │    └── DIAGRAM
 │
 ├── AGENT
 │    └── SESSION
 │
 ├── WORKTREE
 │    └── DIFF
 │         └── FILES
 │
 ├── REVIEW
 │
 └── HANDOFF
      └── NEXT AGENT
```

Do not make graph visualization the default experience.

The graph should be an **inspection mode**.

Normal UX should remain fast and simple.

---

# 33. Commands and Command Palette

Create one universal command palette.

Examples:

```text
Create Task
Create Worktree
Start Agent
Switch Agent
Open File
Open Terminal
Open Diff
Create Review
Open Browser
Search Project
Search Everything
Create Handoff
Continue With...
Create Checkpoint
Rollback
Install Extension
Create Layout
Open Settings
```

Commands contributed by plugins should appear automatically.

This is one of the most important examples of the extensibility model.

---

# 34. Shortcuts

Design for keyboard-first operation.

Suggested:

```text
⌘K      Command palette
⌘P      Quick open
⌘ShiftP Global command palette if distinct
⌘B      Sidebar
⌘J      Terminal
⌘ShiftF Search
⌘1-9    Canvas tabs
⌘Enter  Send
Esc     Cancel/close
```

Do not hardcode these if the product eventually allows user-defined keymaps.

---

# 35. Notifications

Notifications should be event-driven, not spammy.

Examples:

```text
Claude needs approval
Codex completed
Tests failed
Rate limit reached
Worktree conflict detected
PR review requested
Extension failed to load
Runtime recovered
Port became available
Agent handoff completed
Evolution activation succeeded
Evolution activation failed
```

Provide an attention queue.

Superset and Orca both explicitly emphasize identifying agents that need the user's attention. ([Superset][9])

---

# 36. Runtime / Health Inspector

ACRYL is not merely an IDE.

It has a runtime.

Therefore provide a developer-mode runtime inspector.

Show:

```text
Profile
Runtime
Cordis root
Owner
Attached surfaces
Plugins
Services
Fibers
Dependencies
Effects
Events
Providers
PTYs
Agents
Jobs
Health
HMR
```

Potential hierarchy:

```text
ACRYL Runtime
│
├── Control
├── Cordis Context
├── Plugins
├── Services
├── Agents
├── PTYs
├── Jobs
├── UI Contributions
└── Extensions
```

This is particularly important for power users.

---

# 37. Plugin / Extension Center

Extensions should have a first-class management UI.

Show:

```text
Installed
Available
Updates
Disabled
Failed
Generated
Private
Core
Sandboxed
```

Each extension:

```text
name
version
author
description
capabilities
permissions
source
compatibility
runtime
UI contributions
health
status
```

Actions:

```text
Install
Update
Enable
Disable
Reload
Inspect
Remove
View source
View permissions
View health
```

---

# 38. Marketplace / Community Market

The market should eventually provide:

```text
Discover
Installable
Installed
Sources
```

The current DSH-derived market model already uses these conceptual views and explicit managed install semantics. ([GitHub][10])

ACRYL should extend the concept beyond basic plugins to:

```text
Extensions
Agents
Agent adapters
Skills
Tools
Widgets
Editors
Integrations
Workflows
Blueprints
Blends
UI components
```

The marketplace must not become the only way to extend ACRYL.

Also support:

```text
local package
private package
Git package
npm package
MCP package
Cordis package
generated package
```

where the actual runtime/security model permits it.

---

# 39. Extension Creation UX

This is strategically important.

The product should contain a path such as:

```text
+ Add capability
```

Then:

```text
What should ACRYL be able to do?

[ Describe the capability... ]

Examples:

"Add a PostgreSQL browser."

"Create a Kanban board for this workspace."

"Build a Markdown editor with live Mermaid preview."

"Add a Figma-like design inspector."

"Create a test coverage dashboard."
```

The agent should be able to:

```text
inspect
plan
generate
validate
install
preview
activate
```

The UI should make this feel like a native ACRYL workflow.

This is the seed of self-extension.

---

# 40. ACRYL Extensibility Model

The UI architecture must visually communicate:

```text
ACRYL Shell
    +
Capability Registry
    +
Plugins
    +
UI Contributions
    +
Commands
    +
Tools
    +
Agents
    +
Workflows
    +
Data
```

Potential contribution surfaces:

```text
navigation.primary
navigation.secondary
workspace.tabs
workspace.editor
workspace.inspector
dashboard.widgets
entity.detail
settings.sections
commandPalette
status
notifications
canvas
canvas-toolbar
task-actions
git-actions
agent-actions
```

These contribution slots are aligned with the Blends specification, which calls for stable shell contribution points while keeping the shell itself stable. 

---

# 41. ACRYL Blends

ACRYL Blends should appear as a future major product layer, not merely a settings page.

Primary conceptual screen:

```text
BLEND

Architecture Office CRM

StemCell:
Small Business CRM 0.1.0

Current generation:
0.7.4

Modules:
Contacts
Projects
Invoices
Approvals
Reports
VAT

Evolution:
+ Supplier approval workflow
+ Project code on invoices

[ Evolve this app... ]
```

---

# 42. "Evolve This App..." Interaction

Make this visually prominent.

Example:

```text
┌──────────────────────────────────────────────┐
│ Evolve this application...                   │
│                                              │
│ "Add supplier approval workflow and require  │
│  project codes on invoices."                 │
│                                              │
│                             [Generate Plan]   │
└──────────────────────────────────────────────┘
```

The user should not need to know:

* Cordis;
* plugin manifests;
* worktrees;
* migrations;
* permission schemas;
* module graphs.

The agent translates the request into those technical operations.

---

# 43. Evolution Plan

After the request:

```text
EVOLUTION PLAN

Intent
Add supplier approval workflow and project codes.

Modules
+ supplier-approval
+ invoice-rules

UI
+ approval queue
+ invoice validation indicator

Data
+ supplier approval state
+ invoice.projectCode

Migration
003_add_supplier_approval.sql

Permissions
+ data:suppliers:write

Risk
Medium

Validation
Pending

Candidate worktree
evolve/supplier-approval
```

Actions:

```text
[Preview]
[Apply]
[Reject]
```

---

# 44. Evolution Preview

Preview should be one of the strongest ACRYL screens.

```text
┌─────────────────────────────────────────────────┐
│ EVOLUTION PREVIEW                               │
├─────────────────────────────────────────────────┤
│                                                 │
│ REQUEST                                         │
│ Add supplier approval workflow                  │
│                                                 │
│ MODULES                                         │
│ + supplier-approval                             │
│ + invoice-rules                                 │
│                                                 │
│ DATA                                            │
│ + supplier.status                               │
│ + invoice.projectCode                           │
│                                                 │
│ UI                                              │
│ + Approval queue                                │
│ + Invoice validation                            │
│                                                 │
│ PERMISSIONS                                     │
│ + supplier write                                │
│                                                 │
│ VALIDATION                                      │
│ ✓ Typecheck                                     │
│ ✓ Unit tests                                    │
│ ✓ Module resolution                             │
│ ✓ Runtime health                                │
│                                                 │
│ GIT                                             │
│ 12 files changed                                │
│ +184 / -31                                      │
│                                                 │
│ [Open Full Diff]                                │
│                                                 │
│          [Reject]   [Apply Evolution]           │
└─────────────────────────────────────────────────┘
```

The Blends specification explicitly defines this preview/approval model. 

---

# 45. Evolution Ledger

Show an evolutionary timeline:

```text
TODAY

+ Added invoice workflow
+ Added supplier approvals

YESTERDAY

+ Added Stripe integration

SEP 17

+ Added project entity

SEP 04

Started from Small Business Blueprint 0.1.0
```

For developers, clicking an event can reveal:

```text
agent
model
intent
plan
base revision
result revision
modules changed
permissions delta
migration
validation
checkpoint
```

---

# 46. Checkpoints

Provide a checkpoint timeline:

```text
KNOWN-GOOD GENERATIONS

● v0.7.4    Current
  invoice rules

● v0.7.3
  supplier module

● v0.7.2
  Stripe integration

● v0.7.1
  project schema
```

Actions:

```text
Inspect
Compare
Restore
Rollback
Create checkpoint
```

---

# 47. Rollback UX

Rollback must be deliberate.

Example:

```text
ROLLBACK TO

v0.7.2
Created: Sep 17
Reason: before Stripe migration

This will restore:

✓ module graph
✓ Git revision
✓ configuration
✓ permissions
✓ compatible runtime state

Database:
Snapshot available

[Cancel]
[Rollback]
```

Do not make rollback look like deleting history.

It is restoration to a known-good generation.

---

# 48. Permissions / Trust UX

Every evolving capability should expose its trust level.

Use:

```text
CORE
TRUSTED
SANDBOXED
```

and capability chips:

```text
filesystem:workspace
network:github.com
process:spawn
data:invoice:write
ui:contribute
terminal:spawn
secret:stripe
```

When an evolution requests a new capability:

```text
PERMISSION CHANGE

Before
data:invoice:read

After
data:invoice:read
data:invoice:write
network:stripe.com

Risk: Medium

[Inspect]
[Approve]
```

This must be comprehensible without exposing implementation internals.

---

# 49. Generated UI

One of ACRYL's long-term differentiators is that the application itself can become extensible.

Therefore the design must allow:

```text
ACRYL shell
      ↓
generated module
      ↓
new route
      ↓
new navigation item
      ↓
new editor
      ↓
new dashboard widget
      ↓
new workflow
```

A generated capability should look like it belongs to the product.

Do not visually distinguish every generated component as a toy.

Instead expose provenance when useful:

```text
Generated by ACRYL
Private module
Version 0.2.1
```

---

# 50. Three UI Trust Tiers

Mirror the Blends architecture.

## Tier A - Controlled declarative UI

For:

```text
forms
lists
tables
dashboards
settings
inspectors
approval dialogs
```

These should look completely native.

## Tier B - Trusted plugin UI

For:

```text
timeline editors
visual builders
waveform editors
advanced charts
domain-specific workspaces
```

These can be richer.

## Tier C - Sandboxed open canvas

For:

```text
generated HTML
micro-apps
experimental UI
third-party generated applications
```

These should visibly have a sandbox/security boundary when relevant.



---

# 51. Notes / Markdown

Markdown must be a serious workspace surface.

Use for:

```text
README
plans
specs
ADRs
handoffs
notes
research
context
reports
documentation
```

The UX should support:

```text
WYSIWYG
source mode
preview
agent edit
diff
comments
links
backlinks
```

Nimbalyst demonstrates the value of treating Markdown and planning documents as first-class agent-workspace artifacts. ([Nimbalyst][3])

---

# 52. Diagrams

Support:

```text
Mermaid
architecture diagrams
flowcharts
sequence diagrams
mind maps
visual canvases
```

A diagram should be linkable to:

```text
Task
Agent
Plan
File
Decision
```

---

# 53. Mockups / Design

ACRYL itself must eventually be capable of opening design artifacts.

Support:

```text
UI mockup
HTML preview
Screenshot
Design document
Canvas
Prototype
```

An agent should be able to work from these artifacts.

---

# 54. Structured Planning

Planning should not be locked to one methodology.

Provide baseline:

```text
Task list
Milestones
Kanban
Dependencies
Timeline
Checklist
```

Then allow extensions for:

```text
GTD
Scrum
Shape Up
custom workflow
project-specific lifecycle
agent pipeline
research workflow
```

This is a direct expression of the convention-over-configuration principle.

---

# 55. Workflow Builder

Longer term, provide a visual workflow surface.

Example:

```text
Trigger
   ↓
Research Agent
   ↓
Implement Agent
   ↓
Test Agent
   ↓
Review Agent
   ↓
Human Approval
   ↓
Merge
```

Nodes should represent capabilities rather than hard-coded vendor agents.

Potential node types:

```text
Agent
Tool
Human Approval
Condition
Task
Git
Browser
Terminal
Webhook
Schedule
Memory
Search
Review
Deploy
Notification
```

---

# 56. Automation

Create an Automation Center.

Examples:

```text
Daily issue triage
Weekly dependency review
CI failure agent
Documentation updater
PR reviewer
Release assistant
Security scanner
Nightly test run
```

Every automation should show:

```text
Trigger
Schedule
Agent
Prompt
Tools
Permissions
Last run
Next run
Status
```

Superset has already moved strongly toward scheduled agents and recurring development automation. ([Superset][4])

---

# 57. Agent Usage / Authentication

Provide an account/provider surface:

```text
Claude
Codex
OpenAI
Gemini
OpenCode
Pi
DeepSeek
Local
ACP
```

Show:

```text
authenticated
not authenticated
expired
rate-limited
active profile
usage
limits
model
```

Do not expose credentials.

Only metadata.

---

# 58. Remote Development

Long-term ACRYL should support:

```text
local machine
SSH machine
remote VM
cloud host
```

A remote workspace must look almost identical to local.

Display:

```text
LOCAL
REMOTE
```

and show:

```text
machine
latency
connection
CPU
RAM
GPU
ports
agent runtime
```

Superset and Orca both expose remote-host development as part of their current ADE model. ([Superset][11])

---

# 59. Multi-Surface Continuity

ACRYL is designed around peer surfaces:

```text
Desktop
TUI
CLI
Web
```

The user should be able to:

```text
start task in GUI
↓
continue in terminal
↓
inspect on web
↓
return to GUI
```

without creating another project state.

The current ACRYL roadmap explicitly treats GUI, TUI and Web as peer presentation surfaces over one runtime/control model. 

---

# 60. Mobile Future

Long-term design should reserve a mobile companion model.

Mobile should focus on:

```text
notifications
agent status
chat
approvals
review
diff inspection
task management
handoffs
runtime health
```

Do not attempt to reproduce the entire desktop canvas.

---

# 61. Global Status Bar

The bottom/status area should provide compact operational state:

```text
main ● clean
3 agents
1 waiting
2 tasks in review
runtime healthy
12:43
```

Potential indicators:

```text
Git
Agent
Runtime
Context
Network
Sync
Ports
Errors
```

Clicking an indicator opens the appropriate diagnostic surface.

---

# 62. Settings

Settings should be extensive but organized.

Sections:

```text
Appearance
Layout
Keyboard
Workspace
Projects
Agents
Models
Authentication
Git
Terminal
Browser
Extensions
Marketplace
Security
Permissions
Automation
Notifications
Context
Memory
Remote
Advanced
Developer
```

The Settings model should reflect capability providers.

For example:

```text
Models

Provider:
Claude
Codex
Gemini
Local

Memory:

Provider:
Local
Hindsight
Mem0
...

Code Graph:

Provider:
None
Lat
OmniGraph
...
```

ACRYL's architecture deliberately treats capabilities as replaceable providers rather than one mandatory implementation. ([GitHub][12])

---

# 63. Default Workspace Layout

The first default layout should be highly usable without configuration.

Suggested:

```text
┌────┬──────────────────┬───────────────────────────┬───────────┐
│ A  │                  │                           │           │
│ C  │  Project Tree    │       Canvas              │ Context   │
│ R  │                  │                           │ / Task    │
│ Y  │  Tasks           │    Chat / Editor /        │           │
│ L  │  Worktrees       │    Terminal / Diff        │           │
│    │                  │                           │           │
├────┴──────────────────┴───────────────────────────┴───────────┤
│ terminal / activity / jobs / ports                            │
└────────────────────────────────────────────────────────────────┘
```

But allow users to save alternatives:

```text
Default
Coding
Review
Agent Fleet
Research
Planning
Debugging
Release
Custom...
```

---

# 64. Layout Presets

Because ACRYL is extensible, layouts should themselves be configurable.

Examples:

### Coding

```text
Files | Editor | Terminal
```

### Agent supervision

```text
Agents | Chat | Diff
```

### Review

```text
Tasks | Diff | Review
```

### Research

```text
Browser | Markdown | Notes
```

### Multi-agent

```text
Agent 1 | Agent 2
Agent 3 | Agent 4
```

### Planning

```text
Tasks | Kanban
Docs  | Diagram
```

---

# 65. Drag-and-Drop Composition

Make composition physically obvious.

Allow:

```text
file → chat
file → agent
task → agent
task → worktree
diff → review
artifact → task
browser → task
agent → canvas
terminal → split
widget → dashboard
extension → navigation
```

Example:

Dragging:

```text
src/auth.ts
```

into chat should create an attachment/context reference.

Dragging a task onto an agent should offer:

```text
Start agent with task
```

---

# 66. Agent-to-UI Interaction

ACRYL agents must be able to control workspace capabilities.

Example:

```text
Claude
  ↓
open file
  ↓
open terminal
  ↓
run test
  ↓
open diff
  ↓
create review
  ↓
request approval
```

The UI should surface such activity as structured events instead of only showing raw terminal output.

---

# 67. Jobs

Long-running tasks should be represented independently of the terminal.

Examples:

```text
Build
Test
Lint
Deploy
Migration
Indexing
Code graph generation
Browser automation
Agent run
```

Show:

```text
Running
Progress
Output
Duration
Owner
Cancelable
Result
```

---

# 68. Activity Timeline

Provide an optional unified activity stream:

```text
15:41 Claude started task
15:42 Worktree created
15:47 4 files modified
15:49 Tests started
15:51 Tests passed
15:52 Codex review requested
15:54 Review comment added
15:56 Claude resumed
```

This is more useful than forcing the user to inspect multiple logs.

---

# 69. Search Everything

Global search should eventually return:

```text
Files
Tasks
Agents
Sessions
Commands
Artifacts
Branches
Commits
Extensions
Providers
Projects
Worktrees
Automations
Decisions
```

Results should show provenance.

Example:

```text
OAuth timeout

FILE
src/auth/callback.ts

TASK
OAuth PKCE migration

SESSION
Claude Code - Sep 21

DECISION
ADR-0042

COMMIT
8d92ab
```

---

# 70. Design Language

Use a professional developer-tool aesthetic:

```text
dense
precise
quiet
high information density
strong hierarchy
minimal decoration
excellent typography
subtle depth
excellent keyboard interaction
```

Avoid:

```text
generic SaaS cards everywhere
huge rounded containers
consumer-app gradients
excessive empty space
gamified agent avatars
decorative AI sparkles
chat-centric presentation
```

ACRYL should look like serious infrastructure.

The product can still be visually distinctive through:

* ACRYL brand geometry;
* subtle translucency;
* strong dark/light themes;
* carefully selected accent color;
* restrained motion;
* crisp borders;
* compact iconography;
* elegant state indicators.

---

# 71. Visual Hierarchy

The hierarchy should be:

```text
1. Current workspace / task
2. Current canvas surface
3. Agent state / activity
4. Context and Git state
5. Supporting details
6. Runtime internals
```

Never allow internal architecture to overpower normal work.

Power-user functionality should be accessible but layered.

---

# 72. Visual States

The design agent must generate states for:

```text
Empty
Loading
Working
Waiting
Success
Warning
Error
Disconnected
Rate limited
Permission required
Conflict
Dirty
Synced
Read-only
Sandboxed
Generated
Experimental
Disabled
Unavailable
```

Each state must have:

* icon;
* text;
* status color;
* accessible label;
* optional action.

---

# 73. Agent Identity System

Each agent provider should have:

```text
icon
name
provider
model
status
color/accent
```

But avoid turning provider branding into the application's visual hierarchy.

Example:

```text
● Claude
● Codex
● Pi
● Gemini
```

Provider identity is metadata.

ACRYL identity remains primary.

---

# 74. Human vs Agent Distinction

In shared rooms:

```text
HUMAN
AGENT
SYSTEM
```

must be visually distinguishable.

Use:

```text
human = conventional message
agent = provider identity + capability status
system = compact timeline event
```

System events should not consume as much visual space as human/agent content.

---

# 75. Extension Ownership

Every extension-provided UI can expose a subtle attribution affordance:

```text
Provided by:
GitHub Extension

or

Private Extension
or

ACRYL Core
```

This matters because eventually the UI itself can become dynamically assembled.

---

# 76. Development Mode

Create an explicit:

```text
Developer Mode
```

rather than showing runtime complexity to everyone.

Developer Mode enables:

```text
Cordis tree
plugin graph
service inspection
Fiber inspection
event stream
permissions
capabilities
providers
runtime health
HMR
loader
module lineage
generated extension source
```

---

# 77. Advanced Runtime Graph

The developer-mode visualization can show:

```text
ACRYL
│
├── Workspace
├── Control
├── Runtime
│   ├── Cordis
│   ├── Services
│   ├── Plugins
│   └── Providers
│
├── Agents
│   ├── Claude
│   ├── Codex
│   └── Pi
│
├── PTYs
│
├── UI Contributions
│
└── Jobs
```

This should be visually inspectable, not merely a raw JSON dump.

---

# 78. Current ACRYL Feature Foundation

The mockup must accurately represent the **current architecture/foundation**, while visually reserving room for planned functionality.

### Current / foundational

```text
ACRYL runtime
Cordis-based composition
Desktop surface
Web surface
TUI / CLI direction
Control plane
Harness runtime
Development Canvas
PTY capability
Agent-control architecture
DSH integration
Plugin architecture
Community market foundation
Profile/runtime lifecycle
HMR
Durable state direction
Agent/session abstractions
Workspace concept
```

The repository explicitly describes the Development Canvas as a primary surface for terminals, coding-agent sessions, files/editors, browser tabs, and future capability-provided views. ([GitHub][1])

### Important implementation-status distinction

Do not mock all future capabilities as though they are already production-complete.

Use a visual model where:

```text
AVAILABLE
FOUNDATION
BETA
PLANNED
EXPERIMENTAL
```

can be represented.

The current roadmap is staged, with runtime/control work preceding complete provider, collaboration, and market expansion. 

---

# 79. Planned ACRYL Feature Set

The design should reserve UI for the following roadmap.

## Runtime

```text
single runtime owner
attach protocol
peer surfaces
lifecycle inspection
recovery
HMR
health
capability negotiation
```

## Agents

```text
Claude Code
Codex
Pi
OpenCode
Gemini CLI
DSH native
ACP agents
future providers
```

## Continuity

```text
canonical room
shared context
structured handoffs
durable sessions
task artifacts
decisions
memory
cross-agent continuation
```

## Git

```text
worktrees
branches
diffs
review
commits
PR/MR
merge
rollback
history
```

## Development Canvas

```text
tabs
splits
terminal
chat
editor
browser
diff
task
documents
widgets
plugins
custom views
```

## Collaboration

```text
rooms
team context
shared decisions
shared artifacts
agent status
handoffs
concurrent work
review
```

## Automation

```text
scheduled jobs
event triggers
workflows
agent automation
CI loops
notifications
```

## Remote

```text
SSH
remote workspace
remote agents
ports
shared host
reconnection
```

## Extensions

```text
plugins
providers
widgets
editors
commands
skills
tools
integrations
layouts
workflows
```

## Marketplace

```text
discover
search
install
update
disable
enable
provenance
compatibility
private packages
community packages
```

## Blends

```text
Blueprints
StemCells
Living Apps
Evolution Plans
module graph
generated modules
UI evolution
data migration
permissions
validation
preview
activation
checkpoints
rollback
lineage
Evolution Ledger
```

---

# 80. Feature Parity Target

The mockup should reach feature parity with the expected baseline established by the current ADE market.

## Baseline features to visibly support

```text
✓ Workspace / Project hierarchy
✓ Git repositories
✓ Git worktrees
✓ Branches
✓ File browser
✓ Search
✓ Code editor
✓ Terminal
✓ Agent chat
✓ Agent sessions
✓ Multiple agents
✓ Agent status
✓ Session history
✓ Diff viewer
✓ Review
✓ Commit
✓ Push
✓ Pull request
✓ Browser
✓ Ports
✓ Split panes
✓ Tabs
✓ Saved layouts
✓ Task tracking
✓ Kanban
✓ Notifications
✓ Command palette
✓ Authentication/provider profiles
✓ Agent configuration
✓ Skills/MCP
✓ Extensions
✓ Automation
✓ Remote workspaces
✓ Context
✓ Artifacts
```

These are not the ACRYL differentiator.

They are the minimum credible ADE baseline.

This is consistent with the feature sets currently exposed by Super Engineering, Nimbalyst, Superset and Orca. ([super.engineering][2])

---

# 81. ACRYL Differentiation Layer

Above that baseline, visually emphasize:

```text
ACRYL-specific

Persistent Project Room
Persistent Canonical Context
Agent-Agnostic Continuity
Cross-Agent Handoffs
Capability Graph
Cordis Runtime
Dynamic UI Contributions
Self-Extension
Extension Generation
Safe Hot Reload
Runtime Inspection
Permission/Trust Model
Evolution Ledger
Checkpoints
Rollback
Blueprints
StemCells
Living Apps
Application Evolution
Private Generated Modules
```

These should progressively become the visual identity of the product.

---

# 82. Critical Product Message

The main UX must communicate this sentence without requiring the user to read documentation:

> **Use ACRYL your way. Start with everything you need. Change anything you want. Add whatever does not exist yet.**

The second layer:

> **Agents are workers inside your environment, not the environment itself.**

The third:

> **Your project survives the agent.**

The long-term fourth:

> **Your application can evolve beyond its original design.**

---

# 83. "Everything Is a Capability"

The design agent should use one recurring UI concept:

```text
Capability
```

Examples:

```text
Terminal capability
Git capability
Browser capability
Agent capability
Memory capability
Search capability
Planner capability
Kanban capability
Editor capability
Database capability
Workflow capability
```

When a capability is unavailable:

```text
+ Add capability
```

When installed:

```text
● Available
```

When disabled:

```text
○ Disabled
```

When broken:

```text
! Needs attention
```

This turns extensibility into an everyday visual primitive.

---

# 84. Default + Custom UX

A highly important pattern:

```text
DEFAULT WORKSPACE

Files
Chat
Terminal
Git
Tasks
Browser

────────────────

CUSTOM CAPABILITIES

CRM Dashboard
Release Board
Database Browser
Architecture Graph
```

The second section should be visibly user-generated/customized.

As additional capabilities are installed, the product naturally grows around the developer.

---

# 85. "Add Anything" Entry Point

There should eventually be a universal affordance:

```text
+
Add
```

with choices:

```text
File
Tab
Terminal
Agent
Task
Worktree
Browser
Widget
Dashboard
Workflow
Command
Extension
Provider
Integration
Blueprint
```

The last option:

```text
Create with Agent...
```

should allow the environment itself to generate something.

---

# 86. Generated Dashboard Example

Show how a user can create:

```text
+ Dashboard

"Show me deployment health across all repositories."
```

Result:

```text
DEPLOYMENT HEALTH

API        ✓ Healthy
Web        ✓ Healthy
Worker     ⚠ 2 errors
Docs       ✓ Healthy

PRs
3 waiting

CI
2 failed
```

This demonstrates the difference between:

```text
fixed IDE
```

and

```text
programmable ADE
```

without needing to explain the architecture.

---

# 87. Generated Kanban Example

The same concept should work for:

```text
+ Workflow
+ Kanban
+ Tracker
+ Dashboard
+ Editor
```

An agent can create a specialized workspace surface.

This is where ACRYL becomes something larger than "agent manager".

---

# 88. Self-Evolving Application Surface

Create a conceptual future screen:

```text
APPLICATION

Architecture Office

Navigation:
Overview
Projects
Invoices
Suppliers
Approvals
Reports

Modules:
✓ Projects
✓ Contacts
✓ Invoices
✓ Supplier Approval
✓ VAT Rules

Evolution
7 generations

[ Evolve this app... ]
```

This should look like a normal application.

Only the "Evolution" affordance reveals that the application itself is modifiable through ACRYL.

---

# 89. Empty States

Every empty surface should teach extensibility.

### Empty dashboard

```text
Nothing here yet.

Add a widget, dashboard, or capability.

[Browse capabilities]
[Create with agent]
```

### Empty task board

```text
No tasks.

[Create task]
[Import issues]
[Ask an agent]
```

### Empty agent fleet

```text
No active agents.

[Start agent]
[Configure provider]
```

### Empty extension area

```text
No capabilities installed.

[Browse Market]
[Create capability]
```

---

# 90. Onboarding

The first-run experience should be extremely short.

### Step 1

```text
Welcome to ACRYL

One persistent workspace.
Any coding agent.
Any workflow.
```

### Step 2

```text
Open Project
```

### Step 3

```text
ACRYL detects:
Git
Node
Claude
Codex
Pi
...
```

### Step 4

```text
Your workspace is ready.

Start with:

[New Task]
[Open Agent]
[Open Terminal]
```

Do not make users configure 30 settings.

That would contradict convention over configuration.

---

# 91. First-Time Project State

After opening a repository:

```text
PROJECT READY

✓ Git detected
✓ Workspace initialized
✓ Context initialized
✓ Terminal ready
✓ Agent providers detected
✓ Development Canvas ready
✓ File index ready

Suggested:
"Describe what you want to build."
```

---

# 92. Main Empty Canvas

When no surface is open:

```text
┌───────────────────────────────────────────────────────┐
│                                                       │
│                      ACRYL                            │
│                                                       │
│       Your development environment is ready.          │
│                                                       │
│  + New Task                                            │
│  + Start Agent                                         │
│  + Open Terminal                                       │
│  + Open File                                           │
│  + Browse Capabilities                                 │
│                                                       │
│  or                                                   │
│                                                       │
│  "What are we building?"                              │
│                                                       │
└───────────────────────────────────────────────────────┘
```

This should feel like an active command center, not an empty IDE.

---

# 93. Responsive Behavior

Although desktop is primary, the information architecture must degrade intelligently.

### Large desktop

```text
Rail
Sidebar
Canvas
Inspector
Bottom panel
```

### Medium

```text
Rail
Sidebar
Canvas
Inspector collapsed
```

### Small desktop

```text
Rail
Canvas
context drawer
```

### Web

```text
workspace navigation
canvas
overlay drawers
```

### Mobile

```text
attention
agents
tasks
chat
review
notifications
```

---

# 94. Accessibility

Required:

```text
WCAG-conscious contrast
keyboard navigation
focus rings
screen-reader labels
reduced motion
semantic controls
tooltips
status text
non-color state indicators
```

Never communicate:

```text
working
failed
approved
```

with color alone.

---

# 95. Animation

Use animation only to communicate:

```text
state change
agent activity
panel transition
loading
connection
success/failure
```

Avoid decorative animation.

Agent activity can use very subtle motion.

---

# 96. Density

ACRYL is an expert tool.

Prefer:

```text
compact rows
information-rich headers
dense sidebars
small status chips
consistent icons
compact controls
```

over excessively large cards.

The interface should remain readable with:

```text
10+ tasks
5+ agents
multiple worktrees
dozens of files
multiple open tabs
```

visible simultaneously.

---

# 97. Design System Components

The design agent must construct a reusable component vocabulary.

## Shell

```text
AppShell
GlobalRail
Sidebar
Canvas
Panel
Drawer
Inspector
StatusBar
Toolbar
```

## Navigation

```text
Breadcrumbs
Tabs
Tree
NavigationItem
CommandPalette
QuickOpen
```

## Agent

```text
AgentAvatar
AgentStatus
AgentCard
AgentRow
AgentSessionHeader
AgentUsage
AgentTimeline
HandoffCard
```

## Git

```text
BranchBadge
WorktreeCard
CommitRow
DiffViewer
DiffFileList
ReviewThread
CheckStatus
PullRequestCard
```

## Tasks

```text
TaskCard
TaskRow
KanbanColumn
TaskDetail
DependencyGraph
Timeline
```

## Canvas

```text
CanvasTab
CanvasPane
SplitPane
SurfaceHeader
SurfaceToolbar
FloatingPanel
LayoutPreset
```

## Context

```text
ContextChip
ContextPanel
ArtifactReference
DecisionCard
HandoffCard
ContextPacket
```

## Runtime

```text
ProviderBadge
CapabilityBadge
PluginRow
HealthIndicator
RuntimeTree
PermissionChip
EventRow
```

## Blends

```text
BlueprintCard
BlendHeader
EvolutionPlan
EvolutionPreview
PermissionDiff
MigrationPanel
ValidationReport
CheckpointRow
EvolutionTimeline
RollbackDialog
```

---

# 98. Component Behavior

Every component must specify:

```text
default
hover
focus
active
disabled
loading
error
empty
selected
dragging
```

For agent-aware components also:

```text
working
waiting
blocked
completed
failed
```

---

# 99. Dark / Light Theme

Support:

```text
Dark
Light
System
```

Dark mode should be the primary design target because the product is a professional development environment.

Do not use pure black everywhere.

Use layers:

```text
base
surface
raised
selected
overlay
modal
```

Light mode should use equivalent structural hierarchy.

---

# 100. Iconography

Use one coherent icon family.

Prefer:

```text
simple
technical
compact
outlined
```

Avoid mixing multiple icon styles.

Provider logos can be used selectively for agent identity.

---

# 101. Typography

Use a highly legible UI font.

Use monospace for:

```text
code
paths
branches
commands
commit hashes
runtime identifiers
logs
diffs
```

Do not use monospace for normal prose.

---

# 102. Design Agent Output Requirements

The design agent must produce a mockup covering at minimum:

```text
1. Home dashboard
2. Project overview
3. Main development canvas
4. Agent fleet
5. Agent session
6. Shared room
7. Tasks
8. Kanban
9. Files
10. Editor
11. Terminal
12. Git
13. Worktrees
14. Diff
15. Review
16. Browser
17. Ports
18. Artifacts
19. Context
20. Command palette
21. Extensions
22. Marketplace
23. Runtime inspector
24. Settings
25. Automations
26. Evolution / Blends
27. Evolution preview
28. Checkpoints
29. Rollback
30. Empty states
```

---

# 103. Required Interactive Prototype Flows

The mockup must demonstrate these complete journeys.

## Flow A - Normal coding

```text
Open project
→ Create task
→ Create worktree
→ Start Claude
→ Agent edits files
→ Tests
→ Diff
→ Review
→ Commit
→ Push
→ PR
```

## Flow B - Parallel agents

```text
Task
→ fan out
→ Claude
→ Codex
→ Pi

Each gets:
worktree
session
terminal
diff

Then:
compare
review
merge
```

## Flow C - Agent handoff

```text
Claude working
→ rate limit
→ handoff
→ Codex continues
→ same task
→ same worktree
→ same context
```

## Flow D - Custom workflow

```text
Add capability
→ describe Kanban
→ agent generates it
→ install
→ new navigation item
→ use it
```

## Flow E - Self-evolution

```text
Evolve app
→ intent
→ plan
→ candidate worktree
→ generated module
→ validation
→ preview
→ permission review
→ activation
→ checkpoint
→ evolution ledger
```

## Flow F - Rollback

```text
Current generation
→ failed evolution
→ inspect
→ rollback
→ known-good generation restored
```

---

# 104. Competitive Baseline vs ACRYL Layer

Do **not** make a visual comparison page between ACRYL and competitors.

Instead encode the baseline functionality naturally.

Conceptually:

```text
                        ACRYL
                          │
       ┌──────────────────┴──────────────────┐
       │                                     │
 Standard ADE                            ACRYL layer
       │                                     │
 ┌─────┼─────┐                    ┌─────────┼──────────┐
 Git  Agent  Terminal             Context  Extensibility
 Diff Tasks Browser               Handoff  Self-evolution
 Worktree Editor                  Runtime  Blends
 Review PRs                       Plugins  Lineage
 Automation                       Providers Rollback
```

The user first gets a great ADE.

Then they discover that the ADE itself is extensible.

Then eventually they discover that applications built inside it can evolve as well.

---

# 105. What NOT to Design

Do not create:

```text
a giant chat-first screen
```

Do not create:

```text
a conventional VS Code clone with an AI panel
```

Do not create:

```text
a Kanban board with terminals attached
```

Do not create:

```text
a dashboard made entirely of cards
```

Do not create:

```text
a separate application for every capability
```

Do not create:

```text
fixed navigation that assumes all capabilities are known in advance
```

Do not create:

```text
one hard-coded "ACRYL workflow"
```

Do not make future extensibility look like a Settings toggle.

It must be a structural property of the UI.

---

# 106. Core Design Principle

The central visual rule is:

```text
STABLE SHELL
+
COMPOSABLE SURFACES
+
PERSISTENT CONTEXT
+
REPLACEABLE AGENTS
+
EXTENSIBLE CAPABILITIES
```

The user should feel that the shell is trustworthy and predictable, while the workspace is open-ended.

---

# 107. The ACRYL UX Formula

Use this as the mental model for the entire design:

```text
ACRYL
=
Workspace
+
Canvas
+
Agents
+
Tools
+
Context
+
Git
+
Tasks
+
Artifacts
+
Capabilities
+
Extensibility
```

Long term:

```text
ACRYL
=
ADE
+
Capability Runtime
+
Self-Extension
+
Living Applications
```

---

# 108. Final Visual Objective

The finished mockup should look like a credible next-generation **Agentic Development Environment**, not a collection of disconnected feature screens.

The visual system must make the following relationships obvious:

```text
Workspace
   ↓
Task
   ↓
Worktree
   ↓
Agent
   ↓
Session
   ↓
Files / Terminal / Tools
   ↓
Diff
   ↓
Review
   ↓
Commit / PR
```

and simultaneously:

```text
Workspace
   ↓
Context
   ↓
Handoff
   ↓
Agent replacement
   ↓
Same task continues
```

and eventually:

```text
Application
   ↓
Evolution request
   ↓
Plan
   ↓
Module
   ↓
UI
   ↓
Data
   ↓
Validation
   ↓
Activation
   ↓
Checkpoint
   ↓
Living application
```

---

# 109. One-Screen Conceptual Summary

The primary ACRYL window should approximately communicate:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ ACRYL   workspace: Architecture Office      3 agents ●  main ●  healthy │
├──────┬───────────────────┬───────────────────────────────────┬────────────┤
│      │ PROJECT           │                                   │ CONTEXT    │
│ A    │                   │          DEVELOPMENT CANVAS       │            │
│ C    │ Tasks             │                                   │ Task       │
│ R    │  • OAuth          │ ┌─────────────────┬─────────────┐ │ Worktree   │
│ Y    │  • Billing        │ │                 │             │ │ Agent      │
│ L    │                   │ │      CHAT       │    DIFF     │ │ Files      │
│      │ Agents            │ │                 │             │ │ Decisions  │
│      │  ● Claude         │ ├─────────────────┴─────────────┤ │            │
│      │  ◐ Codex          │ │            TERMINAL           │ │            │
│      │  ✓ Pi             │ │ $ pnpm test                   │ │            │
│      │                   │ │ ✓ 84 passed                   │ │            │
│      │ Files             │ └────────────────────────────────┘ │            │
│      │ Git               │                                   │            │
│      │ Worktrees         │                                   │            │
│      │ Artifacts         │                                   │            │
│      │                   │                                   │            │
│      │ Extensions        │                                   │            │
├──────┴───────────────────┴───────────────────────────────────┴────────────┤
│ Git: clean   Agents: 3   Tasks: 12   Review: 2   Ports: 4   Runtime: OK  │
└───────────────────────────────────────────────────────────────────────────┘
```

This is the baseline.

The user must then be able to transform it into:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         CUSTOM ACRYL WORKSPACE                            │
├─────────┬────────────────────┬──────────────────────────────┬─────────────┤
│ Projects│ Architecture Graph │ CRM Dashboard                │ Agent Fleet │
│ Tasks   │                    │                              │             │
│ Agents  │ Mermaid            │ Contacts                     │ Claude ●    │
│ Git     │                    │ Pipeline                     │ Codex  ◐    │
│         │                    │ Revenue                      │ Pi     ✓    │
├─────────┴────────────────────┴──────────────────────────────┴─────────────┤
│                 CUSTOM WORKFLOW / AUTOMATION / CONTEXT                    │
└───────────────────────────────────────────────────────────────────────────┘
```

without changing the fundamental ACRYL shell.

That visual transformation is the most important UX statement in the entire design.

---

# 110. Final Prompt to the Design Agent

> **Design ACRYL as a complete, professional Agentic Development Environment using this specification as the product UX contract.**
>
> Start from a strong conventional developer workspace containing project navigation, files, search, editor, terminal, Git, worktrees, diff, review, agents, tasks, browser, artifacts, command palette and settings.
>
> Build the central **Development Canvas** as the main compositional surface. Everything important should be able to appear there as a first-class view: chat, terminals, editors, diffs, browser, tasks, Markdown, diagrams, dashboards, workflows, custom widgets and plugin-provided applications.
>
> Make **persistent project context** and **agent interchangeability** first-class concepts. The user owns the workspace, task, context, artifacts, Git state and history. Claude, Codex, Pi, OpenCode, Gemini, DSH-native agents and future providers are workers attached to that persistent environment.
>
> Make **Git worktrees and task isolation** extremely clear. An agent, task, worktree, session, files, diff and review should visibly belong together.
>
> Make **extensibility** part of the navigation architecture rather than a hidden settings feature. The user must be able to add capabilities, extensions, widgets, workflows, commands, agent providers, editors and domain-specific tools without redesigning the shell.
>
> Make the product's future **self-extension** visible through `Add capability`, `Create with agent`, and `Evolve this app...` interactions.
>
> Add the ACRYL Blends product layer with Blueprints, StemCells, Living Apps, Evolution Plans, generated modules, UI evolution, data migrations, permissions, validation, preview, activation, checkpoints, rollback and Evolution Ledger.
>
> The mockup must contain complete realistic states and flows, not only static happy-path screens.
>
> The design should feel:
>
> ```text
> serious
> technical
> dense
> modern
> keyboard-first
> composable
> extensible
> calm
> powerful
> ```
>
> Avoid making it look like a clone of any individual competitor.
>
> Borrow **interaction patterns and expected functionality**, not brand identity.
>
> The resulting design should communicate one core idea:
>
> **ACRYL gives developers a complete development environment out of the box, while refusing to permanently prescribe how that environment must work. Everything around the stable core can evolve.**
>
> The user starts with convention.
>
> The user ends with their own environment.
>
> And eventually:
>
> **their applications can evolve too.**

---

## Reference sources

ACRYL repository and architecture: ([GitHub][1])

ACRYL roadmap: 

ACRYL Blends evolution/UI architecture: 

Super Engineering: ([super.engineering][2])

Nimbalyst: ([Nimbalyst][3])

Superset: ([Superset][4])

Orca: ([Orca][5])

[1]: https://github.com/acryldev/acryl?utm_source=chatgpt.com "GitHub - acryldev/acryl: ACRYL - Agent Context Relay Yielding Lifecycles. One persistent workspace, one canonical context, any coding agent. · GitHub"
[2]: https://super.engineering/?utm_source=chatgpt.com "super.engineering — The native agent control plane"
[3]: https://nimbalyst.com/product/?utm_source=chatgpt.com "Nimbalyst: What It Is and What It Does | Product Overview"
[4]: https://superset.sh/?utm_source=chatgpt.com "Superset - Orchestrate any coding agent"
[5]: https://www.onorca.dev/?utm_source=chatgpt.com "Orca — The agent development environment"
[6]: https://www.onorca.dev/docs/terminal?utm_source=chatgpt.com "Terminal — Orca Docs"
[7]: https://super.engineering/docs/review-overview/?utm_source=chatgpt.com "Review and ship | super.engineering Docs"
[8]: https://superset.sh/changelog?utm_source=chatgpt.com "Changelog | Superset"
[9]: https://superset.sh/roadmap?utm_source=chatgpt.com "Roadmap | Superset"
[10]: https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/install-and-uninstall.md?utm_source=chatgpt.com "deepseek-harness-desktop/dsh-community-market/docs/install-and-uninstall.md at master · anywhere-labs/deepseek-harness-desktop · GitHub"
[11]: https://superset.sh/changelog/2026-04-27-hosts-settings-terminal-sessions?utm_source=chatgpt.com "Superset 2.0 is in open beta! | Superset"
[12]: https://github.com/acryldev/acryl/blob/main/docs/cordis/cordis_spec.md?utm_source=chatgpt.com "acryl/docs/cordis/cordis_spec.md at main · acryldev/acryl · GitHub"
