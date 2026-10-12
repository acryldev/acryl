> **2026-10-07.** Deno findings and the current ladder: [deno-findings-and-plan.md](./deno-findings-and-plan.md).

# 042 Findings: what must be rewritten, what survives, what is unknown

**Date**: 2026-10-01. **Method**: reading the code in this repository and the pinned `deepseek-harness/`, reading the official Electrobun 2.x documentation, and running small probes on Node 24.19.0 and Bun 1.3.14 (scripts in `probes/`, reproducible with `node` and `bun`).
**Supersedes**: `research.md`, `migration-effort-analysis.md`, `cordis-technical-feasibility.md`, `cordis-hot-reload-deep-dive.md`, and the week and probability figures in `plan.md` and `spec.md`. Those figures were estimates made without running anything, and some claims in them were wrong (see "Corrections").

Electrobun's own window and packaging were not run (E3 is only partly done, see the experiment table). Everything below about Bun is measured with Bun 1.3.14. The Bun that Electrobun would bundle is pinned by its devkit and may be a different version.

## Corrections to earlier 042 text

1. **Cordis does use Node internals.** `deepseek-harness/vendor/loader/src/internal.ts` reaches Node's private ESM loader (`internal/modules/esm/loader`, `getOrInitializeCascadedLoader()`, its `loadCache` and `ModuleJob`) through `--expose-internals` or the native addon `node-addon-require-builtin`. `vendor/hmr/src/index.ts` throws `--expose-internals is required for HMR service` when that loader is absent. `runtime/acryl-harness-runtime/src/engine-dsh.ts` and `src/index.ts` check for the flag themselves.
2. **Electrobun is no longer "Bun plus WebKit".** Electrobun 2.x (npm `electrobun` 2.0.2, released 2026-09-30) is built and run through a launcher called Hutch. The main-process JavaScript runtime defaults to **Cottontail** (a runtime built on Zig and JavaScriptCore that provides Node.js and Bun-compatible APIs), not Bun. Bun is an optional main-process runtime ("actual Bun runtime, built and packaged by Hutch"). Source: https://framework.blackboard.sh/electrobun/guides/cottontail/ and `/guides/compatability/`.
3. **System webview is the default, not the only choice.** macOS WKWebView, Windows WebView2, Linux WebKitGTK 4.1, or a bundled Chromium (CEF) with `bundleCEF: true`. Bundling CEF removes the WebKit rendering risk but also removes most of the size advantage.

## Electrobun 2.x constraints that affect ACRYL (from the official docs)

| Constraint | Effect on ACRYL |
|---|---|
| Supported targets: macOS **arm64 only**, Windows x64, Linux x64 and arm64. No macOS x64 build is listed | ACRYL ships a mac universal build today (`apps/acryl-desktop/scripts/mac-universal.ts`, x64 and arm64). Intel Macs would not be supported |
| No cross-compilation: "native main-process compilers do not currently cross-compile Electrobun apps". Releases need native CI runners | Release pipeline change |
| Windows ARM runs the x64 build through emulation | No native Windows ARM |
| Linux needs GTK 3, WebKitGTK 4.1, Ayatana AppIndicator and librsvg installed, even when CEF is bundled | New install requirement on Linux |
| "Native addons and code that depends on undocumented runtime internals can still be platform- or runtime-specific" | Directly describes `node-pty`, the harness native addon and the Cordis loader internals |

## How Web and Desktop share one runtime today

The shared seam is `createAcrylEngineHost({ engines, initialEngine, prepare })` in `runtime/acryl-harness-runtime/src/engine-host.ts`. It owns the one Cordis root and mounts the Harness profile (Loader rows, web server, client bundle) as an engine. Each surface only decides how the process starts and what it shows:

- **Web** (`apps/acryl-web/src/serve.ts`): a plain `node` process calls `createAcrylEngineHost` with `createWebEngineDefinition(...)` and prints the tokenized URL.
- **Desktop** (`apps/acryl-desktop/src/main.ts:835`): the **Electron main process** calls the same `createAcrylEngineHost` with `createDshEngineDefinitionFromComposition({ ..., surface: 'desktop' })`, adds Desktop-only services in `prepare` (native menu, tray, terminal, updater), and a `BrowserWindow` loads the host's own URL.

So the sharing works because Electron's main process is a full Node process in which that code runs unchanged, including `--expose-internals` (Electron's `runAsNode` fuse), N-API addons (`node-pty`, `node-addon-require-builtin`) and Node's module resolution. An Electrobun main process is a different runtime (Cottontail by default, or Bun), so the same in-process pattern is Option B and inherits every gap measured above. Option A keeps the same pattern by running the shared host in a Node child process instead.

## Two architectures

The amount of rewrite depends almost entirely on this choice.

- **Option A, Electrobun as shell only.** The Host stays on Node, as the `acryl-web` process, started by the Electrobun main process. The webview loads `http://127.0.0.1:<port>`, which is already how Desktop works (`apps/acryl-desktop/src/index.ts:210`). Nothing in the Host, Cordis, hot reload, `node-pty`, SQLite or the harness native addons changes. Cost: a Node runtime ships next to the Electrobun runtime.
- **Option B, Host inside the Electrobun runtime.** Either the optional Bun runtime (measured below) or the default Cottontail (not measured at all). Every item marked "Option B" below becomes real work, and several of them sit in the pinned `deepseek-harness/` submodule, which this repository must not edit. They would need a provider replacement in an ACRYL-owned plugin, or an upstream change.

## Experiment results

| Step | What | Result |
|---|---|---|
| E0 | `probes/runtime-compat.mjs`: node-pty events, `node:sqlite`, module re-import, Cordis churn | See the tables below |
| E1 | Real client in Safari (same engine as macOS WKWebView) | **Not done by me.** Screenshot capture is blocked (no Screen Recording permission in this shell). Manual check below |
| E2 | `probes/e2-bun-parent-node-host.ts`: a Bun parent starts the unchanged Node host with a temporary home and spare port | **PASS.** Host up in 6 to 9 seconds. `GET /` is 401 without a token, 303 with the token plus a cookie, then 200 with the cookie (29,500 bytes, 7 script tags). Clean shutdown, port freed. A webview keeps cookies, so the handshake works for Option A |
| E3 | Electrobun hello-world window | **Partly done.** `npm electrobun` bootstrap installs Hutch 0.27.1 and Cottontail 0.7.1 (about 131 MB in `~/.hutch`). `electrobun init` is interactive and was not completed, so no window was opened. Side effects: it appended two lines to `~/.zshrc` (`# Hutch` and a `PATH` export) |
| E4 | `probes/e4-*`: boot the real `acryl-web` host directly under Bun (Option B) | **FAIL**, in several places in one attempt, see below |
| E5 | `probes/e5-ws-worker.mjs`: `ws` upgrade and `worker_threads` plus `node:vm` | `ws` upgrade over `node:http` **FAILS** on Bun (times out; Node works). `worker_threads` plus `vm.runInContext` works on both |

### E4: what stops the real host booting under Bun 1.3.14

Found in one attempt, in the order hit. None of these were hot reload yet.

1. `node:module` has no `findPackageJSON` (used in ACRYL's own `runtime/acryl-harness-runtime/src/package-overlay.ts` and `engine-dsh.ts`). Hard failure at import. Small fix, in ACRYL code.
2. `node:module` has no `registerHooks` (same file). Stubbed in the probe; real behavior untested.
3. `node:util` has no `getSystemErrorMessage`, imported by `@deepseek-ai/dsh-subprocess-local` (pinned harness).
4. `node:module` has no `stripTypeScriptTypes`, imported by `@deepseek-ai/dsh-code-runtime-worker-thread` (pinned harness).
5. Bare-specifier resolution differs: `dsh-client-ui-brand-acryl` resolved from the profile's loader entry fails with ENOENT in Bun's resolver (pnpm layout plus profile-materialized packages).
6. Logged warnings: `local-spill-store` rejects its temp directory as unsafe (ownership and permission checks behave differently).

Because of 1 and 2 the probe used a scratch shim, which the repository does not contain. Items 3 and 4 are inside `deepseek-harness/`, so they are upstream or provider-replacement work.

## Must be rewritten (both options)

| Area | Evidence |
|---|---|
| The Electron shell: 12 non-test modules import `electron` (`main.ts`, `startup-recovery-window.ts`, `electron-runtime.ts`, `profile-create-window.ts`, `preload.ts`, `shell/native-menu.ts`, `shell/tray-icons.ts`, `shell/window-options.ts`, `shell/electron-reveal.ts`, `shell/electron-platform.ts`, `shell/electron-shell-generation.ts`, `workspaces/workspace-admission.ts`) | `grep` over `apps/acryl-desktop/src`; 89 source files in total |
| Packaging, signing, notarization, update flow | `electron-builder` config with `electronFuses`, `asarUnpack`, `afterPack: verify-packaged-runtime.ts`, mac universal tests, NSIS, Linux targets; 4 files in `src/updates/`. Electrobun replaces this with Hutch and its own updater and signing docs |

## Must be rewritten (Option B only, measured on Bun 1.3.14)

| Area | Evidence |
|---|---|
| Terminal: `node-pty` | P1: under Bun `spawn` returns a pid but no `data` or `exit` event ever arrives (Node: both arrive). Bun's own `Bun.spawn({ terminal })` delivered output and an exit code in a separate check. ACRYL site: `plugins/acryl-workspace/src/pty/node-pty-spawn.ts` (one adapter). Harness site: `deepseek-harness/packages/subprocess/subprocess-local/src/terminal.ts` (pinned submodule) |
| Session query storage | P2: `node:sqlite` does not exist in Bun. `deepseek-harness/packages/session-query/session-query-sqlite/src/schema.ts` imports it. `bun:sqlite` has a different API (Cottontail lists `bun:sqlite` support in its capability modules, untested here) |
| Plugin code reload (HMR) | `vendor/hmr` needs Node's private loader and throws without it. Needs a Bun-specific replacement. P3 shows what Bun supports (next section) |
| WebSocket upgrade routes | E5a: `ws` `handleUpgrade` over `node:http` times out on Bun. Used by `plugins/acryl-workspace/src/pty/stream.ts` and `plugins/acryl-agent-control/src/host/stream.ts` |
| Node API gaps in the host boot | E4 items 1 to 5 above |

## Survives unchanged

| Area | Evidence |
|---|---|
| React web client | Served over local HTTP, not bundled into the shell. E2 shows the host serves it under a Bun parent |
| Cordis fiber lifecycle | P4: 500 plugin apply and dispose cycles on Bun: applied 500, disposed 500 |
| Config-driven plugin enable and disable | `vendor/loader/src/config/tree.ts:154-160` falls back to plain `import()` when no internal loader exists |
| `worker_threads` with `node:vm` | E5b works on both runtimes (basic case only) |
| Everything under Option A that runs in the Host | The Host process does not change |

## Hot reload: what Bun does differently (P3)

Re-importing a module to get freshly evaluated code, 50 attempts each:

| Mechanism | Node 24.19.0 | Bun 1.3.14 |
|---|---|---|
| `import('file:///path?v=i')` | 50/50 | **1/50** (query ignored) |
| `import('/path?v=i')` (bare path) | 50/50 | 50/50 |
| `delete require.cache[path]` then import | 1/50 | inconsistent: 50/50 in one run, 1/50 in another. Do not rely on it |

So Bun can re-evaluate a module, but through a different specifier form than Node, and the Cordis loader's own cache handling cannot be reused as is. Whether a replacement for `vendor/hmr` is practical is untested.

## Still unknown

- **Cottontail**, the default runtime, has not been tested against any of the above. Its compatibility could be better or worse than Bun's.
- The Bun version Electrobun's devkit bundles, and whether it matches 1.3.14.
- Electrobun menu, tray, dialog and window behavior against the 12 shell modules. The API docs list `BrowserWindow`, `Tray`, `Application Menu`, `Context Menu`, `Utils` and `Updater`.
- `@deepseek-ai/node-addon-system` and `landlock-run` (harness native pieces) under any Electrobun runtime.
- The ACRYL frontend in WebKit, notably `@xterm/addon-webgl` in the workspace client (E1).
- Whether Electrobun's own hot reload and update flow can replace what ACRYL's updater does.

## Next steps

1. **E1, manual (about 2 minutes):** `bun specs/042-acrylruntime-optimization-experimental/probes/e2-bun-parent-node-host.ts` proves the host serves, but to look at it in Safari start the host yourself with a temporary home (`ACRYL_HOME=$(mktemp -d) ACRYL_WEB_PORT=38457 node --expose-internals apps/acryl-web/lib/bin.js`), open the printed URL in Safari and check the terminal (xterm), editor and layout. Stop the host with Ctrl+C.
2. **E3:** complete a hello-world window that loads the E2 URL, after deciding whether to keep Hutch installed.
3. **If Option B stays on the table:** test Cottontail with the same probes (`runtime-compat.mjs`, `e5-ws-worker.mjs`), since it is the default runtime and was not measured.
4. Stop at the first failing step and record it here.
