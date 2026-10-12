# 042: self-extension, hot reload and app updates in a distributed app

**Date**: 2026-10-01. **Method**: reading the code and specs in this repository. Nothing here was run against a packaged, installed build; where that matters it says so.

"Self-update" can mean two different things, and they behave very differently:

1. **Self-extension**: the agent writes a new Cordis plugin (or edits one) and the running app loads it, without reinstalling ACRYL.
2. **App updates**: a new version of ACRYL itself replaces the installed one.

## 1. Self-extension in an installed app

**Where plugins live.** Not inside the `.app`, `.exe` install or package. The app's state is in the user's ACRYL home (`~/.acryl` for the default app, chosen once by `runtime/acryl-harness-runtime/src/instance/select.ts`; see `docs/acryl/APP-INSTANCES-AND-BULKHEADS.md`). A new plugin is written there, so a read-only application bundle does not block it.

**How a new plugin goes live** (`docs/acryl/plugin-hot-reload.md`, `specs/037-guardrailed-self-extension/spec.md`):

| Step | Mechanism |
|---|---|
| Install | `dsh plugin add file:<dir>` (a `pnpm add` into the profile plus bundle reconcile), about 0.45 s per spec 037. The packaged app carries its own pnpm (`apps/acryl-desktop/src/main.ts` provides "packaged pnpm runtime PATH"; `node_modules/pnpm` is 12.5 MB of the payload) |
| Activate | `ctx.livePluginActivation.activate(pkg)` mounts the Loader row on the running Host, about 4 ms, no restart |
| Renderer | The web page reloads inside the same window (about a second); the Host and session state are untouched |
| Edit an existing local plugin | `/reload` re-installs every local extension from its source folder, checked and rolled back on failure, or `ACRYL_PLUGIN_WATCH` restarts the fiber on file changes. The old fiber is disposed first |
| Enable, disable | `entry.update({ disabled })`, persisted per profile in `<userData>/plugin-lifecycle/state.json` |

**Hot reload does not use the Cordis HMR plugin.** In the harness profile the `hmr` row is `disabled: true` ("Module reload is opt-in per profile"). ACRYL's live toggling and activation go through Loader entries and fibers. The Loader still uses Node's private module loader when it can reach it (`deepseek-harness/vendor/loader/src/internal.ts`): through the `--expose-internals` flag, or in the packaged Desktop app through the prebuilt native addon `node-addon-require-builtin` (listed in `apps/acryl-desktop/scripts/mac-universal.ts` and `package.json`). Without it, `tree.import` falls back to a plain `import()`.

**What is proven.** A saved agent run (`specs/037-guardrailed-self-extension/end2end-tests-self-extensions/attempt-3-...`) shows an extension being written and updated, and `evidence/q7-live-local-install-tui.json` records a live local install, **measured on the terminal surface**. The status line of spec 037 says implementation was done on 2026-09-20 and the owner's real Web and Desktop test (T014) was still pending. So the packaged Desktop path is designed and specified, not shown working.

**Not documented anywhere I found:** how an edited, already-imported module gets fresh code, since ES module caches cannot normally be evicted. The re-install-and-activate flow works in the saved evidence, but the cache mechanism was not traced.

### What each shell option does to this

| Option | Self-extension |
|---|---|
| Electron (today) | Works as designed. The Node host, the native addon and bundled pnpm run inside the app |
| **Option A**: any shell plus the Node Host as a sidecar | The Host process is unchanged, so install, activation, pnpm and the loader behave as today. The sidecar bundle must carry Node, the per-architecture native addon, `node-pty` and pnpm. Not verified: signing and notarizing a sidecar Node on macOS (hardened runtime entitlements for a Node process that loads native addons) |
| **Option B**: Host inside Bun or Cottontail | E4 shows the loader's Node internals do not exist on Bun, so only the plain-`import()` fallback remains. Activating a **new** module has no cache to evict, so it may work. Re-loading an **edited** module is the part that needs a Bun-specific mechanism (probe P3: Bun re-evaluates `import('/path?v=i')` but not `import('file:///path?v=i')`). The install step runs `pnpm`, a Node program, so a Bun-only app would also need Node or a different installer. None of this was run |

## 2. App updates (a new ACRYL version)

What the code does today (`apps/acryl-desktop/src/updates/`):

- It is **not an in-place self-update**. A Cordis plugin polls a version endpoint (first check after 60 seconds, then every 6 hours). If a newer version exists and the user confirms, it downloads the **full installer**, validates it, and hands it to the operating system. The user completes the install.
- Installer types: `.dmg` on macOS, `.exe` on Windows. The download platform type is `'darwin' | 'win32'` only, so **Linux has no update download path**.
- Packaging targets in `apps/acryl-desktop/package.json`: macOS `dir` (the DMG is produced by a separate step), Windows `nsis` x64 (not `.msi`), Linux `dir`. **No `.deb` target exists yet.** `publish` is unset, so there is no auto-update feed.
- **The update endpoints are not ACRYL's.** `DESKTOP_VERSION_ENDPOINT` is `https://www.dshdesktop.cn/api/desktop/version`, and the download endpoints are `https://www.dshdesktop.cn/api/downloads/mac` and `.../windows` (`update-checker.ts:4`, `update-download.ts:14-15`). I did not check what that server returns. Before distributing ACRYL builds, these must point at ACRYL's own release channel, otherwise an ACRYL install would look for DSH Desktop updates.

What survives an app update: the user's ACRYL home, with installed plugins and the profile, is outside the application bundle. Not specified anywhere: whether a plugin built against an older host keeps working after the host updates.

### What the candidate shells provide

| Shell | Updater |
|---|---|
| Tauri | Documented updater plugin and `createUpdaterArtifacts` in the bundle config (verified in the config schema). Needs a signing key and a release feed |
| Electrobun | Docs list an `Updater` API and an "Updates" guide (not read in detail) |
| Electron | `electron-builder` is installed, but ACRYL does not use its updater feed (`publish` unset) |

## Experiments

| Step | What | Pass condition |
|---|---|---|
| U1 | Take the packaged `dist/mac-arm64/ACRYL.app` with an isolated home, install a tiny local plugin with `dsh plugin add file:`, activate it, edit it and run `/reload` | New behavior appears without restarting the app. This is the unproven T014 path |
| U2 | Under Option A, repeat U1 with the Host as a Node sidecar inside a scratch Tauri bundle | Same result, and the signed bundle launches the sidecar on macOS |
| U3 | Point `DESKTOP_VERSION_ENDPOINT` and the download URLs at ACRYL's release channel (or a stub) | A packaged build checks and offers the right installer |
| U4 | Add Linux packages (`.deb`, AppImage) and Windows MSI to the packaging config, or record that they are out of scope | Targets build, or the decision is recorded |
