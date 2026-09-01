# Tasks: ACRYL Rebase onto Native DSH/Cordis Seams

> **Correction (2026-09-01):** per-file verification before execution showed several
> earlier tasks over-reached. Tasks were re-scoped against actual consumers. Only tasks
> marked **[verified safe]** remove code that is genuinely dead/unused. Tasks marked
> **[load-bearing]** are NOT safe deletions and were split out so they are not executed as
> removals. Evidence for each is inline.

Dependency-ordered. Work on `main` in focused commits; update `docs/DEVELOPMENT-LOG.md` per
checkpoint. `US#` = success criteria / functional req refs from `spec.md`.

---

## Verified-safe removals (barely-used or dead code)

- [ ] **T002 [FR-003] Remove the unused architecture inspector** — delete
      `acryl-control/src/architecture/projection.ts` and `architecture/provider.ts`, and drop
      the two `export * from './architecture/...'` lines in `acryl-control/src/index.ts`
      (lines 9-10).
  - Why (verified): `projectRuntimeArchitecture()` is barrel-exported but **consumed nowhere**
    in `acryl-control/src`, `acryl-tui/src`, `acryl-desktop/src`, or
    `acryl-harness-runtime/src`. It reaches into Cordis internals
    (`ctx.root.reflect.store`, `ctx.root.registry.values()`, `fiber.getEffects()`) and
    hand-codes a `FIBER_PHASE` 0–5 table duplicating the Cordis `Fiber.State` enum.
  - Scope guard: the TUI has its **own, separate** `plugins/PluginsOverlay.ts` inspector —
    do NOT touch it. The live `FIBER_PHASE` in `acryl-control/src/lifecycle/controller.ts`
    is a **different** table used by the live lifecycle controller (see T007); do not remove it
    here.
  - Depends on: none.
  - RED/GREEN proof: `grep -rn "projectRuntimeArchitecture" acryl-*` → nothing after removal;
    `grep -rn "ctx.root.reflect.store\|fiber.getEffects" acryl-control` → nothing.
  - Acceptance: `corepack pnpm run typecheck` + `verify` pass.

- [ ] **T004 [FR-006-adj] Remove the dead `hello-world` scaffold** — delete
      `acryl-desktop/src/hello-world.ts` and drop the `"./hello-world"` export entry in
      `acryl-desktop/package.json` (lines 50-52).
  - Why (verified): `hello-world.ts` has **no** consumer in `acryl-desktop/src`; it is only
    referenced by its own `package.json` export. Dead R&D scaffold.
  - Depends on: none.
  - RED/GREEN proof: `grep -rn "hello-world" acryl-desktop/package.json` → nothing.
  - Acceptance: export map no longer exposes `./hello-world`.

- [ ] **T006 [FR-002] Remove the unused custom agent-control framework** — delete
      `acryl-control/src/agent/agent-control.ts` + `agent/providers/*`, drop the
      `export * from './agent/agent-control.ts'` line in `acryl-control/src/index.ts` (line 2),
      and remove/replace the `agent-control` specs in `acryl-control/tests`.
  - Why (verified): `AcrAgentControlService` is consumed **only within `acryl-control` itself**
    (its own `providers/*` register into it). No TUI/desktop/runtime consumes it externally;
    the providers (`dsh-native`/`acp`/`claude`/`codex`) are stubs that throw
    `transport-unavailable`. It is a parallel framework to `dsh-agent`/`dsh-agent-loop`/
    `dsh-subagent`/`dsh-tools` with no surface consumer.
  - Depends on: none (it is self-contained).
  - RED/GREEN proof: `grep -rn "AcrAgentControlService\|ctx.acrAgentControl" acryl-tui acryl-desktop acryl-harness-runtime` → nothing.
  - Acceptance: `corepack pnpm run typecheck` + `test` pass (update/remove the agent-control
    tests that referenced the deleted service).

- [ ] **T007-scoped [FR-002] Audit the FIBER_PHASE duplication only** — do NOT remove the live
      `FIBER_PHASE` in `acryl-control/src/lifecycle/controller.ts`; instead confirm the
      lifecycle controller consumes `ctx.loader` (`@deepseek-ai/cordis-plugin-loader`)
      rather than private Cordis state.
  - Why (verified): the `lifecycle/controller.ts` `FIBER_PHASE` is used by a **live** controller
    (unlike the dead `architecture/projection.ts` copy). The earlier "remove it" task was an
    over-reach.
  - Depends on: T002 (so only the dead copy is gone).
  - RED/GREEN proof: `grep -rn "fiber.getEffects\|ctx.root.registry.values\|fiber.inject" acryl-control/src/lifecycle` → nothing.
  - Acceptance: enable/disable/reload still works through `ctx.loader`; `verify` passes.

---

## Split-out — NOT safe deletions (load-bearing product code)

These were originally in the plan as removals but are load-bearing or deliberate design; they
must be treated as refactors evaluated separately, never as deletions.

- **T001 (split) — `desktop-terminal.ts`.** Load-bearing: imported by
  `acryl-desktop/src/electron-runtime.ts`, wired as a route in `src/index.ts` (line 290),
  used by `src/desktop-settings-controller.ts`, and platform-specific (macOS/Windows native
  terminal launch from the tray). It is Electron/OS integration, not a duplicate of
  `dsh-terminal` (the `terminal.ts` `'desktop-terminal'` DSH plugin is a different, in-app
  surface). **Do not delete.** If anything, only the *overlapping* mechanism should be
  reviewed, not this file.

- **T003 (split) — `acryl-desktop/webserver`.** Deliberate, documented design
  (`docs/DEVELOPMENT-LOG.md`: Desktop shares the upstream Web profile bundle but **replaces**
  the ordinary Web-server Loader row with `acryl-desktop/webserver`; `profile.ts` lines
  80-81, 767-825 consume it). **Do not delete.**

- **T005 (split) — `session-bridge.ts`.** Load-bearing and tested
  (`tests/session-bridge.spec.ts`); the TUI builds its session on `createAcrylSessionBridge`
  (`acryl-tui/src/tui-app/session.ts:150`). It does hand-roll `transcript()`/`tools()`
  projections, so **re-pointing it to `@deepseek-ai/dsh-session-projection`** is a legitimate
  refactor, but it is a risk-bearing change, not a removal. Re-scope as its own
  `specs/<NNN>-session-projection-refactor` if pursued.

---

## New capability (unchanged from plan)

- [ ] **T008 [FR-006] Implement ONE real model-facing Tool as a Cordis plugin** —
      `inject: ['tools']`; `ctx.tools.register(defineTool(...))`; canonical typed output split
      into `output.schema`/`output.render`; honour `exec.signal`; traverse the tool
      policy/event pipeline; dispose on Fiber/provider unload.
  - Depends on: none (independent of the removals).
  - RED/GREEN proof: a test calls the tool through `ctx.tools` (not a bypass) and observes a
    typed `tool/call`/`tool/result` pair in the session log; `exec.signal` aborts cleanly.
  - Acceptance: `typecheck` + `test` pass; tool appears as a typed call in the event log.

- [ ] **T009 [FR-006] Add Loader activation + disposal + reload test** — mount the Tool, reload
      the profile/Fiber, assert no duplicate registration and full effect release.
  - Depends on: T008.
  - RED/GREEN proof: Loader smoke test asserts exactly one registration after reload and a
    clean disposer run.
  - Acceptance: `corepack pnpm run test` passes.

## Suggested first commit

T002 + T004 + T006 together (all verified safe, no external consumers, no load-bearing
dependencies) as "remove unused/dead parallel-framework exports in control + desktop". Then
verify (`typecheck` + `test`), commit, and log in `docs/DEVELOPMENT-LOG.md`.
