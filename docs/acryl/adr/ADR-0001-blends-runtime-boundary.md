# ADR-0001: BLENDS Runtime Boundary Mapping

Status: Accepted (2026-09-14)

Establishes the exact ACRYL runtime boundary where the Blends Differentiation Engine (running in the `blends` repo) meets ACRYL's own Cordis composition services. Maps spec 033's "gap table" findings to concrete file/line citations so implementation phases (B1-B3) have exact contract shapes to target.

## Context

Blends spec (`acryl_blends_project/blends/docs/ACRYL_BLENDS_SPEC.md`) defines a `BlendRuntimeAdapter` interface (§11, §26) that the Differentiation Engine needs to:
1. Mount/unmount rows live without restart
2. Snapshot/restore Fiber state across candidate swaps
3. Checkpoint/rollback a whole profile generation
4. Register agent tools (`blend_inspect`, `blend_plan_create`, etc.) into every runtime

This ADR maps each to ACRYL's actual existing primitives and states which gaps are real vs. already-solved by spec 032 (Universal Hot-Reload).

## Findings

### Hot Reload Boundary (ADR-001)

**Claim:** `entry.update({disabled})` + `fiber.restart()` already swaps individual Cordis rows live for most entries.

**Evidence:**
- `apps/acryl-desktop/src/plugin-lifecycle-controller.ts:227-240` — `PluginLifecycleController.setEnabled(packageName, disabled)` invokes the disable-cascade and disposal path; `activate(packageName)` mounts a row by reusing `ctx.fiber.activate()` and awaiting the Fiber's quiescence.
- `spec 032` (Universal Hot-Reload) T1-T6: verified hot-reload works for plugin disable/enable; T3 revert shows exactly one anti-pattern still unsafe: hot-swapping the `dsh-session-projection` row itself (stateful, owns sessions) without coordinating with in-flight operations.
- `apps/acryl-desktop/tests/desktop-plugins.spec.ts:268-290` — live disable/enable integration test confirms restart is NOT required for most rows.

**Boundary:** Mount/unmount a **known row already in `dsh.profile.bundles`** (i.e., a row the Loader can resolve) = already safe, proven, no new mechanism needed. Mounting a **not-yet-published row** (a generated module) = needs the B2 reconciliation helper to materialize it first, then activate reuses this path.

**Impact on B1/B2:** The full `BlendRuntimeAdapter` interface can express mount/unmount as thin wrappers over `PluginLifecycleController.activate/deactivate` for rows that are already resolvable. B2's task is narrower than originally stated: "make a generated module resolvable, then activate it," not "invent new Loader machinery."

---

### Stable State Ownership (ADR-002)

**Claim:** Cordis `ctx.effect()` discipline already enforces ownership of long-lived resources across reloads.

**Evidence:**
- `docs/cordis/cordis_system_guide_for_coding_agents.md` — authoritative guide: every disposable resource (DB connection, PTY stream, subscription, HTTP listener) must be acquired inside a `ctx.effect()` block and fully released by its disposer. Cordis guarantees the disposer runs before the Fiber unloads, so a reloaded row has a clean slate.
- `runtime/acryl-harness-runtime/src/plugin-lifecycle.ts:177-195` — `disposeFiber(fiber)` calls `fiber.dispose()`, which walks the effect stack in reverse order and runs every registered disposer. This is the enforcement point: if a row doesn't own its resources via `ctx.effect()`, disposing the Fiber does not clean up those resources, and the next activation inherits the leaked state.
- `apps/acryl-desktop/tests/desktop-plugins.spec.ts:337-360` — `correctly disposes resources when a plugin is reactivated` test confirms disposal ordering and that a reactivated row gets a fresh `ctx` (no shared state from before).

**Boundary:** Services/rows that own I/O, DB, PTY, secrets, subscriptions **must** acquire them inside `ctx.effect()`. Services that own UI navigation state, in-memory config, or UI component state (rendered by the client bundle separately) **may** own state outside `ctx.effect()` as long as they handle reload (receiving a new `ctx`, re-initializing their state from persisted config, notifying subscribers of the change). The Fiber disposal path cannot revive UI state that lived only in the renderer's memory; the row must re-emit it after a reload.

**Impact on B1/B2:** `BlendRuntimeAdapter` does not need to implement state snapshot/restore itself. It passes through to the real `ctx.effect()` discipline and row-specific disposal logic already in place. If a generated Blend module doesn't own its resources properly via `ctx.effect()`, the Cordis Loader will still unload it safely — the module is just leaky. B3 (checkpoint/rollback design) must address how to preserve and restore in-memory state that isn't fully captured by `ctx.effect()` alone.

---

### UI Contribution Model (ADR-003)

**Claim:** The renderer has named slots (`renderSlot()` calls) that are stable enough for Blend-contributed modules to target.

**Evidence:**
- `apps/acryl-desktop/src/client/render-slot.ts` — defines `renderSlot(name)` and exports `RENDER_SLOTS` (a map of known slots). Each slot is a named region where the renderer invokes a hook: "if a service registered something for this slot, render it here."
- `apps/acryl-desktop/src/client/plugin-lifecycle-styles.ts:52` — example: `renderSlot('plugin-lifecycle-panel-header')` is a public, extensible slot where rows can inject header UI.
- `apps/acryl-desktop/src/client/DesktopSettingsSection.tsx:178` — example: `renderSlot('settings-panel-item')` collects settings-panel contributions from multiple rows.
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` (§ Cordis on the client side) — states that renderer slots are part of the public contract for plugins to compose into; the list of actual slots is maintained in `RENDER_SLOTS`.

**Boundary:** Slots with names matching patterns like `[feature]-[section]` (`plugin-lifecycle-panel-header`, `settings-panel-item`, `desktop-main-menu-item`) are intended for third-party use and are stable across minor versions. Slots with internal/debug names (prefixed with `__` or undocumented in `RENDER_SLOTS`) are implementation details and may change without notice. A Blend module can target any public slot in `RENDER_SLOTS` with reasonable stability; unstable slots must be called out in release notes if they change.

**Impact on B1/B2:** A generated Blend module can declare UI contributions (e.g., a new sidebar section, a settings panel item) by targeting a public slot. This is not a new mechanism; it reuses the existing `renderSlot` contract. B1 does not need to create new UI-slot infrastructure. B3 (checkpoint design) must track which slots a Blend's generated module contributes to so rollback can cleanly un-render them.

---

### Domain Migration Model (ADR-004)

**Claim:** `@deepseek-ai/dsh-app-boot` and the Harness session/storage stack have a basic SQLite persistence model but no declarative migration system yet.

**Evidence:**
- `@deepseek-ai/dsh-app-boot` (pinned upstream, not source-audited here, only observed behavior): sessions are persisted to SQLite, accessible via `ctx.get('sessionStore')` or similar (DSH-specific internals). The Harness provides a schema but I/O is owned by the engine.
- `apps/acryl-desktop/src/profile-manager.ts:234-245` — `DesktopProfileService` reads/writes profile manifests as JSON files, not DB. Mutating operations (add/remove bundles) rewrite the file atomically via temp + rename.
- No declarative migration or schema-versioning system observed in this repo's own code. DSH's own session persistence (upstream) likely has *some* compatibility story, but it is not exposed as a first-class ACRYL contract yet.

**Boundary:** ACRYL does not own a domain-migration framework. Blends' own Phase 7 (catalog, data tier) will need to decide whether to build migrations on top of DSH's session-persistence layer, use a separate Blend-owned SQLite database (per-Blend, non-shared with ACRYL session state), or defer data-specific concerns to app-provided schemas. B1/B2 do not require migrations; "Zero -> Contacts" (Blends' Phase 4 target vertical slice) can use stateless demo data or in-memory config with no persistence cross-session.

**Impact on B1/B2:** `BlendRuntimeAdapter` does not need a data-adapter interface. Blends can handle data migration separately. If a generated Blend module needs durable state, it can use the existing session/storage services via `ctx.get()` (same as any other Cordis row does today). B3 checkpoint design must note whether checkpoint state includes/excludes per-Blend data.

---

### Agent Facade (ADR-005)

**Claim:** BLENDS' tool facade (`blend_inspect`, `blend_plan_create`, etc.) must compose with ACRYL's existing agent-control-surface, not create a parallel tool registry.

**Evidence:**
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` — defines `AcrylSurfaceTools`, the unified contract for tools exposed to DSH-backed agents (and, in the future, pi-backed agents via an adapter). New tools register by:
  1. Defining the tool as a TypeScript interface extending `AcrylSurfaceTool`.
  2. Installing a provider into `ctx` via `installAcrylSurfaceTools()` (analogous to how market install provides `desktopPnpm` and `desktopPlugins` services).
  3. Registering each tool with `defineTool()` once per Cordis Fiber.
  
  The document explicitly forbids: inventing a second tool registry, tool-registration framework, or parallel agent-tool layer.

- `apps/acryl-desktop/src/runtime.ts:41-60` — the Desktop's own `createDesktopRuntime()` calls `createAcrylCodingCapabilityPatches()` (spec 035, control-surface alignment) which installs the unified tool provider. Market and plugin tools register into this same provider.

**Boundary:** A Blend's agent-facing tools (not the Blends repo's own internal services, only the subset Blends exposes to agents) must:
1. Extend `AcrylSurfaceTool` (or be registered through `AcrylSurfaceTools` provider).
2. Register through the same `createAcrylCodingCapabilityPatches()` / `installAcrylSurfaceTools()` mechanism.
3. Be scoped to the Blend's own lifecycle: available only when the Blend is active, disposed when it is unloaded.

They do NOT need:
- A separate tool registry.
- A new `@acryl/blends-tools` service.
- Special handling for multi-engine (DSH vs. pi). The unified `AcrylSurfaceTools` already abstracts that.

**Impact on B1/B2:** B1's `BlendRuntimeAdapter` interface includes a reference to how Blend-agent tools are registered (`BlendAgentTools`, per Blends spec §10), but the actual registration mechanism (the typed provider contract) is inherited from `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`. No new tool infrastructure is needed. B1 must cite the exact line in `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` where a Blend tool provider would install itself.

---

### Multi-Engine Coordination (ADR-006)

**Claim:** `BlendRuntimeAdapter` (which Cordis rows mount/unmount live) is independent of which engine (DSH vs. pi vs. hybrid) drives the session. However, `BlendAgentTools` registration must coordinate with whatever tool-exposure mechanism specs 028/029 define.

**Evidence:**
- `specs/028-harness-engine-swap/` — defines an "Engine adapter" as the mapping between one concrete engine (DSH, pi) and an engine-neutral `AcrylRuntime` contract. This is about *which agent loop drives a session*, not *how Cordis rows compose*.
- `specs/029-acryl-hybrid-engine/` — extends 028 to support swapping engines mid-session for a hybrid mode.
- **Key finding:** 028/029's engine-adapter is orthogonal to BLENDS. A `CordisBlendRuntimeAdapter` (DSH-backed Cordis composition) does not care if the agent loop is DSH-native, pi, or hybrid — the Cordis Fiber is a substrate that exists regardless of which engine is running the agent turn.
- **Intersection point:** Blends' §10 tool facade (`blend_inspect`, `blend_plan_create`, etc.) must expose tools through whatever uniform cross-engine tool mechanism 028/029 settle on. If 028/029 define a new `AcrylAgentTools` that replaces `AcrylSurfaceTools` or wraps it, Blends' tool registration must adapt to that new mechanism.

**Status of 028/029 as of 2026-09-14:** Both are drafted specs with no committed TypeScript interface yet. They are on a separate, concurrent track and do not block B0-B2. However, **before B1 locks the tool-facade registration shape** (`BlendAgentTools` in the BLENDS spec), B1 must re-check whether 028/029 have a committed interface and update B1's ADR with that citation.

**Impact on B1/B2/B3:**
- B1/B2: `BlendRuntimeAdapter` itself is engine-agnostic. Implement it as a Cordis service contract with no engine assumptions.
- B3: Checkpoint/rollback design does not depend on engine choice either.
- Pre-B1-lock: Verify 028/029 status and update this ADR's tool-registration section if needed.

---

## Consequences

1. **B1 is simpler than originally feared.** `BlendRuntimeAdapter` is a thin wrapper over `PluginLifecycleController` and `ctx.effect()` discipline, not a new Loader mechanism.

2. **B2 is proven.** The `reconcile + activate` sequence already works for the Market; using it for generated Blend modules reuses that pattern exactly.

3. **B3 is the real risk area.** Checkpoint/rollback, state snapshot/restore, and candidate workspaces are all real gaps with no existing ACRYL primitive to reuse. B0 deliberately does not propose implementations here; B3's task is to design them carefully before coding.

4. **Tool registration is NOT a gap.** The unified `AcrylSurfaceTools` already exists and is the right place. Just need to update it if specs 028/029 change the shape before B1 ships.

5. **No data-migration framework is needed for the first vertical slice.** Blends can defer that to Phase 7 (catalog + data tier).

---

## Related

- `specs/033-acryl-blends-runtime-contract/spec.md` — the gap table this ADR unpacks with file/line citations.
- `specs/032-universal-hot-reload/` — foundational work on Fiber dispose/activate that B1/B2 build on.
- `docs/cordis/cordis_system_guide_for_coding_agents.md` — `ctx.effect()` discipline that enforces resource ownership.
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` — unified tool-registration contract.
- `specs/028-harness-engine-swap/`, `specs/029-acryl-hybrid-engine/` — engine-selection work orthogonal to Blends.
