# 042 Deno: measured findings and the experiment ladder

**Date**: 2026-10-07. **Status**: experimental. A research-to-decision ladder, not a migration commitment.
**Method**: measurements on this machine (macOS arm64) with Deno 2.9.7 (V8 15.0.245.2, TypeScript 6.0.3) and Deno
2.7.14, the installed `/Applications/ACRYL.app`, and the existing 042 probes run under Deno. Every number below was
measured; every claim not measured is marked **unverified**.
**Builds on**: [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md) (the Bun and Electrobun measurements of
2026-10-01). Those findings stay valid for Bun; this page adds Deno.
**Owner's research**: [research/denojs_for_acryl_overview.md](./research/denojs_for_acryl_overview.md) (why Deno:
`deno desktop` with the OS webview, Node and npm compatibility, permissions, built-in toolchain, celld).

## Why Deno, and the goal

The goal is a smaller, simpler ACRYL: drop the bundled Chromium (Electron) and ship a 100 to 200 MB application. Deno
is the candidate because `deno desktop` is part of the Deno runtime (since 2.9), uses the operating system's webview by
default (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), and the same runtime brings TypeScript without a
build, `fmt`/`lint`/`check`/`test`, a permission model, and `deno compile`.

## Findings

### F1. Size (measured)

| What | Size |
|---|---|
| Installed `ACRYL.app` today | **500 MB** |
| of which Electron (`Electron Framework.framework`, Chromium) | 228 MB |
| of which `Resources/app.asar.unpacked/node_modules` (ACRYL and Harness dependencies) | 263 MB |
| of which `app.asar` plus ACRYL `lib/` and the rest | about 9 MB |
| Minimal `deno desktop` app (`Deno.serve` hello page), Deno 2.9.7 | **65 MB** (`libruntime.dylib` 64.5 MB, `laufey_webview` 0.4 MB) |

Projected (arithmetic, not built):

| Shape | Projected size |
|---|---|
| Option A: Deno desktop window, host stays on Node (a bundled Node binary of about 110 MB) | about 440 MB |
| Option B: window and host both on Deno, dependencies unchanged | about 330 MB |
| Option B with dependencies cut to about 100 MB | about 165 MB (inside the 100 to 200 MB goal) |

So the size goal needs **Option B** (the host on Deno) **and** a dependency cut. Option A alone saves about 60 MB.

The 263 MB of dependencies is a long tail; the largest entries:

| Package | Size |
|---|---|
| `@deepseek-ai/*` | 26.6 MB |
| `@opentelemetry/*` | 19.4 MB |
| `@img/sharp-libvips-darwin-arm64` (sharp) | 17.0 MB |
| `openai` | 13.5 MB |
| `@shikijs/*` | 13.3 MB |
| `pnpm` (bundled) | 12.6 MB |
| `acryl-workspace` | 12.1 MB |
| `@google/genai` | 11.9 MB |
| `@anthropic-ai/sdk` | 10.9 MB |
| `web-streams-polyfill` | 8.6 MB |

`deno desktop --exclude-unused-npm` embeds only packages reachable from the static module graph. ACRYL loads most of its
plugins at run time through the Cordis Loader, so a static cut will not find them on its own: the profile's plugin set
has to be passed explicitly (`--include npm:<pkg>`) or bundled per profile.

### F2. `deno desktop` (measured)

- Built in to the Deno CLI: `deno desktop -o App.app main.ts`. Output formats include `.app`, `.dmg`, `.AppImage`,
  `.deb`, `.rpm`, `.msi`. Options include `--backend` (system webview, or CEF), `--engine` (V8, or the smaller
  experimental QuickJS), `--hmr`, `--icon`, `--target`, `--exclude-unused-npm`, `--include`.
- The hello-world bundle built and was ad-hoc code-signed in one command.
- Deno labels `deno desktop` **experimental** (also stated in the owner's research).
- **Unverified**: window behaviour, menus, tray, dialogs, auto-update, notarization, Windows and Linux builds, and the
  ACRYL client rendering in WebKit (042 E1 was never done either).

### F3. The ACRYL host on Deno (measured, 042 probe `e4-driver.mjs` and a serving variant)

Every run used a throwaway `HOME` and `ACRYL_HOME`, and a spare `ACRYL_WEB_PORT`. No file in `~/.acryl`, `~/.acryl-dev`,
`~/.dsh` or `~/Library/Application Support/ACRYL` changed (checked with `find -mmin -5`). The owner's running
`acryl-web` on port 3080 (Node) was not touched.

| Run | Result |
|---|---|
| `deno run -A probes/e4-driver.mjs` (boot, report, dispose) | Printed `BOOTED {"url":"http://127.0.0.1:3080"}`. **False positive**: 3080 is `serveWeb`'s fallback when neither `webServer` nor `webStartup` is provided (`apps/acryl-web/src/serve.ts`, `port = listening?.port ?? startup?.port ?? 3080`). The web server never started |
| Serving mode, plain `deno run -A` | Exits at once: `TypeError: Import "@deepseek-ai/dsh-tools" not a dependency`. Deno's npm resolver does not resolve the plugin packages that ACRYL materializes into profile folders with pnpm (the same class as 042 E4 item 5 on Bun) |
| Serving mode, `deno run -A --node-modules-dir=manual` | The process stays up and prints `ACRYL web: http://127.0.0.1:3080` (the fallback again). It listens on no port; the spare port refuses connections. The throwaway home holds a created `profiles/web` (`cordis.yml`, `cordis.patch.yml`, `package.json`, `pnpm-workspace.yaml`) but no installed plugin packages. No error was printed |

Conclusion: the host boots its Cordis root on Deno, but the profile's plugin packages are neither installed nor
resolved, so nothing that the profile provides (web server included) starts, and the failure is silent.

### F4. Known gaps carried over from the Bun work (not yet retested on Deno)

| Gap | Where | Deno status |
|---|---|---|
| Cordis Loader and HMR use Node's private ESM loader (`--expose-internals` or `node-addon-require-builtin`) | `deepseek-harness/vendor/loader/src/internal.ts`, `vendor/hmr/src/index.ts`; ACRYL checks the flag in `runtime/acryl-harness-runtime/src/index.ts:222` | Deno has no `--expose-internals`. The loader falls back to plain `import()` when the internal loader is absent (`vendor/loader/src/config/tree.ts:154-160`), so config-driven enable and disable may work; **HMR will not**. Unverified |
| Terminal: `node-pty` (native addon) | `plugins/acryl-workspace/src/pty/node-pty-spawn.ts`; harness `packages/subprocess/subprocess-local/src/terminal.ts` | Deno supports Node-API addons in principle. Unverified for `node-pty` |
| Session query store: `node:sqlite` | harness `packages/session-query/session-query-sqlite` | Unverified on Deno |
| WebSocket upgrade with `ws` over `node:http` | `plugins/acryl-workspace/src/pty/stream.ts`, `plugins/acryl-agent-control/src/host/stream.ts` | Unverified on Deno |
| `node:module` `findPackageJSON`, `registerHooks`, `stripTypeScriptTypes`; `node:util` `getSystemErrorMessage` | ACRYL `package-overlay.ts`, `engine-dsh.ts`; harness `dsh-subprocess-local`, `dsh-code-runtime-worker-thread` | Unverified on Deno |
| Other native modules | `koffi` (8 packages declare it), `sharp` (6), `sherpa-onnx-node` (1), `@xterm/headless` (3) | Unverified on Deno |
| Shell rewrite | 12 modules import `electron` (listed in findings-rewrite-vs-reuse.md); packaging, signing, notarization and updates (`electron-builder`, `src/updates/`) | Must be rewritten for any non-Electron shell |

Several of these sit in the pinned `deepseek-harness/` submodule, which this repository must not edit. They need an
ACRYL-owned replacement plugin (provider replacement through profile composition) or an upstream change.

### F5. What already works on Deno (measured in the AIMBRACE repository, same machine)

- `npm:@deepseek-ai/cordis@4.0.4` (the Cordis ACRYL runs on): plugins, `provide`/`get`, `inject` pending and start,
  `effect` cleanup, events with listeners removed on dispose, child fibers, typed services by `Context` augmentation.
- A Cordis app on `Deno.serve`, tested with `Deno.test` under Deno's resource and op sanitizers, run with
  `--allow-net=127.0.0.1` and nothing else.
- Re-loading a plugin with a fresh `import()` is the planned replacement for HMR there (AIMBRACE spec 012, Phase 2).

## Options

- **Option A, Deno desktop as shell only.** The host stays on Node as a child process; the webview loads its local URL
  (Desktop already loads the host's own URL today). Lowest risk, but ships Node next to Deno: about 440 MB. Does not
  meet the size goal.
- **Option B, host on Deno.** Meets the size goal only with a dependency cut. Needs every gap in F3 and F4 closed.

The ladder below tests Option B step by step and keeps Option A as the fallback.

## The experiment ladder

Each step has an exit criterion. Stop at the first failing step, record the result in this file, and decide before
going further. All runs follow the probe safety rules at the end.

| Step | Question | How | Exit criterion |
|---|---|---|---|
| **D1** | Can Deno install and resolve a profile's plugin packages? | Find where the profile install runs (pinned pnpm) and why it does not run or does not report under Deno; then make the Loader's imports resolve from the profile folder (`--node-modules-dir=manual` with an installed profile, or an import map generated from the profile). Probe: `probes/d1-deno-host.mjs` | The serving host listens on the spare port and answers `GET /` like Node does (404 without a token; measured under Node at `0d075c8`, 042 E2 recorded 401 on 2026-10-01) |
| **D2** | Does the Cordis Loader work without Node internals? | With D1 passing, enable and disable a profile row at run time; reload one plugin with a fresh `import()` | Enable, disable and reload all take effect; no `--expose-internals`; HMR replacement designed (shared with AIMBRACE 012 Phase 2) |
| **D3** | Do the native and Node-API pieces work? | Run 042's `probes/runtime-compat.mjs` and `probes/e5-ws-worker.mjs` under Deno: `node-pty` events, `node:sqlite`, module re-import, `ws` upgrade, `worker_threads` with `node:vm`; then `koffi`, `sharp` | Each item passes, or has a named replacement (for example `Deno.Command` with a PTY, `jsr:@db/sqlite`, `Deno.upgradeWebSocket`) |
| **D4** | Does the ACRYL client work in WebKit? | Open the D1 host URL in Safari (same engine as WKWebView); check terminal (xterm, `@xterm/addon-webgl`), editor, layout | Usable without layout or rendering defects, or a list of fixes |
| **D5** | Does a `deno desktop` window host ACRYL? | A Deno desktop entry that starts the host (Option A: Node child; Option B: in process) and opens a window on its URL | The window shows the authenticated client; Ctrl+Q stops host and window cleanly; port freed |
| **D6** | What is the real size? | Build the D5 app with the profile's plugin set included explicitly; then remove dependencies a desktop build does not need (unused provider SDKs, telemetry exporters, bundled pnpm, `sharp` if unused) | Measured `.app` size; target 100 to 200 MB |
| **D7** | Shell parity | Map the 12 Electron modules (menu, tray, dialogs, windows, recovery window, profile window, workspace admission) and the updater, signing and notarization to `deno desktop` | Every Desktop feature has a Deno equivalent or a recorded gap |

Decision after D3: if the gaps are closable without editing `deepseek-harness/`, continue with Option B; otherwise
continue D4 to D7 with Option A, accept the size, and revisit when Harness or Deno change.

## Probe safety rules

- Always set `HOME` and `ACRYL_HOME` (and `DSH_HOME` when used) to a fresh `mktemp -d` folder, and `ACRYL_WEB_PORT` to a
  spare port. Never let a probe default to `~/.acryl`, `~/.dsh` or port 3080.
- Do not trust a printed URL: check the process's real listening sockets (`lsof -a -p <pid> -iTCP -sTCP:LISTEN`) and
  request the spare port.
- Stop every probe process, confirm its port is free, and delete its throwaway home afterwards.
- After each run, confirm no file in the real homes changed (`find <home> -mmin -5`).

## Relation to AIMBRACE

AIMBRACE (separate repository) already runs Cordis on Deno and needs the same loader replacement for its builder.
Solving D2 there first gives ACRYL a tested reload mechanism to adopt.
