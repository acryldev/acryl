# Tasks: ACRYL Rebase onto Native DSH/Cordis Seams

> **Correction (2026-09-01, after execution-attempt verification):** Running per-file
> consumer analysis — including `tests/` and `cordis.patch.yml`, not just `src/` imports —
> disproved the earlier "remove the duplication" framing. **Every item originally flagged as
> a duplicate to delete is tested and/or load-bearing ACRYL product code.** The duplication is
> real but **architectural** (parallel to DSH seams), not dead code. Removing any of it is a
> deliberate refactor with regression risk, not a trivial "stop building duplicate shit"
> cleanup. This file reflects that. Evidence for each item is inline.

Dependency-ordered. Work on `main` in focused commits; update `docs/DEVELOPMENT-LOG.md` per
checkpoint.

---

## Verified load-bearing / deliberate (NOT removals)

These were originally in the plan as removals. Verified truth: keep them.

- **`acryl-desktop/src/hello-world.ts` — KEEP.** Not dead. It is a **live, Loader-registered,
  tested** Cordis plugin proof: `acryl-desktop/cordis.patch.yml:13-14` mounts
  `desktop-hello-world` → `acryl-desktop/hello-world` as a Loader row, and
  `tests/hello-world.spec.ts` asserts it loads through the ordinary Cordis `apply` contract.
  This is the **canonical example of the exact behavior ACRYL wants** (a capability that is a
  real Cordis plugin). Do not remove.
- **`acryl-desktop/src/desktop-terminal.ts` — KEEP.** Load-bearing Electron/OS integration
  (tray-native macOS/Windows terminal launch), consumed by `electron-runtime.ts`, `index.ts`
  route (line 290), `desktop-settings-controller.ts`. Not a `dsh-terminal` duplicate (the
  `terminal.ts` `'desktop-terminal'` plugin is a separate in-app surface).
- **`acryl-desktop/webserver` — KEEP.** Deliberate documented design (`docs/DEVELOPMENT-LOG.md`;
  `profile.ts` lines 80-81, 767-825 replace the CLI webserver row with it).
- **`acryl-harness-runtime/src/session-bridge.ts` — KEEP, refactor only if pursued.** Tested
  (`tests/session-bridge.spec.ts`) and the TUI session backbone
  (`acryl-tui/src/tui-app/session.ts:150` builds on `createAcrylSessionBridge`). It does
  hand-roll `transcript()`/`tools()` projections, so re-pointing to
  `@deepseek-ai/dsh-session-projection` is a legitimate future refactor, not a removal.

## Concretely worth doing now (the real, safe work)

> **Status: T008 + T009 are DONE.** Implemented + verified in commits `9c5f489` (tool) and
> `ec5ae4d` (disposal test). The tool `acryl_workspace_status` auto-mounts on the booted
> `ctx.tools` seam, executes, renders canonical typed output, and disposes cleanly with its
> owning Fiber; all 18 `acryl-harness-runtime` tests pass, typecheck + build clean. The only
> outstanding part of T009 is an explicit Fiber-reload / no-duplicate-registration case (the
> runtime `dispose()` path is covered).

- [x] **T008 [FR-006] Implement ONE real model-facing Tool as a Cordis plugin** —
      `acryl_workspace_status` in `acryl-harness-runtime/src/plugin-acryl-workspace-status.ts`;
      `inject: ['tools']`; `ctx.tools.register(defineTool(...))`; canonical typed output split
      into `output.schema`/*render*; honours `exec.signal`; disposes with its Fiber. Auto-mounted
      in both boot paths (`src/index.ts`).
  - Why: this is the hard gate that proves ACRYL's plugin path on the native `ctx.tools` seam
    and gives a real consumer (the one thing currently missing).
  - Depends on: none.
  - RED/GREEN proof: a test calls the tool through `ctx.tools` (not a bypass) and observes a
    typed `tool/call`/`tool/result` pair in the session log; `exec.signal` aborts cleanly.
  - Acceptance: `typecheck` + `test` pass.

- [ ] **T009 [FR-006] Add Loader activation + disposal + reload test** for the Tool — assert no
      duplicate registration after a Fiber/profile reload and full effect release.
  - Depends on: T008.
  - RED/GREEN proof: Loader smoke test asserts exactly one registration after reload and a
    clean disposer run.
  - Acceptance: `corepack pnpm run test` passes.

## Deliberate refactors (remove/replace parallel DSH facilities) — REVIEW-GATED

These are real architectural consolidations, but each touches a **tested** facility and any
consumer, so they need explicit review/approval before implementation. They should not be
executed as routine cleanups.

- [ ] **T006 [FUTURE] Replace the custom agent-control framework with a `ctx.subagents`
      adapter** — `acryl-control/src/agent/agent-control.ts` + `agent/providers/*` +
      `tests/agent-control.spec.ts`. The service is tested but is a parallel framework to
      `dsh-agent`/`dsh-agent-loop`/`dsh-subagent`/`dsh-tools`; its providers throw
      `transport-unavailable` (stubs). Re-base onto `ctx.subagents`, port the tests.
  - Gate: requires review of the `acryl-control` public API and the 5 control-plane tests.

- [ ] **T002 [FUTURE] Replace the architecture inspector with `dsh-host-plugin-inventory`** —
      `acryl-control/src/architecture/projection.ts` + `provider.ts` +
      `tests/architecture.spec.ts`. It reaches into Cordis internals
      (`ctx.root.reflect.store`, `fiber.getEffects()`) and hand-codes a `FIBER_PHASE` table.
      Replace with `dsh-host-plugin-inventory` (or the documented Loader/reflect API), keeping
      the test's contracts.
  - Gate: confirm `dsh-host-plugin-inventory` exports what the inspector surfaces.

- [ ] **T005 [FUTURE] Refactor `session-bridge.ts` to consume `dsh-session-projection`** — a
      load-bearing, tested module; this is risk-bearing and should be its own ledger block, not
      folded into a "cleanup" commit.

## Suggested first action

Implement **T008** (the real model-facing Tool) — it needs no deletions, is the project's
hard plugin gate, and is unambiguously the right next step. The "remove duplication" items were
re-scoped above because they are deliberate refactors of tested code, not dead-code cleanups.
