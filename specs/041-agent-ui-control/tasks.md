# Tasks: Agent UI Control, first slice

Conventions: `[P]` parallel; every task ends with a green `corepack pnpm run check` for the touched packages and a focused commit on `main` with explicit `git add` paths.

## Phase 0: spikes (answer the unknowns before building)

- [ ] **T001** Spike: how can a Host-side tool reach the page? Read `deepseek-harness/packages/client/connection` (`rpc.ts`, `rpc-host.ts`), `docs/extending/host-route.md`, and the tool execution path. Try a Client-held long-poll or stream and a delegated-executor path. Output: `research.md` verdict with a working throwaway proof.
- [ ] **T002** [P] Spike: build a bounded accessibility snapshot of a real ACRYL window (jsdom of the workspace shell first). Measure node count, size, and how many controls lack a usable role or name. Output: a numbers table in `research.md`.
- [ ] **T003** [P] Spike: how do the approval and policy pipelines treat a tool call, and how can a tool declare "mutating UI action" so approval is per call. Output: verdict in `research.md`.
- [ ] **T004** [P] Spike: multi-window and Web behavior of the chosen transport.

## Phase 1: contract and driver (Client)

- [ ] **T010** Define the canonical snapshot and action types (discriminated unions, one shape, validated at the boundary). Unit tests for serialization and ref staleness.
- [ ] **T011** Snapshot builder with redaction rules, size cap and pagination. Tests against fixture DOM including password, token and payment inputs.
- [ ] **T012** Action executor: click, type, select, press, scroll, wait, with generation-scoped refs. jsdom tests, including stale refs and re-render.

## Phase 2: Host tools

- [ ] **T020** Scaffold `plugins/acryl-ui-control` (Host + Client, row `acryl-ui-control`); register in `pnpm-workspace.yaml` and `scripts/verify-layout.mjs` in the same commit.
- [ ] **T021** Register `ui.*` tools with `defineTool`, typed results, `exec.signal` honored, transport from T001.
- [ ] **T022** Real-Loader lifecycle tests: PENDING, reactivation, provider replacement, disposal with pending calls, 10x reload leak check.

## Phase 3: safety

- [ ] **T030** Approval integration: mutating UI actions require per-call approval; deny-list for policy and self-disable.
- [ ] **T031** "Agent is driving" indicator and kill switch as a slot contribution; user input always wins.
- [ ] **T032** Append-only audit log and a small viewer.
- [ ] **T033** Add the row to `apps/acryl-desktop/src/profile.ts` (advanced) and `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`; update the specs asserting those lists.

## Phase 4: first real use

- [ ] **T040** Replace the DOM-click helpers in `acryl-workspace` (`clickAddWorkspaceTrigger`, Settings trigger) with the new driver, or with layer 1 tools where a service exists.
- [ ] **T041** Layer 1 pilot: `settings.get/set` and `plugin.enable/disable` provided by their owning packages.
- [ ] **T042** End-to-end scenario: agent adds a git project through the Projects tab with a real headless window.

## Later (own task lists)

Web parity hardening (US4), MCP exposure for external agents (US5), scripted self-testing harness (US6), `aria-label` pass across components.

## Definition of done for the first slice

With the plugin on, an agent in Desktop can snapshot the window, change a setting through a typed tool, and add a project through the UI; every mutating action needed approval, appears in the audit log, and can be stopped by the user at any moment. With the plugin off, none of the tools exist.
