# Tasks: Workspaces (spec 043)

See `plan.md` for the decisions and the mini-design.

## Phase 1 - Model and Host

- [ ] T001 The workspace model and its operations in the project registry (`src/projects/registry.ts`): Default migration from `projects`, create (all three kinds), switch, rename, delete (never Default), add/remove a project in the current workspace, adopt into Default. Unit tests against a real settings scope.
- [ ] T002 The wire contract (`src/projects/contract.ts`) and route: the new operations, validated, refusals with readable messages; the view carries the workspaces and the current one.

## Phase 2 - Client

- [ ] T003 `ProjectRegistryState` holds the workspaces and the current one; `paths()` stays the current workspace's projects.
- [ ] T004 The tree's header reads PROJECTS; the bottom strip (Add project, workspace buttons, New workspace); the New workspace dialog with the three kinds.
- [ ] T005 The tree shows the current workspace's projects (Default: everything, as before); switching re-renders it and shows the workspace's chat.

## Phase 3 - Completeness

- [ ] T006 One tab set per workspace (Q2): `WorkspaceGroups` keyed by workspace and worktree, with the saved tab sets migrated into Default.
- [ ] T007 Agent Control tools `workspace.list`, `workspace.switch`, `workspace.create`, `workspace.add_project`.
- [ ] T008 `scripts/check-features.mjs`: create a workspace, add nothing, switch, the tree changes, switch back; Desktop and Web.

## Phase 4 - Shared context

- [ ] T009 The workspace context file (`<home>/workspaces/<id>/WORKSPACE.md`): projects, brief, pointers to each project's own instructions; regenerated on change.
- [ ] T010 Agent launch wiring: a terminal agent started in a Shared Context workspace gets the context (Claude Code `--add-dir` per project plus the file; Codex and Pi equivalents; the DSH chat through a system-prompt contribution).
- [ ] T011 The `workspace_context` tool through the loopback gateway; the brief editable in a Doc tab.
