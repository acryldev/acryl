# ACRYL Runtime and Distribution Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a lean target-specific ACRYL distribution, independently composable optional capabilities, one host-composition contract for TUI/Web/Desktop, and an additive attachable local runtime.

**Architecture:** Preserve the existing direct TUI and Desktop behavior while extracting smaller, explicit runtime capability boundaries. First prove release payload rules, then split dependency ownership, then make shared composition and session contracts real, and only then introduce a loopback local runtime. Every phase is backward-compatible until its replacement passes lifecycle, regression, and artifact checks.

**Tech Stack:** Node.js 24, TypeScript 6, PNPM 11.7, tsdown, Vitest, DeepSeek Harness, Cordis, Electron Builder, target-specific Node archives.

**Spec:** `specs/025-acryl-runtime-distribution/spec.md`

## Global Constraints

- Keep the five release targets: darwin arm64/x64, linux arm64/x64, win32 x64.
- Use `corepack pnpm` only. Do not modify `deepseek-harness/`.
- Keep v0.1.17 TUI authorization, durable session, tool, cancellation, and resume behavior green.
- Do not remove an active boot or packaging path before its replacement has a passing payload and runtime test.
- Every external resource belongs to a Cordis lifecycle owner and is fully disposed.
- Do not add a detached local server until phases 1 through 3 have passed their documented gates.
- Keep every coherent change in a focused commit and add its canonical hash to `docs/DEVELOPMENT-LOG.md` in a subsequent documentation checkpoint.

---

## Technical Context

**Language/Version**: TypeScript 6 on Node 24.

**Primary Dependencies**: DeepSeek Harness/Cordis, pi-tui, Electron, Electron Builder, PNPM package APIs.

**Storage**: Existing DSH profile/session persistence; local endpoint record only in phase 4.

**Testing**: Vitest, Node test runner packaging scripts, target artifact smoke tests, fresh package installation checks.

**Target Platform**: macOS ARM64/x64, Linux ARM64/x64, Windows x64.

**Project Type**: Node CLI, local Web host, Electron desktop application, Cordis plugin system.

**Performance Goals**: Reduce comparable terminal and Desktop artifact bytes by at least 20%; preserve current readiness probes.

**Constraints**: No host Node for portable CLI. Loopback-only server. No raw Cordis context across a remote boundary. Existing pinned Harness behavior remains authoritative.

**Scale/Scope**: One long-lived four-phase milestone. Phase 4 is gated by phase 1-3 evidence.

## Constitution Check

| Principle | Plan response |
|---|---|
| Everything is a plugin | Optional Web, package manager, Market, Canvas, and agent-control behavior become declared capabilities, not kernel switches. |
| Agents are disposable | Durable session records remain runtime-owned and transports project them. |
| Compose DSH, do not fork | New work uses documented DSH/Cordis profile, API, Loader, session, and lifecycle seams only. |
| Canonical state is durable | Runtime endpoint records are transport metadata, not a replacement session/event store. |
| Generated capabilities outside kernel | Plugin manifests and policy stay capability-owned and versioned. |

**Gate result**: Pass. The milestone extracts existing behavior behind smaller capability boundaries rather than adding a second plugin framework.

## Project Structure

```text
specs/025-acryl-runtime-distribution/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   ├── artifact-manifest.md
│   └── runtime-composition.md
├── quickstart.md
├── tasks.md
└── checklists/requirements.md

acryl-harness-runtime/
├── src/
│   ├── index.ts                 # compatibility exports during migration
│   ├── composition.ts           # shared boot/dispose contract
│   ├── capabilities/            # explicit capability composition
│   └── session-bridge.ts        # direct session-client transport
└── tests/

acryl-tui/
├── src/cli/                     # command/feature dispatch
├── src/host/                    # direct runtime transport only
├── src/tui-app/                 # pi-tui presentation
└── tests/

acryl-desktop/
├── src/main.ts                  # Electron-native startup and recovery
├── src/profile.ts               # Desktop profile adapter
├── scripts/                     # package/verification scripts
└── tests/

scripts/
├── build-cli-archive.mjs
├── inspect-artifact.mjs
└── verify-cli-archive-payload.mjs
```

**Structure Decision**: Keep existing packages and introduce deep modules within them first. New workspace packages are created only when an optional capability must be independently installed and published.

## Phase 0 - Baseline and safeguards

1. Capture current v0.1.17 archive/Desktop payload inventories as committed feature evidence, clearly labelling stale historical artifacts versus freshly built baselines.
2. Add a reusable artifact inspector with typed manifest input and unit tests.
3. Add no-regression tests for `acryl --version`, `acryl tui --json`, authorization-enabled TUI command wiring, and existing Desktop closure verification.

**Exit gate**: Baseline measurements and exact forbidden/required payload rules are executable tests.

## Phase 1 - Target-specific payload reduction

1. Teach CLI archive construction to select only the target's optional native packages.
2. Prune only manifest-approved release artifacts: maps, declarations, tests, docs, source, and duplicate CLI library output when not required.
3. Add post-prune module-resolution and no-host-Node archive smoke tests.
4. Configure Desktop packaging for supported Electron languages, target-native dependencies, and a narrower unpack allowlist.
5. Add Desktop packaged-payload verification and fresh size comparison evidence.

**Exit gate**: Every target build rejects foreign native files; local target smoke passes; comparable artifact size targets are met without behavior regression.

## Phase 2 - Capability-owned dependency closure

1. Model capability metadata and core/surface composition selection in `acryl-harness-runtime`.
2. Move Web-only boot/loading dependencies behind a Web capability entry point.
3. Move PNPM/market installation ownership behind a plugin-management capability, retaining Desktop behavior through its adapter.
4. Move Canvas and Market composition out of the core terminal profile.
5. Update CLI command dispatch so unavailable optional features produce explicit guidance.
6. Publish/archive from explicit profile-owned closures rather than a flattened maximal workspace graph.

**Exit gate**: A terminal-only install runs its full session/auth flow with no Web, Market, Canvas, or PNPM closure; each optional feature activates through declared dependencies and disposes cleanly.

## Phase 3 - Shared composition and session client façade

1. Extract `bootAcrylRuntime()` from the direct TUI path with compatibility wrappers.
2. Move Desktop's common profile boot/patched composition into the shared module while retaining Desktop recovery and Electron adapters externally.
3. Define the surface-neutral session client contract and adapt the direct bridge.
4. Adapt the DSH API/Web transport to the same contract, then move surface-visible profile/plugin operations behind Cordis services.
5. Remove duplicate common boot code only after direct, Web, and Desktop parity tests pass.

**Exit gate**: Equivalent fixture operations yield equal durable results through direct and remote transports; Desktop recovery remains intact; no surface receives raw root context remotely.

## Phase 4 - Explicit local runtime and attachment

1. Define loopback endpoint metadata, version negotiation, secret storage boundary, and server lifecycle as Cordis capabilities.
2. Add `acryl serve`, `acryl attach`, and Web attachment behavior without changing current direct launch defaults.
3. Teach Desktop to start/attach through the same contract only after Desktop lifecycle and recovery tests pass.
4. Add detach, stale-record, version-mismatch, simultaneous-client, graceful-stop, and leak tests.

**Exit gate**: A user can explicitly run one runtime, detach and attach supported surfaces, preserve durable work, and shut down with no owned-resource leaks.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Four sequential phases | Distribution, capability boundaries, host composition, and attachment must be independently reversible | A big-bang rewrite would combine payload, lifecycle, packaging, and transport regressions without an isolatable rollback point |
| Optional runtime capabilities | Required to keep terminal core lean while preserving Desktop/Market features | One maximal dependency graph makes every optional subsystem mandatory |
| Local server capability | Required only for explicit simultaneous/long-running surface use | A permanent daemon or distributed control system is not needed for the current direct-launch product |
