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
