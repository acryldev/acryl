# 042 Findings: what must be rewritten, what survives, what is unknown

**Date**: 2026-10-01. **Method**: reading the code in this repository and the pinned `deepseek-harness/`, plus four small probes run on Node 24.19.0 and Bun 1.3.14 (`probes/runtime-compat.mjs`, reproducible with `node` and `bun`).
**Supersedes**: `research.md`, `migration-effort-analysis.md`, `cordis-technical-feasibility.md`, `cordis-hot-reload-deep-dive.md`, and the week and probability figures in `plan.md` and `spec.md`. Those figures were estimates made without running anything, and one claim in them was wrong (see "Correction").

Electrobun itself is not installed and no Electrobun code was run. Everything below about Bun is measured; everything about Electrobun is not.

## Correction

Earlier text in this milestone said Cordis "does not use Node internals". That is false. `deepseek-harness/vendor/loader/src/internal.ts` reaches Node's private ESM loader (`internal/modules/esm/loader`, `getOrInitializeCascadedLoader()`, its `loadCache` and `ModuleJob`) through `--expose-internals` or the native addon `node-addon-require-builtin`. `vendor/hmr/src/index.ts` throws `--expose-internals is required for HMR service` when that loader is absent. `runtime/acryl-harness-runtime/src/engine-dsh.ts` and `src/index.ts` check for the flag themselves.

## Two architectures

The amount of rewrite depends almost entirely on this choice.

- **Option A, Electrobun as shell only.** The Host stays on Node, as the `acryl-web` process, started by the Electrobun main process. The webview loads `http://127.0.0.1:<port>`, which is already how Desktop works (`apps/acryl-desktop/src/index.ts:210`). Nothing in the Host, Cordis, hot reload, `node-pty`, SQLite or the harness native addons changes. Cost: a Node runtime ships next to Bun.
- **Option B, Host inside Bun.** Smallest runtime footprint, but every item marked "Option B" below becomes real work, and several of them sit in the pinned `deepseek-harness/` submodule, which this repository must not edit. They would need a provider replacement in an ACRYL-owned plugin, or an upstream change.

## Must be rewritten (both options)

| Area | Evidence |
|---|---|
| The Electron shell: 12 non-test modules import `electron` (`main.ts`, `startup-recovery-window.ts`, `electron-runtime.ts`, `profile-create-window.ts`, `preload.ts`, `shell/native-menu.ts`, `shell/tray-icons.ts`, `shell/window-options.ts`, `shell/electron-reveal.ts`, `shell/electron-platform.ts`, `shell/electron-shell-generation.ts`, `workspaces/workspace-admission.ts`) | `grep` over `apps/acryl-desktop/src`; 89 source files in total |
| Packaging, signing, notarization, update flow | `electron-builder` config with `electronFuses`, `asarUnpack`, `afterPack: verify-packaged-runtime.ts`, mac universal tests, NSIS, Linux targets; 4 files in `src/updates/` |

## Must be rewritten (Option B only)

| Area | Evidence |
|---|---|
| Terminal: `node-pty` | Probe P1: under Bun `spawn` returns a pid but no `data` or `exit` event ever arrives (Node: both arrive). Bun has its own `Bun.spawn({ terminal })`, which delivered output and an exit code in a separate check. ACRYL sites: `plugins/acryl-workspace/src/pty/node-pty-spawn.ts` (one adapter). Harness site: `deepseek-harness/packages/subprocess/subprocess-local/src/terminal.ts` (pinned submodule) |
| Session query storage | Probe P2: `node:sqlite` does not exist in Bun. `deepseek-harness/packages/session-query/session-query-sqlite/src/schema.ts` imports it. `bun:sqlite` has a different API |
| Plugin code reload (HMR) | `vendor/hmr` needs Node's private loader and throws without it. Needs a Bun-specific replacement. Probe P3 shows what Bun does support (next section) |

## Survives unchanged

| Area | Evidence |
|---|---|
| React web client | Served over local HTTP, not bundled into the shell |
| Cordis fiber lifecycle | Probe P4: 500 plugin apply and dispose cycles on Bun: applied 500, disposed 500, no leak observed in the measurement |
| Config-driven plugin enable and disable | `vendor/loader/src/config/tree.ts:154-160` falls back to plain `import()` when no internal loader exists |
| Everything under Option A that runs in the Host | The Host process does not change |

## Hot reload: what Bun does differently (probe P3)

Re-importing a module to get freshly evaluated code, 50 attempts each:

| Mechanism | Node 24.19.0 | Bun 1.3.14 |
|---|---|---|
| `import('file:///path?v=i')` | 50/50 | **1/50** (query ignored) |
| `import('/path?v=i')` (bare path) | 50/50 | 50/50 |
| `delete require.cache[path]` then import | 1/50 | inconsistent: 50/50 in one run, 1/50 in another. Do not rely on it |

So Bun can re-evaluate a module, but through a different specifier form than Node, and the Cordis loader's own cache handling cannot be reused as is. Whether a Bun replacement for `vendor/hmr` is practical is untested.

## Unknown, not yet tested

- Electrobun: window loading a localhost page, webview engine behavior, tray, native menu, dialogs, bundled-Bun version, packaging and updater story.
- The real `acryl-web` boot under Bun (Option B), not only isolated primitives.
- `@deepseek-ai/node-addon-system` and `landlock-run` (harness native pieces) under Bun.
- `deepseek-harness/packages/workflow/workflow-worker-thread` (uses `node:vm` and `worker_threads`) under Bun.
- `ws` WebSocket upgrade routes (`plugins/acryl-agent-control/src/host/stream.ts`, `plugins/acryl-workspace/src/pty/stream.ts`) under Bun.
- The ACRYL frontend in WebKit, notably `@xterm/addon-webgl` in the workspace client. Safari uses the same engine as a macOS webview, so this can be checked without installing anything.

## Experiment ladder (small steps, each with a pass condition)

| Step | What | Pass condition | Needs install? |
|---|---|---|---|
| E0 (done) | `probes/runtime-compat.mjs` on Node and Bun | Results above | No |
| E1 | Open the real client in Safari against a running `acryl-web` | Terminal (xterm webgl), editors, layout render and work | No |
| E2 | Bun script starts the built `acryl-web` as a Node subprocess with a temporary home and a spare port, waits for the port, stops it | Host runs unchanged under a Bun parent; clean shutdown | No |
| E3 | Electrobun hello-world window loading the E2 URL | Window renders the client; menu, tray and dialog APIs exist | Yes (Electrobun) |
| E4 | `node-addon-system` import and `acryl-web` boot directly under Bun, isolated home | Boots, or fails with a specific error | No |
| E5 | `workflow-worker-thread` and `ws` routes under Bun | Basic run works | No |

E1 to E3 decide Option A. E4 and E5 decide whether Option B is worth considering at all. Stop at the first failing step and record it here.
