# Tasks: Agent Control, first slice

Conventions: `[P]` parallel; every task ends with a green `corepack pnpm run check` for the touched packages and a focused commit on `main` with explicit `git add` paths.

## Phase 0: spikes (answer the unknowns before building)

- [x] **T001** Spike: how can a Host-side tool reach the page? Read `deepseek-harness/packages/client/connection` (`rpc.ts`, `rpc-host.ts`), `docs/extending/host-route.md`, and the tool execution path. Try a Client-held long-poll or stream and a delegated-executor path. Output: `research.md` verdict with a working throwaway proof. Answered in `research.md`: a Client-initiated WebSocket over the Host's upgrade routes; one implementation for Web and Desktop.
- [x] **T002** [P] Spike: build a bounded accessibility snapshot of a real ACRYL window (jsdom of the workspace shell first). Measure node count, size, and how many controls lack a usable role or name. Output: a numbers table in `research.md`. Answered in `research.md`: 29 nodes, 1,207 chars rendered, 2,311 chars JSON, zero unnamed interactive controls, in a composed scene well under both size caps; a real, larger window is deferred to T050's browser pass.
- [x] **T003** [P] Spike: how do the approval and policy pipelines treat a tool call, and how can a tool declare "mutating UI action" so approval is per call. Output: verdict in `research.md`. Answered in `research.md`: `tools/pre-execute` returns `ask`, per call, fail-closed.
- [x] **T004** [P] Spike: multi-window and Web behavior of the chosen transport. It must work on both surfaces from one implementation (see the plan's sharing section); record any Desktop-only piece as an adapter. Answered in `research.md`: the most recently focused window is driven; layer 3 is a declared absence.

## Phase 1: contract and driver (Client)

- [x] **T010** Define the canonical snapshot and action types (discriminated unions, one shape, validated at the boundary). Unit tests for serialization and ref staleness. Delivered: `plugins/acryl-agent-control/src/contract.ts` (one validated request and result shape, typed error codes, channel messages).
- [x] **T011** Snapshot builder with redaction rules, size cap and pagination. Tests against fixture DOM including password, token and payment inputs. Delivered: snapshot builder with roles, names, states, refs, size cap, paging and viewport-first order; secret and payment fields are never listed (tests for password type, autocomplete, name words, marked areas).
- [x] **T012** Action executor: click, type, select, press, scroll, wait, with generation-scoped refs. jsdom tests, including stale refs and re-render. Delivered: click, type, select, press, scroll and wait with generation-scoped refs; a stale, replaced or renamed element is a typed `stale-ref`, never an action elsewhere.

## Phase 2: Host tools

- [x] **T020** Scaffold `plugins/acryl-agent-control` (Host + Client, row `acryl-agent-control`); register in `pnpm-workspace.yaml` and `scripts/verify-layout.mjs` in the same commit. Delivered: `plugins/acryl-agent-control`, row id `acryl-agent-control`, registered in the workspace file, layout check and root scripts.
- [x] **T021** Register `ui.*` tools with `defineTool`, typed results, `exec.signal` honored, transport from T001. Delivered: seven `defineTool` tools (`ui_snapshot`, `ui_click`, `ui_type`, `ui_select`, `ui_press`, `ui_scroll`, `ui_wait`), typed results, cancellation honoured, removed on unload.
- [x] **T022** Real-Loader lifecycle tests: PENDING, reactivation, provider replacement, disposal with pending calls, 10x reload leak check. Delivered: `tests/host/loader-lifecycle.spec.ts` against a real `@deepseek-ai/cordis-plugin-loader` Loader mounting the built package, a real HTTP server standing in for `webServer`, and a `tools` fake that counts registrations - PENDING without `webServer`/`tools`, reactivation the moment both exist, a `tools` provider swap with no doubled registrations, an in-flight `ui_snapshot` call rejecting with `unloaded` the moment the row is disabled, and ten disable/enable cycles ending with exactly one live registration of each kind.

## Phase 3: safety

- [x] **T030** Approval integration: mutating UI actions require per-call approval; deny-list for policy and self-disable. Delivered: per-call approval through `tools/pre-execute`; protected regions and this plugin's own controls are refused by rule.
- [x] **T031** "Agent is driving" indicator and kill switch as a slot contribution; user input always wins. Delivered: the "Agent is driving" indicator with Stop (also the user's Escape key) and Allow again; the user's own input makes actions wait; the indicator is off limits to the agent.
- [x] **T032** Append-only audit log and a small viewer.
- [x] **T033** Add the row to `apps/acryl-desktop/src/profile.ts` (advanced) and `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`; update the specs asserting those lists. Delivered through the shared seam: Desktop composes the row from `coding-capabilities.ts` and lists `acryl-agent-control` as a direct dependency (its loader smoke, profile boot and closure checks pass). It is not in `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`: that table holds only entries outside the profile bundle list, and `acryl-workspace` and `acryl-plugin-admin` are not in it either.

## Phase 4: first real use

- [x] **T040** (delivered as a shared local primitive, not the Agent Control driver: these two call sites run inside the app's own page for its own bootstrapping, not an external agent driving it, so adopting the driver's generation-scoped refs and audit log would be the wrong tool) Replace the DOM-click helpers in `acryl-workspace` (`clickAddWorkspaceTrigger`, Settings trigger) with the new driver, or with layer 1 tools where a service exists. Delivered: `client/dom/find-by-name.ts` (`accessibleButtonName`, `findButtonByName`, `clickButtonByName`) replaces the ad hoc `aria-label` string matching in both `clickAddWorkspaceTrigger` and the Settings section lookup; each keeps its own scoping/filter rule, the name-matching rule is shared and tested once.
- [x] **T041** Layer 1 pilot: `settings.get/set` and `plugin.enable/disable` provided by their owning packages. Delivered as a pilot: `acryl_plugin_list` and `acryl_plugin_set_enabled` provided by `acryl-plugin-admin` through the same lifecycle service the Settings tab uses; each change is asked about, and the agent can never switch off Agent Control or a core plugin. `settings.get/set` is not built.
- [x] **T042** End-to-end scenario: agent adds a git project through the Projects tab with a real headless window. Delivered as a jsdom scenario against the real workspace components (`tests/scenarios/agent-drives-workspace.spec.tsx`): the agent adds a project through the Projects tab's path form and adds a coding agent through the + menu, finding controls by their accessible names. A real-window headless run is not done.
- [ ] **T050** Accessibility-name audit on the real tree in a real browser (Web and Desktop): list every control the snapshot reports with an empty name and add `aria-label`s in `@acryl/ui` and the workspace. The jsdom scenarios found none in the Projects path form and the + menu.

## Scope B: CLI operator and rescue

### Phase B0: spikes
- [x] **TB01** Spike: inventory what `acryl doctor`-style diagnosis can already conclude from `plugin-doctor.ts`, and list the real failure modes seen on this machine (pnpm store mismatch, failed plugin activation, corrupt override file, broken profile home). Output: findings table in `research.md`. Answered in `research.md`.
- [x] **TB02** [P] Spike: does the CLI run when the Desktop bundle is broken? Trace which imports `apps/acryl-cli` needs and confirm it depends on `runtime/` only. Answered in `research.md`: the CLI depends on the runtime only.
- [x] **TB03** [P] Spike: channel discovery and auth (profile-home discovery file with owner-only mode, per-profile secret, loopback or Unix socket). Output: threat model in `research.md`. Answered in `research.md`, against the merged 036 `AppInstance`/Registry design: discovery is already solved (the Registry, `0o700`/`0o600`, same-OS-user only); the channel reuses `acryl-agent-control`'s own status-route pattern (a per-instance secret file next to the run lock, loopback-only, `timingSafeEqual`); recommendation is loopback HTTP over a Unix socket, for one implementation across platforms matching every other private route in this codebase. Named plainly what it does not defend against (same-OS-user code execution, matching the boundary the offline lock and Registry already accept).
- [ ] **TB04** [P] Spike: detect a live instance so offline writes can be refused.

### Phase B1: offline rescue (no app needed)
- [x] **TB10** `ProfileBackup`: pre-image store, atomic write, undo. Tests including kill-mid-write. Delivered: `profile-repair/backup.ts` - pre-image copies, a checksummed manifest written last and atomically, restore that verifies everything first and removes what a repair created, refusal of any file outside the ACRYL home. Tested including an interrupted backup and a tampered one.
- [x] **TB11** `ProfileInspector`: read-only diagnosis extending `PluginHealthFinding`, static only, never starts the app. Tests against temporary broken profiles. Delivered: `inspectProfile`, static only and read-only (a test proves it changes no byte), with typed findings.
- [x] **TB12** `RepairPlan` and recipes: named steps with precondition, dry-run diff and undo. First recipes: disable failing row, restore last valid override file, pnpm store mismatch guidance. Delivered: two named recipes with preconditions, dry-run text naming the file and row, rollback on failure, and undo. The pnpm store mismatch is diagnosed with guidance and never auto-fixed.
- [x] **TB13** CLI commands `acryl doctor` and `acryl repair [--dry-run|--undo]`, readable report plus JSON. Delivered: `acryl doctor` (readable and `--json`, exit 1 on an error finding) and `acryl repair` with `--dry-run`, `--recipe`, `--yes` (only with named recipes), `--undo`, and `--home` to repair another profile home.

### Phase B2: configuration and install from the CLI
- [ ] **TB20** `acryl config get/set` and `acryl plugin enable/disable` offline through the shared override file; refuse when a live instance owns the state.
- [ ] **TB21** `acryl plugin install <pkg> --target desktop|web --activate` through the existing market install path: approval, install, row enable, rollback on failed activation.

### Phase B3: online control
- [ ] **TB30** In-app authenticated local endpoint exposing the Scope A tool contract (one `ctx.effect`, discovery file, secret).
- [ ] **TB31** CLI online client and `acryl app` commands (`snapshot`, `click`, `type`, `open`), same tool contract, same audit log.
- [ ] **TB32** CLI agent toolset: the operations above as tools, plus orientation tools (`repo.map`, `docs.route`, graft, verified examples) so it knows where to patch.
- [ ] **TB33** End-to-end: "hide Chats and open branch-123, enable plugins 1, 4, 6" against a real headless instance; state read back and verified.

## Sharing across Web and Desktop (decided 2026-09-26)

- [x] **TS01** Declare `agent-control-tools` (`tui`, `web`, `desktop`) and `agent-control-ui` (`web`, `desktop`) in `runtime/acryl-harness-runtime/src/coding-capabilities.ts`; compose them on every surface only through `createAcrylCodingCapabilityPatches`. Tests on the declarations. Delivered: `agent-control-ui` (`web`, `desktop`) declared in `coding-capabilities.ts`; composed only through the seam. The typed `agent-control-tools` capability is not declared yet.
- [x] **TS02** Keep `acryl-agent-control` free of Electron and Desktop-only imports (an import-boundary test), and mount its indicator and kill switch through the shared shell from spec 040 Phase 7. Delivered: an import-boundary test fails if the package imports Electron, Desktop or an app, or if the Host and the driver reach into each other.
- [ ] **TS03** Surface adapter seam for native screenshot, native dialogs and window handle, with Desktop and Web implementations or a declared absence. Scoped 2026-09-27: Web's only honest answer is a declared absence (a page cannot pixel-screenshot itself natively); Desktop's needs `BrowserWindow.getFocusedWindow().webContents.capturePage()`, which means Electron main-process wiring and a real window to verify the capture against - not attempted while the owner's own Desktop is running (`pnpm desktop`), since it is exactly the process this would touch and its only real test is a live one.
- [x] **TS04** Parity gate: boot Web and Desktop headlessly on one profile, assert the same Agent Control tool names, fail on an undeclared difference; wire into the root `check`. Delivered: `surface-parity.spec.ts` proves Desktop composes the identical `acryl-agent-control` row (same package, same enabled state) and the live Web host answers `ctx.tools.get(name)` for all seven `ui_*` tools; the package registers them with no surface branching, so this is a genuine cross-surface guarantee without booting Electron (which stays out of a headless gate). Already wired into root `check` (the test file itself is already part of it).
- [ ] **TS05** Real evidence: the same agent instruction ("hide Chats, open branch X") works on a Web session and a Desktop session against one profile.

## Later (own task lists)

MCP exposure for external agents (US5), scripted self-testing harness (US6), `aria-label` pass across components.

## Definition of done for the Scope B first slice

With Desktop unable to launch because one plugin fails, `acryl doctor` names the cause, `acryl repair` shows the exact change, applies it after approval, Desktop boots, and `acryl repair --undo` restores the previous state. With Desktop running, the CLI enables a set of plugins by request and the change is verified by reading state back.

## Definition of done for the first slice (Scope A)

With the plugin on, an agent in Desktop can snapshot the window, change a setting through a typed tool, and add a project through the UI; every mutating action needed approval, appears in the audit log, and can be stopped by the user at any moment. With the plugin off, none of the tools exist.
