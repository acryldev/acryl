# Feature Specification: Workspaces (a switchable set of projects that share context)

**Feature Directory**: `specs/043-workspaces`
**Created**: 2026-10-12 (rewritten the same day from the owner's description and screenshots)
**Status**: needs-triage. Spec only; nothing is built. The questions at the end come before `plan.md`.
**Authority**: `.specify/memory/constitution.md`, root `CLAUDE.md` (Cordis development protocol; "Architecture and clean-code discipline": one term, one meaning; app state only through `AppInstance`), `specs/040-agentic-multiplexer-ade` (the tree, tab sets per worktree), `specs/041-agent-control` (the `workspace.*` tool vocabulary), `specs/001-acryl-refactor-improvements-and-tech-debt` R42 (one owner per piece of state; `ChatSelection`).
**Input**: owner, 2026-10-12, with screenshots of a reference IDE (Superset's sidebar):

> "what we call now 'Workspace' in our side bar we should rename to 'Projects' cuz in fact we add there always a folder which can be git or non-git folder ... we automatically create the work tree, the branch ... these are all folders and branches inside of the same folder."
> "below the side bar we have this strip of icons where our settings are ... icon of folder '+' to add project to current workspace. And the entire sidebar is the workspace, meaning that we can create new one and then the entire sidebar with all of the added projects is re-rendered to other workspace."
> "the idea of workspace is that workspace shares basically the context of all projects added ... a mechanism to easily share the context between all of the projects and all of the agents within the same workspace. This way I can always ask Claude or Pi or any coding agent to look up or to already have in context things that we need without re-explaining or pointing to it through the UI."
> "But first thing is that we really need to have this switching of the workspaces. We start with Default, and Default is always containing what we have."

## The terms (one meaning each)

| Term | Meaning | Today |
| --- | --- | --- |
| **Project** | A folder the user added: a git repository or a plain folder, shown with its own icon (git or folder). Inside a git project: its branches and worktrees, each with its chats, agents and terminals (unchanged from spec 040). | Listed under the sidebar header "WORKSPACES"; this milestone renames the header to **PROJECTS**. |
| **Workspace** | A named, switchable set of projects: the whole sidebar. Switching workspace re-renders the sidebar with that workspace's projects, and their tabs. Projects in one workspace share context with every agent working in any of them. | Does not exist: there is one implicit set, the project list. |
| **Default workspace** | The workspace that always exists and holds every project the user has today. | The current project list. |

"Workspace" is no longer used for a project (the sidebar header, the "Add workspace" button) nor, in ACRYL's own code and UI, for DSH's per-folder chat registration (internal name: chat folder) or the tab area (canvas). DSH's own term stays inside the DSH seam.

## What the user sees

```
PROJECTS                                   +      <- header renamed; "+" adds a project to the current workspace
  [git] acryl                              +      <- a project (git icon); its "+" creates a branch/worktree, as today
     main   frk3, ACRYL_mainFork1, ...            <- worktrees with their chats and agents (unchanged)
     electron-deepseek-shell
  [folder] _projects                              <- a plain-folder project (folder icon)
  [git] cordis_plugins_project
...
[settings] [folder+]          ( ● )  ( ≋ )  ( + )  <- bottom strip
                              Default  other  New workspace
```

- **Bottom strip** (below the tree, where Settings is): Settings; **Add project** (folder with "+") to add a project to the current workspace; then one icon per workspace (Default first, as a dot), each with its name as a tooltip, the current one highlighted; then **New workspace** ("+").
- **Switching**: clicking a workspace icon re-renders the sidebar with that workspace's projects and restores its tabs, selected tab and shown chat. Agents and terminals in the other workspaces keep running; their attention signals (needs you, done) still show on that workspace's icon.
- **New workspace** opens a dialog: "Choose how this workspace should be organized", three kinds, then a name:
  1. **Individual Projects**: "Work in separate repositories with independent worktrees." Best for single-repository changes, maintenance and unrelated tasks; for example one project with many branches to concentrate on. Projects are listed together but no context is shared between them.
  2. **Shared Context**: "Share context across several projects in one workspace." Best for cross-repository coordination and shared interface changes. Every agent in the workspace can see and is told about all its projects (below).
  3. **Remote Machine**: "Create an empty workspace for an SSH host." Saves the target (host, user, path) now; connecting and running there comes later. **Concept only in this milestone**: the dialog offers it and the workspace record keeps its target, nothing connects.
- A project can be in more than one workspace (the same folder in "Default" and in "Shared: payments"); removing it from one workspace never removes it from another or deletes anything on disk.

## Shared context (the reason workspaces exist)

**Need.** In a Shared Context workspace, any coding agent the user works with (the DSH chat, Claude Code, Codex, Pi, or any agent in a terminal tab) already knows the workspace's projects and what matters across them, and can look things up in any of them, without the user re-explaining or pointing through the UI.

**What is shared** (draft, to settle in `plan.md`):
- The workspace's projects: names, paths, kinds (git or folder), current branches and worktrees.
- A workspace brief the user (and agents) can edit: what the workspace is for, conventions, decisions, links; plain markdown, versioned.
- Each project's own agent instructions (`CLAUDE.md`, `AGENTS.md`, `README`), referenced rather than copied.
- Optionally: recent work across the workspace (open chats' titles and summaries, recent commits), bounded so it never floods a model's context.

**How agents get it** (candidates, not decisions; the mechanism must work for agents ACRYL does not control):
- **A workspace context file** generated by ACRYL in a workspace folder under the app instance's home (for example `<home>/workspaces/<id>/WORKSPACE.md`), listing projects and the brief, and pointing to each project's own instructions. Every agent can be pointed at one file.
- **Agent launch wiring**: when ACRYL starts an agent in a terminal tab of this workspace, it passes the context in that agent's own way: Claude Code's `--add-dir` for each project plus the context file, Codex's and Pi's equivalents, the DSH chat's system prompt (a contribution, like spec 037's extension context).
- **A tool or MCP server** (`workspace_context`, `workspace_search`) any agent can call to read the brief and search across all the workspace's projects, served by the Host through the existing loopback tool gateway, with the normal tool policy.
- Agents can append to the brief (decisions, findings), so shared context grows from the work itself; every write is attributed and reversible.

In an Individual Projects workspace none of this crosses projects: each agent sees its own project only, as today.

## User stories

### US1 - Switch workspaces (P1, first)
Default exists and holds every current project. The user creates a second workspace, adds projects to it, and switches between the two from the bottom strip.
**Acceptance**: switching swaps the sidebar's projects and the tabs; the shown chat follows the target workspace's selected tab (through `ChatSelection`); nothing running in the other workspace stops; the choice and each workspace's contents survive a restart; Default cannot be deleted.

### US2 - Rename the project list (P1)
The header reads PROJECTS; the add button reads "Add project"; git and plain-folder projects keep their distinct icons.
**Acceptance**: no ACRYL-owned UI text or ACRYL-owned code name uses "workspace" for a project.

### US3 - Create a workspace from the dialog (P1)
The "+" in the strip opens the New Workspace dialog with the three kinds; the user picks one, names it (a default name offered), and lands in the new, empty workspace with "Add project" ready.
**Acceptance**: Remote Machine stores its target and shows that connection is not available yet; the kind can be changed later between Individual and Shared.

### US4 - Shared context for every agent (P2)
In a Shared Context workspace, an agent started in any of its projects can answer "which projects are in this workspace and where is X implemented across them" without being told, and can read files in the other projects.
**Acceptance**: verified with the DSH chat and with Claude Code in a terminal tab (real-case test, spec 001 T060 style); the context stays within a stated size budget.

### US5 - Agents manage workspaces (P2)
Agent Control tools `workspace.list`, `workspace.switch`, `workspace.create`, `workspace.add_project`, `workspace.context` (read the shared context), through the normal tool policy.

### US6 - Remote machine (P3, concept)
The Remote Machine kind exists in the model and the dialog; connecting, running agents there and syncing are a later milestone.

## Functional requirements (draft)

- **FR-001** One domain type `Workspace` (id, name, kind `individual` | `shared` | `remote`, ordered project references, remote target when `remote`, brief location, createdAt) and the project reference type, owned by one framework-free module; the UI, the Host routes and the tools read it, none redefines it.
- **FR-002** Persisted per app instance through `AppInstance` (never `homedir()`), next to today's project list (`acryl-settings.yaml` `workspace.projects`), with a migration that turns that list into the Default workspace on first start, losing nothing.
- **FR-003** The current workspace is one piece of state with one owner; the tree, the tab sets (`WorkspaceGroups`, keyed per worktree today, gaining the workspace as the outer key) and `ChatSelection` read it.
- **FR-004** Web and Desktop share one implementation (`coding-capabilities.ts`); the TUI gets list and switch.
- **FR-005** The shared-context mechanism is one module with a size budget, whatever delivery it uses, and is replaceable (a Cordis service), so a better mechanism can be swapped in without touching the sidebar.
- **FR-006** Removing a project from a workspace or deleting a workspace never deletes files, branches or chats.

## Questions for the owner (block `plan.md`)

- **Q1 - Same project in several workspaces**: allowed (recommended), or one workspace per project?
- **Q2 - Tabs per workspace**: when the same worktree is in two workspaces, does it keep one tab set (follows the folder) or one per workspace? Recommendation: one per workspace, so each workspace restores exactly as left.
- **Q3 - Shared context delivery first**: which comes first, the generated context file plus agent launch wiring (works for Claude Code, Codex, Pi today), or the `workspace_context` tool/MCP server? Recommendation: the file and launch wiring first, the tool second.
- **Q4 - The brief**: a file the user edits in the app (a Doc tab), with agents allowed to append? Where should it live: in the app home (private) or in a repository (shared with a team)?
- **Q5 - Individual Projects vs Default**: is Default an Individual Projects workspace (no shared context), as today?
- **Q6 - Workspace icons**: name initials, a chosen emoji or color, or the reference IDE's generic icons with the name as a tooltip?

## Non-goals (this milestone)

- Connecting to a remote machine (the kind and its stored target only).
- Changing DSH's own workspace concept or packages (the pinned upstream is not edited).
- Multi-user or team sharing of a workspace.
- Changing how branches and worktrees work inside a project (spec 040 stays as is).

## Success criteria

- Switching between two workspaces with ten projects each takes under 200 ms to show the other sidebar, and never interrupts a running agent.
- After the rename, "workspace" in ACRYL's own UI and code means only the switchable set of projects.
- In a Shared Context workspace, a coding agent answers a cross-project question correctly on its first turn, with no project named by the user.
