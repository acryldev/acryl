# Plan: Workspaces (spec 043)

**Decisions** (owner, 2026-10-12: "i approve all", accepting the spec's recommendations): Q1 a project can be in several workspaces; Q2 one tab set per workspace (phased: shared per worktree first, see T006); Q3 shared context first through a generated context file and agent launch wiring, the tool second; Q4 the brief is a file edited in the app, kept in the app home; Q5 Default is an Individual Projects workspace; Q6 workspace icons are the name's first letter, with the name as a tooltip, the Default one a dot.

## Cordis mini-design

1. **Capability and plugin boundary.** Workspaces are part of the project registry that `acryl-workspace` already owns (Host: `src/projects/`, client: `src/client/projects/`). A workspace is a grouping of the same project references, so it belongs with them: one owner for "which folders, in which workspace, which one is current". No new plugin: a separate one would split one invariant (a project's membership) across two owners.
2. **Provides and consumes.** Host: the existing same-origin route `/api/acryl-workspace/projects` gains workspace operations; it consumes `acrylSettings` (the `workspace` section, through `AppInstance`'s home) as today. Client: `ProjectRegistryState` gains the workspace list and the current workspace; `ProjectsSidebar` and `ChatSelection` read it. No new service names, no new injections.
3. **Effects and disposal.** No new resources: the route and the settings scope are registered by the existing plugin effects; the client state is a plain store owned by the plugin's `apply`.
4. **Configuration and composition.** The `workspace` settings section gains `workspaces` (list) and `current` (id); `projects` (the pre-workspace list) is read once to build Default and kept only as that migration source. No Loader row changes.
5. **Events and durability.** Durable state is the settings section (one atomic write per operation, as today). No session events: workspaces are app state, not session state.
6. **Verification.** Unit: the registry's operations and migration (Host, against a real settings scope in a temp home); the contract parser; the client state. Live: `scripts/check-features.mjs` gains a workspace check (switch, the sidebar re-renders, switch back), run on Desktop and Web.

## Model

```
WorkspaceKind = 'individual' | 'shared' | 'remote'
Workspace = { id, name, kind, projects: string[], remote?: { host, user?, path? } }
section workspace = { projects (migration only), adopted, workspaces: Workspace[], current: id }
view = { paths (the current workspace's projects), adopted, workspaces: WorkspaceSummary[], current }
```

- Default (`id: 'default'`) always exists, cannot be deleted, and starts with every project the user had (the migration).
- `add` / `remove` act on the current workspace; `adopt` (folders registered before ACRYL owned the list) goes into Default.
- New operations: `create-workspace { name, kind, remote? }` (then switches to it), `switch-workspace { id }`, `rename-workspace { id, name }`, `delete-workspace { id }` (never Default; the projects stay in other workspaces and on disk).

## UI

- The tree's header reads PROJECTS; its "+" adds a project to the current workspace.
- A strip below the tree: Add project (folder with "+"), then one button per workspace (Default as a dot, others by their first letter; the name as tooltip; the current one marked), then New workspace ("+").
- New workspace dialog: "Choose how this workspace should be organized", the three kinds as cards (Remote Machine: host, user, path; "connection setup comes later"), a name, Create and Cancel.
- The tree shows the current workspace's projects. In Default it shows everything it shows today (registered projects and the folders chats ran in).

## Phases

1. Model, Host operations, migration, contract (T001-T002).
2. Client state, rename, the strip, the dialog, the tree filter (T003-T005).
3. Tab sets per workspace (T006), Agent Control tools (T007), the feature check (T008).
4. Shared context (T009-T011), after the switching is in daily use.

## Shared context (T009-T011): mini-design

1. **Capability and plugin boundary.** Part of `acryl-workspace`'s Host (`src/shared-context/`): it reads the registry it owns and starts the terminal agents it owns. One framework-free module renders the context (`render.ts`, with a size budget); one service (`SharedContext`) knows which Shared Context workspace a folder belongs to and keeps the files current. It is provided as the Cordis service `acrylSharedContext` (FR-005), so another mechanism can replace it.
2. **Provides and consumes.** Provides `acrylSharedContext` { `forFolder(path)`, `text(id)`, `brief(id)`, `setBrief(id, text)` }. Consumes the registry (same plugin), `appInstance` (the home), `systemPrompt` (optional, through `ctx.inject`: the DSH chat's context provider) and `acrylTools` (optional: `acryl_workspace_context`). Files: `<home>/workspaces/<id>/BRIEF.md` (the user's, edited in the app) and `<home>/workspaces/<id>/WORKSPACE.md` (generated: projects, the brief, each project's own `CLAUDE.md`/`AGENTS.md`/`README.md` by path, not copied).
3. **Effects and disposal.** A registry subscription (regenerates the files), the system prompt context registration, the tool registration; each in its own effect or injected fiber, released with the plugin. No timers or watchers: the brief changes only through the app's route or the tool.
4. **Configuration and composition.** No new Loader row and no new settings. Only `shared` workspaces carry context; an `individual` workspace contributes nothing, as today.
5. **Events and durability.** The DSH chat gets the context through `systemPrompt.context` (a dynamic, durable user-role snapshot per assembly, so it does not invalidate the cached system prompt), keyed by the session's own folder (`session.header.cwd`). Terminal agents get it at launch: Claude Code `--add-dir` for every other project and `--append-system-prompt` with the context; Pi `--append-system-prompt`; Codex `--add-dir` (no instruction flag confirmed); every agent the environment variable `ACRYL_WORKSPACE_CONTEXT` (the file's path).
6. **Verification.** Unit tests for rendering and the budget, membership (a linked worktree outside the folder, either path separator), the files, the launch arguments; the context provider through the real system prompt service; live: a real model in an isolated Desktop answers "which projects are in this workspace" in a Shared Context workspace without being told, and an Individual one gets nothing.
