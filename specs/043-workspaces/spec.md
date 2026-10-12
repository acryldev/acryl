# Feature Specification: Workspaces (an isolated place to do one piece of work, inside a project)

**Feature Directory**: `specs/043-workspaces`
**Created**: 2026-10-12
**Status**: needs-triage. Spec only; nothing is built. The decisions marked **Q** below are the owner's and come before `plan.md`.
**Authority**: `.specify/memory/constitution.md`, root `CLAUDE.md` (Cordis development protocol; "Architecture and clean-code discipline": one term, one meaning), `specs/040-agentic-multiplexer-ade` (the tree, tab sets per worktree, the canvas), `specs/041-agent-control` (the `workspace.*` tool vocabulary), `specs/001-acryl-refactor-improvements-and-tech-debt` R42 (one owner per piece of state).
**Input**: owner, 2026-10-12: "now i want to have new spec add to acryl the concept of workspaces", after pressing "+" next to the ACRYL project to add something to it (today that "+" creates a branch in its own git worktree).

## Why

Doing several things at once in one repository is ACRYL's core use: a feature in one place, a fix in another, an agent running a long task in a third, each without disturbing the others. Today that works only by assembling parts by hand: a git worktree (the "+" next to a project), chats whose folder happens to be inside it, terminal and agent tabs in that worktree's tab set, and the owner's own naming. Nothing names that bundle, so nothing can create it in one step, show its state, hand it to an agent, review it, or finish it.

Other agent workbenches make this bundle the main unit. Superconductor and Superset (both already create worktrees on this machine; the tree shows `sc-frozen-fluxon-0f52` and `.superset/worktrees/...`) and Conductor call it a **workspace**: an isolated copy of a repository on its own branch, with its own agents, terminals and chats, from creation to merge.

## The word "workspace" today means three different things (the first problem to fix)

| Where | What it calls a workspace | Owner |
| --- | --- | --- |
| ACRYL's left pane, header "WORKSPACES" | a **project**: a git repository or plain folder the user added (`ProjectRegistryState`, saved by the Host in `acryl-settings.yaml` `workspace.projects`) | `acryl-workspace` |
| DSH (`IWorkspaces`, `uiWorkspace`, `dsh-api-workspace-controller`) | a **folder that chats run in**: a registered path with its session ids; DSH creates one when a chat starts in a folder | DSH |
| The `acryl-workspace` package and its canvas | the **tab area** (tab sets per worktree, `WorkspaceGroups`, `WorkspaceCanvas`) | `acryl-workspace` |

One term with three meanings breaks the ubiquitous language (DDD) and already leaks: a project is registered as a DSH workspace when a chat starts there; the "+" labelled "Add workspace" adds a project. This spec gives **workspace** one meaning (below) and renames the other two in ACRYL's own code and UI: **project** for what the user adds, **chat folder** (internal only) for DSH's registration, **tab area** or **canvas** for the tabs.

## The concept

A **workspace** is one isolated place to do one piece of work inside a **project**.

- **Belongs to** exactly one project.
- **Has** a working directory (for a git project: its own worktree on its own branch; for the project's main checkout: the existing folder), a name, a status, and a creation time.
- **Contains** its chats, its agent and terminal tabs, its open files, diffs and review comments, and its layout (the tab set it has today, `WorkspaceGroups` keyed by worktree path).
- **Lifecycle**: `creating` -> `active` -> (`archived` | `merged`) -> `deleted`. Archived keeps the branch and history but stops its agents and hides it; merged means its branch reached the project's base branch; deleted removes the worktree folder (never without confirmation when it has uncommitted changes or unpushed commits).
- **Status shown in the tree**, from facts ACRYL already has: agents running / needing you / done (the attention model), uncommitted changes (+/- counts), commits ahead or behind the base branch, open checks.
- **Identity**: a stable id, not its path (a worktree can move); the path is a property.

```
Project  (repository or folder the user added; was "WORKSPACES" in the tree)
 +- Workspace "main"                 the project's own checkout
 +- Workspace "fix-login"            worktree ../acryl.worktrees/fix-login, branch fix-login
 |   +- chats, agents, terminals, files, diffs, review comments, layout
 +- Workspace "agent: upgrade deps"  created for an agent task, archived after merge
```

## User stories

### US1 - Create a workspace in one step (P1)
From the project's "+" (and the command palette, and an agent's `workspace.create`): give a name or a task; ACRYL creates the branch and worktree from the project's base branch, opens the workspace, and starts its first chat (or an agent chosen in the "+" menu) there.
**Acceptance**: one action creates branch, worktree, tab set and first chat; the tree shows it selected; a second workspace in the same project is independent (its own terminals, chats, changes); the name is unique per project and becomes the branch name by a documented rule.

### US2 - See every workspace's state at a glance (P1)
The tree lists each project's workspaces with status (running, needs you, done, changes, ahead/behind, checks).
**Acceptance**: status comes from the existing models (attention, git status, checks), with no extra polling per workspace beyond today's.

### US3 - Switch between workspaces without losing anything (P1)
Selecting a workspace restores its tabs, its selected tab and its chat exactly as left; agents in other workspaces keep running.
**Acceptance**: covered by `ChatSelection` and the tab sets (spec 001 T064-T070); a workspace switch never opens a chat that belongs to another workspace.

### US4 - Finish a workspace (P2)
Archive, merge (open a pull request, or merge locally into the base branch when the project allows it), or delete.
**Acceptance**: delete refuses (and says why) when there are uncommitted changes or unpushed commits unless confirmed; archive stops the workspace's agents and terminals; a merged or archived workspace can be shown again.

### US5 - Hand a workspace to an agent (P2)
"Do X in a new workspace": an agent (inside the app, or outside through Agent Control or the CLI) creates a workspace, works there, and reports when it is ready for review.
**Acceptance**: `workspace.create`, `workspace.list`, `workspace.status`, `workspace.archive` exist as typed Agent Control tools (spec 041's vocabulary), with the same policy as the UI.

### US6 - Workspaces outside ACRYL appear too (P3)
Worktrees made by git, Superconductor or Superset show as workspaces of their project (as worktrees already do today), marked as external; ACRYL never deletes an external worktree without confirmation.

## Functional requirements (draft)

- **FR-001** One domain type `Workspace` (id, projectId, name, path, branch, status, lifecycle state, createdAt, origin `acryl` | `external`), owned by one module, framework-free (`acryl-control` or a workspace domain module in `acryl-workspace`, decided in `plan.md`). UI and tools read it; neither redefines it.
- **FR-002** A durable workspace record per project under the app instance's home (through `AppInstance`, never `homedir()`), so names, ids and lifecycle survive restarts and worktree moves; the git worktree list stays the source of truth for which folders exist.
- **FR-003** Create, rename, archive, unarchive, delete, and merge-or-PR as operations of that module, each validated (name rules, base branch exists, folder free) and reversible where git allows.
- **FR-004** The tree shows Project -> Workspace; the canvas's tab sets are keyed by workspace id instead of worktree path, migrating the saved tab sets.
- **FR-005** Chats belong to the workspace whose folder contains theirs (today's `chatGroupFor` rule); a chat started from a workspace starts in its folder.
- **FR-006** The same capability on Web and Desktop (declared in `coding-capabilities.ts`); the TUI gets list, switch and create.
- **FR-007** Agent Control tools for every operation, through the normal tool policy.
- **FR-008** Renames in ACRYL's own code and UI per "The word workspace today means three different things": the left pane's header becomes "PROJECTS", the "+" beside a project creates a workspace, and DSH's term is confined to the DSH seam.

## Questions for the owner (block `plan.md`)

- **Q1 - Name.** "Workspace" for the isolated piece of work (Conductor, Superset, Superconductor use it this way) and "project" for the repository? Or keep "workspace" for the repository and call the isolated piece something else ("task", "space", "branch")? Recommendation: workspace for the piece of work, project for the repository.
- **Q2 - Plain folders.** A project that is not a git repository has no branches. Does it have exactly one workspace (the folder itself), or can workspaces there be copies of the folder? Recommendation: exactly one, until there is a need.
- **Q3 - Where worktrees go.** Today's "+" creates them next to the repository (`../acryl.worktrees/<branch>`). Keep that, or put them under the app's home (`~/.acryl/workspaces/<project>/<name>`) like Superconductor? Recommendation: next to the repository (visible, and other tools find them), configurable per project.
- **Q4 - What "+" next to a project does.** Create a workspace straight away (name it later, a generated name like `sc-frozen-fluxon`), or ask for a name first (today's "feature/my-change" field)? Recommendation: create immediately with a generated name the user can rename; the first chat message can rename it.
- **Q5 - Setup per workspace.** Should a new workspace run a project's setup (install dependencies, copy `.env` files) automatically, as Conductor's setup scripts do? Recommendation: yes, an optional per-project setup command, shown as a terminal tab, never silent.
- **Q6 - Merge.** Local merge into the base branch, pull request only (GitHub), or both? Recommendation: both, pull request first when the project has a GitHub remote.
- **Q7 - Archive vs delete defaults** when a workspace's branch is merged: archive automatically, or ask? Recommendation: ask once, with "always archive merged workspaces" as a project setting.

## Non-goals (this milestone)

- Remote or cloud workspaces (a workspace on another machine or container); the model keeps a `location` seam for it but builds only local.
- Changing DSH's own workspace concept or its packages (the pinned upstream is not edited).
- Multi-user sharing of a workspace.

## Success criteria

- One action creates a working workspace (branch, worktree, tab set, first chat) in under 5 s on a warm repository.
- The tree, the tab strip, the chat and Agent Control all name the same thing with the same word; a code search for "workspace" in ACRYL's own sources outside the DSH seam finds only the new meaning.
- Five workspaces in one project with agents running in three of them: switching is instant, and nothing in one is visible or touched in another (the R42 harness extended to workspaces).

## Relation to existing work

- Builds on spec 040's tree and tab sets and spec 001's `ChatSelection` (one owner of the shown chat), which already keys by worktree; this milestone turns "worktree path" into a workspace identity.
- Extends spec 041's `workspace.*` tool namespace from "the tab area" to real workspace operations.
- Spec 036 (Blends) uses "app instance" for a whole running ACRYL; a workspace is inside one app instance, never across instances.
