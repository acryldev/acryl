# Plan: ACRYL Rebase onto Native DSH/Cordis Seams

## Overview

This plan removes the confirmed parallel-framework debt and proves the plugin path with one
real Tool. It is staged so each step lands a focused, revertable checkpoint that keeps the
TUI + canvas green. Work proceeds directly on `main`, in focused commits, with a
`docs/DEVELOPMENT-LOG.md` entry per checkpoint.

## Cordis mini-design (per AGENTS.md six-part requirement)

### 1. Capability and plugin boundary

The **control-plane rebase** is owned by `acryl-control` (the host-neutral control plane) and
`acryl-harness-runtime` (the DSH profile/runtime boundary). It must NOT own agent state,
session state, or a second runtime. The **Tool gate** is a new ACRYL Cordis plugin that
registers one model-facing tool on `ctx.tools`; it owns nothing but its own defined tool and
its effect-owned resources. All of it lives in ACRYL-owned packages; nothing is added to
`deepseek-harness/`.

### 2. Provides and consumes

- **Consumes (the seams):** `ctx.agents` + `agent/*` events, `ctx.loader`
  (`@deepseek-ai/cordis-plugin-loader`), `ctx.subagents` (`@deepseek-ai/dsh-subagent`),
  `ctx.sessions` + `@deepseek-ai/dsh-session-projection`, `@deepseek-ai/dsh-terminal`,
  `@deepseek-ai/dsh-host-plugin-inventory`, `@deepseek-ai/cordis` (`Context`, `Service`,
  `Events`, `Fiber`).
- **Provides (ACRYL-owned, thin):** the control-plane operation contracts
  (`acryl/operation-settled`, `acryl/agent-runtime-status` — these are already idiomatic Cordis
  events and stay), the wire protocol client, and the **one real Tool** (a Cordis plugin
  registering via `ctx.tools.register(defineTool(...))`).
- **Removed (the parallel framework):** `acryl-control/src/agent/agent-control.ts` custom
  provider registry; `acryl-control/src/architecture/projection.ts` (and its `FIBER_PHASE`);
  `acryl-harness-runtime/src/session-bridge.ts` hand-rolled projections;
  `acryl-desktop/src/desktop-terminal.ts`; `acryl-desktop/src/webserver.ts` duplicate.

### 3. Effects and disposal

Every registration the ACRYL control plane or the Tool makes is acquired inside one owning
`ctx.effect()` and released by its disposer. Cleanup order: tool registrations → event
listeners → service bindings → timers/sockets/PTYs. Cancellation: the Tool honours `exec.signal`
and aborts cleanly on disposal; a provider change unloads consumers without stale references
or duplicate registrations (PENDING/LOADING/ACTIVE/FAILED/UNLOADING/DISPOSED).

### 4. Configuration and composition

No new runtime schema is invented. ACRYL continues to compose via profile + bundle +
`cordis.patch.yml` (the `acryl-harness-runtime` `PatchOptions[]` already does this). Stable
Loader row ids are preserved. The new Tool is a Loader row in an ACRYL-owned bundle/patch;
provider replacement of a Tool solves through `ctx.tools`, never through YAML row order.

### 5. Events and durability

ACRYL control-plane events declare an explicit dispatch mode (default `emit`; replay-critical
facts use `serial` or `waterfall` with explicit `next()`). Durable session facts stay in the
DSH session event log — no second durable store. Tool call/result facts are canonical
`tool/*` events in that log; the surface renders from the projection, not from a parallel
store.

### 6. Verification

Real Loader activation with the Tool registered; provider replacement; disposal of a running
Tool's effect resources; repeated mount/reload without duplicate registration; leak check.
Gates: `corepack pnpm run typecheck`, `corepack pnpm run test`, `corepack pnpm run verify`,
plus an isolated `corepack pnpm run dev` smoke.

## Stage decomposition

### Stage A — delete the parallel framework (P0)

Confident, high-value removals. Each is one focused commit.

- A1: Delete `acryl-desktop/src/desktop-terminal.ts`; route terminal through `dsh-terminal`
  (reuse the existing `terminal.ts` DSH-native plugin). Remove its `./desktop-terminal`
  export.
- A2: Delete `acryl-control/src/architecture/projection.ts` (+ `provider.ts`) and
  `acryl-desktop/src/plugin-architecture-inspector.ts`; consume `dsh-host-plugin-inventory`.
  Remove the `FIBER_PHASE` 0–5 enum and any `ctx.root.reflect.store` / `fiber.getEffects()`
  access.
- A3: Delete `acryl-desktop/src/webserver.ts` duplicate host; reuse `acryl web` (or make the
  desktop consume the same host).
- A4: Remove `acryl-desktop` `./hello-world` export and the `hello-world.ts` scaffold.
- A5: Remove the second/third hand-rolled session projection (`tui/store.ts` projection and
  `session-bridge.ts`) and re-point `acryl-control` + `acryl-tui` at
  `dsh-session-projection`.

### Stage B — re-base the control plane (P1)

- B1: Replace `acryl-control/src/agent/agent-control.ts` + `agent/providers/*` with thin
  adapters over `ctx.subagents` / `ctx.agents`. Delete the custom provider registry,
  capability vocabulary, and `owner.effect` re-implementation. Keep the idiomatic Cordis
  events.
- B2: Reduce the lifecycle controller to a thin wrapper over `ctx.loader` (drop the
  re-mapped `FIBER_PHASE` table).

### Stage C — the Tool gate (FR-006)

- C1: Implement ONE real ACRYL model-facing Tool as a Cordis plugin:
  `inject: ['tools']`; `ctx.tools.register(defineTool(...))`; canonical typed output split into
  `output.schema` / `output.render`; honour `exec.signal`; traverse the tool policy/event
  pipeline; dispose on Fiber/provider unload. Pick a genuinely useful first tool (e.g. a repo
  status/context tool) so it is a real consumer, not a demo.
- C2: Add a Loader activation + disposal + reload test proving no duplicate registration and
  full effect release.

### Stage D — follow-on (out of scope for this ledger, recorded)

Authorization-as-monotonic-pipeline (CodeWhale), room identity (`ctx.acrRoom`) as a projection,
relay/handoff, capability package, and the agent-agnostic canvas routed through
`ctx.subagents`/`ctx.terminals`. These are subsequent ledgers; this ledger only clears the
substrate they must ride on.

## Risks

- Removing `session-bridge.ts` changes how `acryl-tui` renders; must be validated against
  `dsh-session-projection` output shape before cutting over.
- The architecture inspector removal may leave a gap if ACRYL needs a stable inventory API —
  confirm `dsh-host-plugin-inventory` exports what the inspector surfaced; if not, use the
  documented Loader/reflect API rather than private fields.
- Desktop is large; Stage A touches several files — keep each removal isolated so a regression
  is revertable to a precise checkpoint.
