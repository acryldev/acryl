# Tasks: ACRYL Rebase onto Native DSH/Cordis Seams

Dependency-ordered. Work on `main` in focused commits; update `docs/DEVELOPMENT-LOG.md` per
checkpoint. `US#` = success criteria / functional req refs from `spec.md`.

- [ ] **T001 [FR-004] Remove the custom desktop terminal launcher** in
      `acryl-desktop/src/desktop-terminal.ts`.
  - Why: `dsh-terminal` is the native seam; `desktop-terminal.ts` is a parallel `child_process`
    launcher duplicating it (already coexists with the DSH-native `terminal.ts`).
  - Depends on: none.
  - RED/GREEN proof: `corepack pnpm run typecheck` (after removing the export, the consumer that
    referenced `./desktop-terminal` breaks → fix by wiring through `ctx.terminals`/`dsh-terminal`).
  - Acceptance: no reference to `desktop-terminal.ts` remains; terminal start runs through the
    DSH terminal seam; `verify` passes.

- [ ] **T002 [FR-003] Re-base the architecture inspector on `dsh-host-plugin-inventory`** —
      delete `acryl-control/src/architecture/projection.ts` (+ `provider.ts`) and
      `acryl-desktop/src/plugin-architecture-inspector.ts`; remove the `FIBER_PHASE` enum and all
      `ctx.root.reflect.store` / `ctx.root.registry.values()` / `fiber.getEffects()` /
      `fiber.inject` / `fiber.store` access.
  - Why: the inspector duplicates `dsh-host-plugin-inventory` and depends on private Cordis
    fields (fragile), and hand-codes the `Fiber.State` enum.
  - Depends on: none.
  - RED/GREEN proof: `grep -rn "ctx.root.reflect.store\|fiber.getEffects\|FIBER_PHASE" acryl-control acryl-desktop`
    returns nothing after the change.
  - Acceptance: `typecheck` + `verify` pass; inventory of plugins/services/effects comes from
    `dsh-host-plugin-inventory` (or the documented Loader/reflect API).

- [ ] **T003 [FR-005] Collapse to one web server** — remove `acryl-desktop/src/webserver.ts`
      duplicate host or make it consume the `acryl web` host.
  - Why: two independent web-server implementations (`acryl-tui` host on 127.0.0.1:3080 and the
    desktop variant) are documented as not reusing each other.
  - Depends on: none.
  - RED/GREEN proof: `grep -rn "DesktopWebServer\|class WebServer" acryl-desktop/src` returns
    nothing after the change.
  - Acceptance: desktop and CLI serve via one host; `verify` passes.

- [ ] **T004 [FR-006-adj] Remove the dead `hello-world` scaffold** — drop the `./hello-world`
      export in `acryl-desktop/package.json` and delete `acryl-desktop/src/hello-world.ts`.
  - Why: dead R&D scaffold shipped in a released package export map.
  - Depends on: none.
  - RED/GREEN proof: `grep -rn "hello-world" acryl-desktop/package.json` returns nothing.
  - Acceptance: package export map no longer exposes `./hello-world`.

- [ ] **T005 [FR-001] Re-point session/transcript/tool projection to `dsh-session-projection`**
      — replace the hand-rolled `transcript()`/`tools()` projections in
      `acryl-harness-runtime/src/session-bridge.ts` and the projection store in
      `acryl-tui/src/tui/store.ts`; `acryl-control` consumes the projection types from the DSH
      package.
  - Why: the session log is the canonical source; projections must derive from it
    (`SessionProjectionRegistry`, `stateOf()`/`snapshot()`), not be rebuilt in 3 places.
  - Depends on: none.
  - RED/GREEN proof: a session replay test asserts UI/tool projection matches
    `dsh-session-projection` output for the same events.
  - Acceptance: single projection source; `typecheck` + `verify` pass; no second session store.

- [ ] **T006 [FR-002] Re-base agent control on `ctx.subagents`/`ctx.agents`** — replace
      `acryl-control/src/agent/agent-control.ts` + `agent/providers/*` with thin adapters; delete
      the custom provider registry, capability vocabulary, and `owner.effect` ownership
      re-implementation. Keep the idiomatic `acryl/*` Cordis events.
  - Why: `dsh-agent`/`dsh-agent-loop`/`dsh-subagent`/`dsh-tools` are native; `ctx.subagents`
    already ships claude-code/codex/acp/dsh-sdk backends. The custom registry is a parallel
    framework (and its providers are stubs throwing `transport-unavailable`).
  - Depends on: T005 (control plane should project the same session).
  - RED/GREEN proof: `dsh-native`/`acp`/`claude`/`codex` provider modules no longer exist in
    `acryl-control`; agent attach/dispatch goes through `ctx.subagents`.
  - Acceptance: `typecheck` + `verify` pass; no `AcrAgentControlService` provider map remains.

- [ ] **T007 [FR-002] Reduce the lifecycle controller to a thin `ctx.loader` wrapper** — drop
      the re-mapped `FIBER_PHASE` table in `acryl-control/src/lifecycle/controller.ts`.
  - Why: `@deepseek-ai/cordis-plugin-loader` already exposes enable/disable/reload and the
    `Fiber.State` enum; the hand-rolled phase table duplicates it.
  - Depends on: T002 (removes the sibling internals dependency).
  - RED/GREEN proof: `grep -rn "FIBER_PHASE" acryl-control` returns nothing.
  - Acceptance: enable/disable/reload still works through `ctx.loader`; `verify` passes.

- [ ] **T008 [FR-006] Implement ONE real model-facing Tool as a Cordis plugin** —
      `inject: ['tools']`; `ctx.tools.register(defineTool(...))`; canonical typed output split into
      `output.schema`/`output.render`; honour `exec.signal`; traverse the tool policy/event
      pipeline; dispose on Fiber/provider unload. Choose a genuinely useful first tool (e.g. a
      repo/context status tool) so it is a real consumer, not a demo.
  - Why: this is the hard gate that forces the seams to be real and proves the plugin
    philosophy end-to-end before more abstraction is added.
  - Depends on: T006.
  - RED/GREEN proof: a test calls the tool through `ctx.tools` (not a bypass) and observes a
    typed `tool/call`/`tool/result` pair in the event log; an `exec.signal` aborts cleanly.
  - Acceptance: `typecheck` + `test` pass; tool appears as a typed call in the session log.

- [ ] **T009 [FR-006] Add Loader activation + disposal + reload test** — mount the Tool, reload
      the profile/Fiber, and assert no duplicate registration and full effect release.
  - Why: provider change must unload/reactivate consumers without stale refs or orphaned
    resources (PENDING/LOADING/ACTIVE/FAILED/UNLOADING/DISPOSED).
  - Depends on: T008.
  - RED/GREEN proof: a Loader smoke test asserts exactly one registration after reload and a
    clean disposer run (leak check).
  - Acceptance: `corepack pnpm run test` passes the activation/disposal/reload case.

## Suggested first commit

T001 + T002 together as "remove parallel framework in control plane + desktop" (they are the
highest-confidence, low-risk removals and materially shrink the surface). Then verify
(`typecheck` + `test`), commit, and log in `docs/DEVELOPMENT-LOG.md`.
