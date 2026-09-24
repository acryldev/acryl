# Tasks: ACRYL Agentic Multiplexer ADE, slice 1

**Input**: [design/cordis-mini-design.md](./design/cordis-mini-design.md), [parity-plan.md](./parity-plan.md) decisions of 2026-09-24
**Scope**: Scope A, slice 1 only (registry, `acryl-git`, real diff tab, line comments, optional split). The rail, panel, attention queue, per-worktree tab groups, compare and prototype tabs are separate later slices and get their own task lists.

Conventions: `[P]` can run in parallel with its phase peers. Every task ends with a green `corepack pnpm run check` for the packages it touched and a focused commit, on `main`, explicit `git add` paths.

## Progress ledger (2026-09-24)

The three-pane shell was built in one run, aggregating into `acryl-workspace` as directed (git Host service in the
same package, no separate `acryl-git`). Status against the tasks below:

| Task | Status | Note |
|---|---|---|
| T001-T003 | done | See `research.md` |
| T010-T012 registry | not built | The right pane uses upstream's existing `sidebarRightTabs` registry; canvas tile kinds stay in-package. Revisit when a second tab type wants to live outside the package |
| T020-T023 git service | done, in `acryl-workspace` | `src/workspace-git*.ts`, client `git-api.ts`; tested against real temporary repositories incl. disposal |
| T030-T032 `acryl-tab-diff` | partly | The diff tile reads real git data (`GitDiffPane`) but lives in-package; the manual before/after mode is kept for a plain New Diff tab |
| T033 profile rows and lifecycle allowlist | n/a for now | No new packages, so no new Loader rows |
| T040-T041 line comments | not started | |
| T050 optional split | not started | |
| T060 spec ledger | done | `spec.md` status and tile-kind statement corrected |
| T061 dev log | done | 2026-09-24 entry |

Also built and not in the original list: the `desktop.sidebar` slot and Chats | Projects left pane, per-worktree tab
groups in the canvas, and worktree-scoped PTY start (`cwd`).

## Phase 0: spikes (answer the unknowns before designing further)

- [x] **T001** Spike: prove a Client plugin can provide a service via `ctx.provide` that a second Client plugin injects, that the consumer goes PENDING when the provider is absent, and reactivates when it appears. Model on `plugins/acryl-shortcuts`. Output: see [research.md](./research.md). Done 2026-09-24: PENDING, reactivation and disposal proven on real Cordis 4.0.2. T032 still asserts it through the real Loader.
- [x] **T002** [P] Spike: find how a Client plugin can append a user message to the current session (`dsh-client-ui-session`, `dsh-api-session-controller`). Output: the exact call, or a finding that it needs a Host route through `acryl-control`. Done: `ctx.sessions` (inject `sessions`) then `sessionOf(scope(id)).prompt(...)`; no Host route needed. See research.md.
- [x] **T003** [P] Spike: read how the Plugin Lifecycle tab (`desktop.pluginLifecycle`, `pluginLifecyclePatches`) toggles Loader rows, and whether a "Workspace > Tab types" `settings.section` can drive it. Done: yes, live, but new rows must be added to `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`. See research.md.

## Phase 1: the `workspaceTabs` registry (in `acryl-workspace`)

- [ ] **T010** Define the `WorkspaceTabType` contract and the `workspaceTabs` registry (`register` returning a disposer, `list`, `subscribe`) and provide it with `ctx.provide`. Unit tests for register, dispose, duplicate `kind` rejection, subscription notification.
- [ ] **T011** Route the `+` menu and tab rendering through the registry, and register the existing seven kinds through it in-package. No behavior change: the existing `acryl-workspace` tests stay green unmodified.
- [ ] **T012** Render a "plugin off" placeholder for a tab whose type is not registered, preserving the tab's state so re-registering restores it. Test both directions.

## Phase 2: `acryl-git` (new package under `plugins/`)

- [ ] **T020** Scaffold `plugins/acryl-git` with Host and Client entries, `cordis.patch.yml` row id `acryl-git`, and register it in `pnpm-workspace.yaml` and `scripts/verify-layout.mjs` in the same commit.
- [ ] **T021** Host: config schema (`roots`, `maxDiffBytes`, `gitPath`) validated before activation. Read-only loopback routes for worktree list, status and unified diff, with same-origin check, worktree allowlist from `git worktree list`, `execFile` with argument arrays, timeout and byte cap, all inside one `ctx.effect` with abort-and-reap disposal.
- [ ] **T022** Host tests against a real temporary repo with two worktrees: list, status letters (M, A, D, R), diff, path traversal rejected, unlisted worktree rejected, oversized diff truncated with marker, disposal mid-diff leaves no child process.
- [ ] **T023** Client: `acrylGit` typed fetch wrapper provided via `ctx.provide`, with a validated response boundary (no unchecked JSON casts).

## Phase 3: `acryl-tab-diff` (new package)

- [ ] **T030** Scaffold `plugins/acryl-tab-diff`, row id `acryl-tab-diff`, registered in the workspace file and layout check. Registers tab type `diff` inside one `ctx.effect`; hard-injects `workspaceTabs` and `acrylGit`.
- [ ] **T031** Diff tab UI: pick a worktree and a changed file, render the unified diff with add and remove lines from real data, using `@acryl/ui` components. Remove the pasted-text `diffBefore` and `diffAfter` fields from `acryl-workspace` state, with a migration note in the commit message.
- [ ] **T032** Lifecycle tests with a real Loader: PENDING without `acryl-git`, reactivation when it appears, disable and re-enable restores an open tab, no duplicate registrations after 10 reloads.
- [ ] **T033** Add both rows to `apps/acryl-desktop/src/profile.ts` in advanced mode, and add both entries (`include:acryl-git`, `include:acryl-tab-diff`) to `MANAGED_PLUGIN_LIFECYCLE_ENTRIES` in `apps/acryl-desktop/src/plugin-lifecycle-state.ts` so the Lifecycle tab can toggle them (otherwise they show as protected). Update the profile and lifecycle specs that assert those lists. Verify a headless boot (no graphical launch without your say-so).

## Phase 4: line comments to the agent

- [ ] **T040** Read Orca `components/diff-comments/diff-comment-line-range.ts` and decide adopt or rewrite. If adopted: provenance header naming the upstream path, confirm the copyright line in `THIRD_PARTY_NOTICES.md`, unit tests for range math. UI: select a line or range in the diff, write a comment.
- [ ] **T041** Deliver the comment to the agent as a durable session message with a structured header (file, side, line range, base ref), through `ctx.sessions` as found in T002 (`prompt` with `queue` as the default mode, optional `beginSubmission` echo). Confirm the current-selection accessor outside React. Test that the message reaches the session log.

## Phase 5: optional split (decision 1)

- [ ] **T050** Extend `WorkspaceState` with one optional second pane: open in split, close split, active pane, both panes' tabs restored. Tests on the state machine; render two tabs side by side in `WorkspaceCanvas`.

## Phase 6: ledger and docs

- [ ] **T060** Update `spec.md` to match reality: the shipped canvas has seven tile kinds (it says three), story A3 status, and the resolved open questions 1 and 5. Add the decisions to `plan.md`.
- [ ] **T061** Add the `DEVELOPMENT-LOG.md` entry as a separate documentation commit after the implementation hashes exist.

## Dependencies

T001 -> T010. T010 -> T011 -> T012. T020 -> T021 -> T022, T023. T012 + T023 -> T030 -> T031 -> T032 -> T033. T002 -> T041. T031 -> T040 -> T041. T012 -> T050 (T050 does not need the diff work and can start once the registry exists).

## Definition of done for slice 1

A user with the advanced desktop opens **+ > Diff**, picks a worktree and a changed file, sees the real diff, comments on a line, and the agent receives that comment. Disabling `acryl-tab-diff` or `acryl-git` degrades cleanly and reversibly.
