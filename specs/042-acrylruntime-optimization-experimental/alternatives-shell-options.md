> **Update 2026-10-02.** Not parked. The owner direction (spec 001, R20) is that ACRYL owns its own Web and Desktop surfaces with DSH as the engine, so the shell choice stays open and this comparison remains the working analysis.

# 042 Alternatives: which native-webview shell fits ACRYL

**Date**: 2026-10-01. **Method**: measured sizes of the packaged app on this machine, a count of the Electron features the Desktop shell uses, live repository data from GitHub for each candidate, and each project's own documentation. Where something was not verified it says so. Star counts and size claims in the candidate list that was pasted into the conversation were not used; the data below is from the repositories.

## What the shell actually has to do

The Desktop shell is thin. The Host runs the shared runtime (`createAcrylEngineHost`) and serves the client over `http://127.0.0.1:<port>`; Electron only shows that URL (see `findings-rewrite-vs-reuse.md`). So the shell needs these features, taken from the 12 modules that import `electron` in `apps/acryl-desktop/src`:

| Feature ACRYL uses | Where |
|---|---|
| Tray with icon updates, application menu | `shell/electron-shell-generation.ts`, `shell/electron-platform.ts`, `shell/native-menu.ts` |
| Open-folder and message dialogs | `electron-runtime.ts` (12 and 19 references) |
| Open external link, reveal in folder | `startup-recovery-window.ts`, `electron-reveal.ts` |
| Custom title bar and window options | `shell/window-options.ts` |
| Intercept new windows and navigation | `startup-recovery-window.ts` and 2 more |
| A bridge to the page (file path of a dropped file via `webUtils`) | `preload.ts` |
| Single instance lock, quit lifecycle, dock badge, native theme, notifications, crash reporter | `main.ts`, `electron-runtime.ts` |
| Start an installer for updates, start child processes | 7 files |
| Menu items for zoom, DevTools, find | `shell/native-menu.ts` |
| Mac universal build (x64 and arm64) | `scripts/mac-universal.ts` |

## Size: what any shell can and cannot save

Measured on `dist/mac-arm64/ACRYL.app`:

| Part | Size |
|---|---|
| Whole app | 471 MB |
| `Electron Framework.framework` (Chromium plus Node) | 228 MB |
| `app.asar.unpacked` (the app's own `node_modules`: `@deepseek-ai` 26 MB, OpenTelemetry 19 MB, `sharp` 17 MB, `openai` 13 MB, `shiki` 13 MB, bundled `pnpm` 12 MB, `@google` 12 MB, `@anthropic-ai` 11 MB, ...) | 236 MB |
| `app.asar` | 5 MB |

Reference binaries on this machine: Node 24.19.0 is 121 MB, Bun 1.3.14 is 63 MB.

Estimates built from those numbers (not measured as built apps):

| Approach | Approximate result |
|---|---|
| Replace Electron, keep the Node Host as a sidecar (Option A) | 236 + 5 + 121 + shell ≈ **365 MB**, about 22% smaller. The 228 MB framework is replaced mostly by a Node binary |
| Host inside Bun, if every gap in `findings-rewrite-vs-reuse.md` were solved (Option B) | 236 + 5 + 63 ≈ **305 MB**, about 35% smaller |

Whichever shell is chosen, the app's own 236 MB of dependencies stays. A shell that is 1 MB instead of 10 MB changes the total by about 2%. The size lever that does not depend on the shell is the dependency payload itself, and the Node binary in Option A.

## "Native WebKit" is only true on two of three platforms

macOS uses WKWebView (WebKit) and Linux uses WebKitGTK. On Windows the system webview is **WebView2, which is Chromium-based**, so every candidate that uses the system webview there is not WebKit. Only Bunmaska avoids Chromium on Windows, by building and carrying its own WebKit (WinCairo). Practical effect: ACRYL's UI has only ever run on Chromium, and any of these options means testing it on WebKit (macOS), WebKitGTK (Linux) and WebView2 (Windows).

## Candidates

| Candidate | Verified facts | Fit |
|---|---|---|
| **Tauri** (`tauri-apps/tauri`) | Created 2019, 111,510 stars, Apache-2.0, releases published within the last day, 1,469 open issues. Shell in Rust. Documented **sidecar** support (`bundle.externalBin`, "embed external binaries ... or prevent users from installing additional dependencies (e.g., Node.js)"). `universal-apple-darwin` build documented. Config schema has `titleBarStyle`, `trafficLightPosition`, `dragDropEnabled`, `trayIcon`, `externalBin`, `createUpdaterArtifacts`, `hardenedRuntime`, `notarization`, `nsis`, `dmg`, `deb`, `rpm`, `appimage`. Documented plugins for updater, single-instance, deep-linking | **Best coverage of the shell checklist and the most mature.** Costs: shell logic becomes Rust, and the Rust toolchain. Not verified: how Tauri's IPC behaves when the page is a remote origin (`http://127.0.0.1`) rather than bundled assets |
| **Electrobun** (`blackboardsh/electrobun`) | Created 2024, 12,861 stars, MIT, 2.0.2 released 2026-09-29. TypeScript main process on **Cottontail** (default) or Bun (optional). System webview or bundled CEF. Docs list `BrowserWindow`, `Tray`, `Application Menu`, `Context Menu`, `Utils`, `Updater`. **Supported targets: macOS arm64, Windows x64, Linux x64 and arm64. Intel Macs are not listed.** No cross-compilation | Closest to the current TypeScript shell code. Blockers on record: no macOS x64, brand-new 2.0 toolchain (Hutch, Cottontail) |
| **Bunmaska** (`ipfizz/bunmaska`) | Created 2026-05-27, 20 stars, MIT, **v0.1.0-alpha.9, no GitHub release**. Electron-style APIs on Bun and WebKit; ~21 main-process modules. Windows needs an embedded WinCairo engine ("without an engine, the app refuses to start"). **Tray has no menu on Linux or Windows**, menu shortcuts macOS only, cookies API macOS and Linux only, no DevTools on Windows, `contextBridge` not isolated on Windows. Runtime is Bun | Would keep most of the Electron-style shell code, but alpha and uneven on Windows and Linux. An in-process Host would inherit the Bun gaps measured in E4 and E5. macOS Intel not verified |
| **Wails** (`wailsapp/wails`) | Created 2018, 36,393 stars, MIT, v2.14.0 (2026-08-10); v3 is labeled Beta in its README. Go backend. Native dialogs and menus per README | Mature, but the shell would be Go. Tray, sidecar handling and universal macOS not verified |
| **Neutralinojs** (`neutralinojs/neutralinojs`) | Created 2018, 8,659 stars, v6.9.0 (2026-07-24), license reported as `NOASSERTION` by GitHub (check before use). Release ships `neutralino-mac_x64`, `mac_arm64`, `mac_universal`, `win_x64`, `linux_x64`, `linux_arm64`. Tray and file-dialog libraries credited in the README | Smallest and covers Intel Macs, but a minimal API. Menu depth, window options, updater and signing flow not verified |
| **tinyjs** (`tarwin/tinyjsapp`) | Created 2026-07-12, 547 stars, v0.42.3. macOS first, Windows and Linux "in beta". txiki.js backend. Page and backend talk over a Unix socket, **no HTTP server and no ports** | Different model from ACRYL's HTTP-served host, young, one maintainer |
| **zero-native / Native SDK** (`vercel-labs/native`) | Created 2026-05-08, 7,732 stars, v0.10.1, labeled a Labs experiment. Its README says every interface is "rendered without a browser or WebView" | **Not a fit.** It is a native UI toolkit, not a webview shell for the existing React client |
| **Gelectron** (`mileswolfallen2/gelectron`) | 6 stars, no release, created 2026-07-26 | Too early to evaluate |

## What the evidence supports (a recommendation, not a decision)

1. **Choose the Host question first, the shell second.** Keeping the Node Host (Option A) works today (E2 passes) and works with any shell that can start a child process and open a URL. Moving the Host into another runtime (Option B) is where the real risk is, and no candidate removes it, because the gaps (Node internals in the loader, `node-pty`, `node:sqlite`, `ws` upgrade) are in the Host, not the shell.
2. **Among shells for Option A, Tauri has the best documented coverage and maturity**, and supports Intel Macs through universal builds. Electrobun is closest in language but currently drops Intel Macs. Neutralino is smallest but thinnest. Bunmaska is alpha.
3. **Expect Option A to save about 100 MB (about 22%), not an order of magnitude.** The 236 MB of dependencies and a Node runtime remain. If size is the main goal, slimming the dependency payload is an independent step.
4. **Switching away from Chromium trades consistency for size.** The UI must be verified on WebKit, WebKitGTK and WebView2.

## Small experiments before any rewrite

Rust 1.95, Go and Xcode are already installed on this machine, so the Tauri steps need no new toolchain.

| Step | What | Pass condition |
|---|---|---|
| S1 | Safari check of the real client (manual, see `findings-rewrite-vs-reuse.md`, E1) | Terminal (xterm), editor, layout work in WebKit |
| S2 | Tauri hello window in a scratch folder that loads the E2 host URL | Token handshake and cookie work; client renders in WKWebView; empty-shell bundle size recorded |
| S3 | Same Tauri app bundles the built `acryl-web` and a Node binary as `externalBin`, starts it, reads the URL, stops it on quit | Host starts and stops cleanly; remote-origin IPC behavior recorded |
| S4 | One-file probes for tray, menu, folder dialog, drag-drop path, single instance | Each feature works, or the gap is recorded |
| S5 | Finish Electrobun E3 and run `runtime-compat.mjs` under Cottontail | Results recorded next to Bun's |

Stop at the first step that fails and record it here.
