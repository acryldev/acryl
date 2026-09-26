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
| T040-T041 line comments | done (single line) | `+` in the diff gutter, composer, sent as a queued user turn via `ctx.sessions` (`agent-bridge.ts`, `comment-message.ts`). T040 chose to write the line handling fresh rather than adapt Orca's range math, so nothing was copied and no notice entry is needed. Multi-line ranges are not built |
| T050 optional split | done | Tab hover button, split header, swap on select, diffs open beside the chat. Divider is draggable since 2026-09-26 |
| T060 spec ledger | done | `spec.md` status and tile-kind statement corrected |
| T061 dev log | done | 2026-09-24 entry |

2026-09-26 additions: draggable, keyboard-operable split divider with remembered width (`SplitDivider.tsx`, `split-ratio.ts`), and a Review right-pane tab that lists sent line comments per worktree with resolve, reopen and remove (`review-store.ts`, `ReviewBody.tsx`, `review-tab.ts`), and a Checks tab that lists the worktree's package.json scripts (Host read-only route `git/checks`, lockfile-based package manager, script names restricted to a safe pattern) with a Run button that opens a terminal tab in that worktree and types the command (`workspace-checks.ts`, `ChecksBody.tsx`, `checks-tab.ts`). 2026-09-26 (later): one right-panel opener only, `acryl-workspace` reorganized by domain (see its README), and a Files tab with a real CodeMirror 6 editor tab (lazy tree, on-demand syntax highlighting for the major languages, Cmd or Ctrl+S save, drafts kept across tab switches, conflict detection, confined Host routes `files/tree|read|write`). Still open: stage and commit box, multi-line comments, terminal tab persistence, attention queue, status bar.

Also built and not in the original list: creating a branch and worktree from the Projects tab, an extra chat per branch, adding git projects, restart persistence of tabs and the split, hosting the right panel in the frame (a gap found in testing), and the `desktop.sidebar` slot and Chats | Projects left pane, per-worktree tab
groups in the canvas, and worktree-scoped PTY start (`cwd`).

Design page: [ux-ade-now-and-next.html](./design/ux-ade-now-and-next.html) is the single living Lavish document (where we are now with the latest additions in violet, and where we go). The older two pages (`ux-1-where-we-are.html`, `ux-2-where-we-go.html`) are kept for history and are no longer updated.

Related milestone: [041 Agent Control](../041-agent-control/spec.md) lets agents operate this ADE (and the rest of ACRYL) through governed tools; it is separate so 040 stays scoped.

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

## Phase 7: share across Web and Desktop (decided 2026-09-26, before more features)

Every later ADE feature (commit box, search, attention queue, status bar) builds on this, so it comes first. Spec section: "Surface sharing".

- [x] **T070** Spike: inventory what `apps/acryl-desktop/src/client` (layout, `AdvancedFrame`, slot declarations, right-panel hosting) and `profile.ts` do for the workspace, and what `apps/acryl-web` composes today. Output: a table in `research.md` of each piece as shared-ready, needs an adapter, or Desktop-native. Also confirm how the Web profile mounts Client plugins and whether the same `desktop.main`/`rightbar` slots can be declared there. *Done 2026-09-26: table in `research.md`.*
- [x] **T071** Add a `workspace` capability to `runtime/acryl-harness-runtime/src/coding-capabilities.ts` (`surfaces: ['desktop', 'web']`, Loader patches for `acryl-workspace`), and make Desktop compose it through `createAcrylCodingCapabilityPatches` instead of the hand-written row in `profile.ts`. Tests: the declaration, and that Desktop's composed rows are unchanged. *Done 2026-09-26: `workspace` and `advanced-shell` capabilities; Desktop and both Web boot paths compose through them.*
- [x] **T072** Extract the advanced shell into a shared surface-neutral package (proposed `plugins/acryl-shell`, row id equal to package name): slot declarations, layout state and service, `AdvancedFrame`, right-panel host, with the layout-order tsconfig constraint documented. Desktop consumes it; behavior unchanged; Desktop tests stay green. Update `pnpm-workspace.yaml` and `scripts/verify-layout.mjs` in the same commit. *Done 2026-09-26: the shell lives in `plugins/acryl-workspace/src/client/shell` (in the existing package rather than a new `acryl-shell`, keeping one Loader row; detach later if a second consumer appears).*
- [x] **T073** Compose the shared shell and `acryl-workspace` on the Web surface through the same capability declaration. Real headless Web boot: the plugin rows are ACTIVE, the Host routes answer, no Electron import is reachable from the Web bundle. *Done 2026-09-26: the real Web engine boots the workspace, serves its git, files and terminal routes, and lists its client bundle in the served page.*
- [~] **T074** Surface adapters for the parts that differ, as typed seams with a Desktop and a Web implementation: add-project folder chooser (Web: server-side directory browser or path entry with validation), folder drag-drop, window chrome. Replace the DOM-click workaround in `projects-control.ts` with the adapter. *Partly done 2026-09-26: the shell environment and native chrome metrics are seams (Desktop markers versus web); adding a project already uses the window picker where it exists and the upstream flow elsewhere, which browses server folders on Web. Still to do: replace the DOM-click fallback in `projects-control.ts` with a typed adapter, and confirm the Web folder browser end to end.*
- [x] **T075** Parity gate (spec 034 FR-008 applied): one profile, both surfaces booted headlessly, assert identical workspace plugin ids, right-panel tab types and Host route paths, wired into the root `check`. A deliberate slot absence must be declared in the capability data or the gate fails. *Partly done 2026-09-26: `coding-capabilities.spec.ts` asserts identical Web and Desktop workspace rows and shell patches, `profile.spec.ts` asserts Desktop composes the row once, and `workspace-shared.spec.ts` boots the real Web engine. Still to do: one gate that boots both surfaces for one profile and compares the composed rows and route paths, wired into the root `check`.* *Done 2026-09-26: `apps/acryl-desktop/tests/surface-parity.spec.ts` boots the real Desktop composition and the real Web engine, requires every capability declared for both to be composed identically on both, and fails on any row only one surface has unless it is listed with a reason. The root `typecheck`, `test` and `check` now also run the runtime, workspace, plugin-admin, shortcuts and mount-anchors packages.*
- [ ] **T076** Real evidence, not unit tests alone: cold-start Web and Desktop on one throwaway profile, open the same project on both, confirm the same branches, Changes, Review, Checks and Files, and that an edit saved on one shows on the other. Record in `research.md` and the dev log.

## Phase 8: everything else Desktop had, shared (2026-09-26)

- [x] **T080** Extract Settings > Plugins Lifecycle and Architecture (Host routes, projection, Client tabs) out of `acryl-desktop` into the shared `plugins/acryl-plugin-admin` plugin, composed for Web and Desktop through the `plugin-admin` capability; Desktop's controller reuses the shared view. `623b24b`.
- [ ] **T081** Web attention: a shared attention service fed by session events, with the Electron notification as the Desktop adapter and the browser Notification API (permission requested from a user gesture) as the Web adapter.
- [ ] **T082** Diagnostics on Web: give the Web surface file logging, then expose the same export (shared masking and bundling) as a download from Settings; the tray action stays the Desktop adapter.
- [ ] **T083** Blends on Web: decide with spec 033 whether Web composes a selected Blend the way the Desktop launcher does, then share the composition and the Lifecycle tab's Blend view.
- [ ] **T084** Extract one loopback-HTTP library for the three private-route implementations (`acryl-workspace`, `acryl-plugin-admin`, Desktop settings), which are copies of the same security checks today.

## Dependencies

T070 -> T071 -> T072 -> T073 -> T074 -> T075 -> T076 (Phase 7 goes before further ADE features). T001 -> T010. T010 -> T011 -> T012. T020 -> T021 -> T022, T023. T012 + T023 -> T030 -> T031 -> T032 -> T033. T002 -> T041. T031 -> T040 -> T041. T012 -> T050 (T050 does not need the diff work and can start once the registry exists).

## Definition of done for slice 1

A user with the advanced desktop opens **+ > Diff**, picks a worktree and a changed file, sees the real diff, comments on a line, and the agent receives that comment. Disabling `acryl-tab-diff` or `acryl-git` degrades cleanly and reversibly.
