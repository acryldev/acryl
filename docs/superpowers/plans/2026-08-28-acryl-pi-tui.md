> **SUPERSEDED 2026-08-29.** This plan was transferred into the active Spec Kit ledger `specs/019-acryl-harness-runtime/` (see its `plan.md` revision and `tasks.md`). The repository does not maintain a parallel planning system; keep changes in the ledger.

# ACRYL pi-tui Terminal Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ink readiness probe with a direct pi-tui session interface over ACRYL's normal local DSH runtime.

**Architecture:** `startDirectHost()` owns only normal Harness profile lifetime. A session bridge opens/resumes a native durable DSH session, and a pi-tui controller projects bridge snapshots into a Tomo-derived transcript, prompt, tool, status, error, and cancellation surface. Renderer disposal precedes direct-host disposal.

**Tech Stack:** TypeScript, `@earendil-works/pi-tui` 0.84.2, DeepSeek Harness, Cordis, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-acryl-pi-tui-design.md`

## Global Constraints

- Pin `@earendil-works/pi-tui` to `0.84.2`; do not vendor it.
- Port compatible concrete Tomo app-loop, store/controller, transcript, scrolling, prompt editor, and key handling code.
- Use ACRYL `startDirectHost()` and `createAcrylSessionBridge()` instead of Tomo's runtime construction.
- Do not introduce control ownership, sockets, leases, attachments, polling, daemoning, or recovery.
- Do not edit `deepseek-harness/`.
- Preserve `acryl tui --json` as a headless direct-host probe.

---

### Task 1: Establish the runtime projection seam

**Files:**
- Modify: `acryl-harness-runtime/src/session-bridge.ts`
- Modify: `acryl-harness-runtime/tests/session-bridge.spec.ts`
- Create: `acryl-tui/src/tui/store.ts`
- Create: `acryl-tui/tests/tui-store.spec.ts`

**Interfaces:**
- Consumes: `AcrylSessionBridge.open`, `snapshot`, `subscribe`, `submitPrompt`, `cancel`, and `dispose`.
- Produces: `AcrylTuiStore`, with `snapshot`, `subscribe`, `replace(snapshot)`, and `setError(error)`.

- [ ] **Step 1: Write focused failing bridge and store tests**

```ts
await bridge.submitPrompt({ sessionId, text: 'inspect the repository' })
expect(agent.followup).toHaveBeenCalledOnce()

store.replace({ transcript, tools, agentStatus: 'running', ...snapshot })
expect(store.snapshot().transcript).toEqual(transcript)
expect(store.snapshot().tools[0]?.status).toBe('running')
```

- [ ] **Step 2: Run the focused tests to confirm the projection seam is incomplete**

Run: `corepack pnpm --filter acryl-harness-runtime test -- session-bridge` and `corepack pnpm --filter acryl-tui test -- tui-store`
Expected: failure because the store/controller exports do not yet exist or do not project bridge updates.

- [ ] **Step 3: Implement the immutable store and bridge error propagation**

```ts
export interface AcrylTuiState {
  readonly transcript: readonly AcrylTranscriptItem[]
  readonly tools: readonly AcrylToolProjection[]
  readonly status: 'running' | 'idle'
  readonly error?: string
}
```

Subscribe the controller to `bridge.subscribe`, copy snapshots into this presentation-only state, and send `onError` failures to `setError`.

- [ ] **Step 4: Run focused tests**

Run: `corepack pnpm --filter acryl-harness-runtime test -- session-bridge` and `corepack pnpm --filter acryl-tui test -- tui-store`
Expected: PASS.

- [ ] **Step 5: Commit the projection seam**

```bash
git add acryl-harness-runtime/src/session-bridge.ts acryl-harness-runtime/tests/session-bridge.spec.ts acryl-tui/src/tui/store.ts acryl-tui/tests/tui-store.spec.ts
git commit -m "feat: project durable sessions into tui state"
```

### Task 2: Port the focused Tomo pi-tui application shell

**Files:**
- Modify: `acryl-tui/package.json`
- Modify: root lockfile
- Create: `acryl-tui/src/tui/TuiApp.ts`
- Create: `acryl-tui/src/tui/CustomEditor.ts`
- Create: `acryl-tui/src/tui/text.ts`
- Create: `acryl-tui/src/tui/theme.ts`
- Create: `acryl-tui/tests/tui-app.spec.ts`
- Delete: `acryl-tui/src/render/app.tsx`
- Delete: `acryl-tui/src/render/ink-app.tsx`
- Delete: `acryl-tui/src/render/contributions.ts`
- Delete: `acryl-tui/src/render/status.ts`
- Delete: Ink-only tests under `acryl-tui/tests/`

**Interfaces:**
- Consumes: `AcrylTuiStore` and actions `{ submit(text): Promise<void>; cancel(): Promise<void>; exit(): void }`.
- Produces: `mountAcrylTui(options): AcrylTuiHandle`, where `waitUntilExit(): Promise<void>` and `dispose(): void` restore the terminal.

- [ ] **Step 1: Add pi-tui and remove Ink dependencies**

Use `corepack pnpm add --filter acryl-tui @earendil-works/pi-tui@0.84.2` and `corepack pnpm remove --filter acryl-tui ink react`; remove `ink-testing-library`, React type dependencies, and stale build configuration only when no source references remain.

- [ ] **Step 2: Port the compatible concrete Tomo components**

Port and reduce Tomo's `TuiApp`, `CustomEditor`, `text`, and `theme` modules. Use `TuiAltScreen`, `ProcessTerminal`, `ScrollView`, `VStack`, and a focused editor. Retain transcript append-only rendering, follow-end scrolling, status spinner, Enter submission, and Tomo-style key dispatch. Exclude all overlays, file mention, shell, model/preset/plugin controls, and direct runtime startup.

- [ ] **Step 3: Add pi-tui component tests**

```ts
const app = mountAcrylTui({ store, actions })
app.handleInput('hello\r')
await expect(actions.submit).toHaveBeenCalledWith('hello')
app.handleInput('\u0003')
expect(actions.cancel).toHaveBeenCalledOnce()
```

Assert transcript/tool/status/error rows render from the store and that `dispose()` calls the terminal stop path exactly once.

- [ ] **Step 4: Run TUI package tests and typecheck**

Run: `corepack pnpm --filter acryl-tui test` and `corepack pnpm --filter acryl-tui typecheck`
Expected: PASS with no Ink/React imports or dependencies.

- [ ] **Step 5: Commit the renderer port**

```bash
git add acryl-tui/package.json pnpm-lock.yaml acryl-tui/src acryl-tui/tests
git commit -m "feat: port tomo pi tui shell"
```

### Task 3: Wire CLI, session lifecycle, and cleanup

**Files:**
- Modify: `acryl-tui/src/cli/grammar.ts`
- Modify: `acryl-tui/src/cli/run.ts`
- Modify: `acryl-tui/src/host/direct.ts`
- Modify: `acryl-tui/src/index.ts`
- Modify: `acryl-tui/tests/cli-run.spec.ts`
- Modify: `acryl-tui/tests/direct.spec.ts`
- Create: `acryl-tui/tests/tui-controller.spec.ts`

**Interfaces:**
- Consumes: `startDirectHost`, `createAcrylSessionBridge`, `mountAcrylTui`.
- Produces: direct interactive invocation that opens/resumes a session, disposes subscription/bridge/renderer/host in order, and leaves `--json` unchanged.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
await runAcryl(['tui', '--profile', 'acryl'], dependencies)
expect(bridge.open).toHaveBeenCalledWith(undefined)
expect(renderer.dispose).toHaveBeenCalledBefore(host.dispose)

await runAcryl(['tui', '--profile', 'acryl', '--resume', 'session-1'], dependencies)
expect(bridge.open).toHaveBeenCalledWith('session-1')
```

Test that Ctrl+C while running calls `bridge.cancel(sessionId)`, that renderer exit disposes bridge then host, and that `--json` mounts neither bridge nor renderer.

- [ ] **Step 2: Extend grammar only with the explicit resume option**

Add `--resume <session-id>` to the `tui` invocation shape. Reject an empty resume value. Do not add attachment/recovery forms.

- [ ] **Step 3: Implement one local controller lifecycle**

After direct host boot, construct one native session bridge using the root context, open/resume, subscribe, mount pi-tui, and call bridge submit/cancel actions. In `finally`, dispose subscription, renderer, bridge, then host. Preserve the existing `--json` early return.

- [ ] **Step 4: Run focused and package tests**

Run: `corepack pnpm --filter acryl-tui test` and `corepack pnpm --filter acryl-tui typecheck`
Expected: PASS.

- [ ] **Step 5: Commit CLI lifecycle wiring**

```bash
git add acryl-tui/src acryl-tui/tests
git commit -m "feat: run durable sessions in acryl tui"
```

### Task 4: Record provenance and validate the slice

**Files:**
- Create: `docs/acryl/tomo-pi-tui-provenance.md`
- Modify: `docs/DEVELOPMENT-LOG.md`

- [ ] **Step 1: Write the provenance document**

Record the Tomo repository, exact `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1` commit, MIT license, `@tomowang/dsh-tui` 0.7.0, pi-tui 0.84.2, adapted modules/behaviors, and excluded future-parity features.

- [ ] **Step 2: Run mandatory validation sequentially**

```bash
corepack pnpm --filter acryl-control test
corepack pnpm --filter acryl-harness-runtime test
corepack pnpm --filter acryl-tui test
corepack pnpm --filter acryl-tui typecheck
git diff --check
```

- [ ] **Step 3: Commit provenance**

```bash
git add docs/acryl/tomo-pi-tui-provenance.md
git commit -m "docs: record tomo tui provenance"
```

- [ ] **Step 4: Add the separate development-log checkpoint**

Use the full hash of the final implementation commit, explain the user-visible terminal slice and verification, then commit only the log.

```bash
git add docs/DEVELOPMENT-LOG.md
git commit -m "docs: record pi tui terminal milestone"
```

## Plan self-review

- Coverage: Tasks 1-3 cover native session creation/resume, prompt, streaming projections, tools, status, errors, cancellation, disposal, stale control artifacts, headless JSON, and Ink removal. Task 4 covers provenance and verification.
- Placeholder scan: no deferred implementation steps or unspecified APIs remain.
- Type consistency: `AcrylTuiStore`, `mountAcrylTui`, and `AcrylTuiHandle` form the explicit controller boundary used by the CLI lifecycle.
