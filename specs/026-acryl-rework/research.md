# Research: ACRYL Rebase onto Native DSH/Cordis Seams

## Decision

Remove the parallel-framework debt in ACRYL-owned packages and re-base the control plane +
runtime on the seams DSH/Cordis already ship. Prove the plugin path with exactly one real
model-facing Tool. This is the highest-value first slice because ACRYL's actual
differentiators (room identity, relay/handoff, capability packages) must ride on these seams,
and today they are being re-implemented in parallel.

## Verified facts

- **Native DSH packages exist for every flagged duplication** (matched by package `name`
  field, not folder name):
  - `@deepseek-ai/dsh-session-projection` → `deepseek-harness/packages/session/session-projection/`
  - `@deepseek-ai/dsh-session-stats` → `deepseek-harness/packages/session/session-stats/`
  - `@deepseek-ai/dsh-terminal` → `deepseek-harness/packages/terminal/terminal/`
  - `@deepseek-ai/dsh-subprocess` → `deepseek-harness/packages/subprocess/subprocess/`
  - `@deepseek-ai/dsh-app-boot` → `deepseek-harness/packages/boot/app-boot/`
  - `@deepseek-ai/dsh-agent`, `dsh-agent-loop`, `dsh-subagent`, `dsh-tools`, `dsh-commands`
  - `@deepseek-ai/dsh-host-plugin-inventory` → `deepseek-harness/packages/host/plugin-inventory/`
- **248** scoped `@deepseek-ai/dsh-*` packages exist in `deepseek-harness/packages/`.
- **`acryl-harness-runtime` is already thin and correct**: 4 files / 538 lines; it wraps
  `dsh-app-boot` (`boot`, `loadProfile`, `initProfile`, `composeEntries`) and returns
  `PatchOptions[]`. Keep it as the boundary; do not grow it.
- **Duplication verified in source**:
  - `acryl-harness-runtime/src/session-bridge.ts` hand-rolls `transcript()` and `tools()`
    projections over the durable log instead of `dsh-session-projection`.
    (`dsh-session-projection` exposes `SessionProjectionRegistry`, `ProjectionDefinition`,
    `stateOf()`/`snapshot()`.)
  - `acryl-control/src/agent/agent-control.ts` is a custom provider registry
    (`registerProvider`/`attach`/`dispatch`/`snapshot`, capability vocab, `owner.effect`
    ownership) parallel to `dsh-agent`/`dsh-agent-loop`/`dsh-subagent`/`dsh-tools`.
    Its providers (`dsh-native`, `acp`, `claude`, `codex`) throw `transport-unavailable` in
    `execute` (stubs).
  - `acryl-control/src/architecture/projection.ts` reaches into Cordis internals
    (`ctx.root.reflect.store`, `ctx.root.registry.values()`, `fiber.getEffects()`,
    `fiber.inject`, `fiber.store`) and hand-codes `FIBER_PHASE` 0–5. **CORRECTION:**
    `projectRuntimeArchitecture()` is consumed nowhere (`grep` across all ACRYL src → zero
    callers besides its own barrel export); it is unused/exports-only, so it is safe to remove.
    Native alternative: `dsh-host-plugin-inventory`.
  - ~~`acryl-desktop/src/desktop-terminal.ts` is a custom launcher duplicating `dsh-terminal`~~
    **CORRECTION (verified):** `desktop-terminal.ts` is a LOAD-BEARING Electron/OS-integration
    concern (tray-native macOS/Windows terminal launch), consumed by `electron-runtime.ts`,
    `index.ts` route (line 290), and `desktop-settings-controller.ts`. It is NOT a duplicate of
    `dsh-terminal` — do NOT remove it.
  - ~~`acryl-desktop/src/webserver.ts` re-implements the web host~~ **CORRECTION (verified):**
    `acryl-desktop/webserver` is a DELIBERATE, DOCUMENTED design (Desktop replaces the CLI
    webserver Loader row with it; `docs/DEVELOPMENT-LOG.md`; `profile.ts` lines 80-81,
    767-825). Do NOT remove it.
  - `acryl-desktop/src/hello-world.ts` dead R&D scaffold is still exported via `./hello-world`.
- **Cross-package duplication (same concept in ≥2 packages)**: session/transcript projection
  is implemented in `acryl-harness-runtime/session-bridge.ts`, `acryl-tui/src/tui/store.ts`,
  and declared in `acryl-control` (3×). PTY/terminal is implemented twice inside
  `acryl-desktop`. Architecture/effect inspector appears 3× (`acryl-control/src/architecture/*`,
  `acryl-desktop/src/plugin-architecture-inspector.ts`, TUI `plugins/PluginsOverlay.ts`).
- **Own rules already forbid this**: `AGENTS.md` — "do not introduce a parallel lifecycle,
  dependency-injection, event, tool, or provider framework."
  `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` + `docs/cordis/acryl_cordis_alignment_audit.md`
  add *no second event bus, no second persistence framework, no second terminal/provider
  framework* and mark the Development Canvas's `CANVAS_PTY_COMMAND_IDS` hardcoded agent map as
  **transitional** — the PTY id must not become the runtime handle.

## Assumptions

- The pre-existing analysis docs for each codebase are hypotheses that were verified against
  source; corrections are recorded in `docs/acryl/IDEAS-TO-TAKE-FOR-ACRYL.md`.
- ACRYL will keep consuming DSH composition (profile + bundle + `cordis.patch.yml`) and will
  not vendor its own copy of Cordis.
- Follow-on work (authorization pipeline, room identity, relay, capability package,
  agent-agnostic canvas) is deliberately out of scope for this ledger.

## Alternatives considered

- **Keep the parallel framework and only work around it.** Rejected — it contradicts the
  repo's own `AGENTS.md` rule, grows the surface, and leaves the differentiators unstable.
- **Rewrite the whole `acryl-desktop` at once.** Rejected as too large; FR-001–FR-006 name
  only the confirmed duplicated capabilities, keeping the slice bounded.
- **Vendor/extend DSH to add ACRYL services.** Rejected — `deepseek-harness/` is a pinned,
  unmodified upstream submodule; ACRYL services belong in ACRYL-owned Cordis plugins mounted
  via composition, not in upstream.

## Consequences

- The plan/tasks must remove exactly the duplicated pieces FR-001–FR-006 name and keep
  `acryl-harness-runtime` thin.
- The Tool gate (FR-006) is a hard prerequisite for any further abstraction: it proves the
  plugin path on the native `ctx.tools` seam before more seams are added.
- After removal, the control plane is smaller and depends on stable DSH services (so provider
  swaps move whole families of behavior), which is the DSH seam invariant we want ACRYL to
  inherit.
