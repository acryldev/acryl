# 018 - the same app as a desktop app

Status: implemented and released (acrylblends 0.6.0, and 0.6.1 for the plain Acryl app form). Node.js only: Bun, `bun compile` and Electrobun are later decisions.

As built (differences from the proposal below):
- The shell lives in `src/plugins/desktop/` (a Blend app) and `src/plugins/desktop-web/` (a plain Acryl app, added by `acrylblends add desktop` when the app has no `instance` plugin), not `src/desktop/`. `init --desktop` and `add desktop` add `electron` 44.0.0 as a development dependency, the script `npm run desktop`, and `.acrylblends/` to `.gitignore`.
- Only `desktop-user-data.ts` and `shutdown.ts` could be vendored verbatim (digest in `upstream.json`); the window options are our own `window.ts` with ACRYL's same `webPreferences`, because ACRYL's file imports Host types.
- `npm install` does not download Electron's binary (Electron 44 has no install script); the first `npm run desktop` does. `verify-desktop.mjs` exercises that path, the single-instance lock, the quit order, and that nothing is written outside the app folder or left running (also `--plain`, `--from-npm`); `verify:scaffolder` checks that only the plugin imports `electron`.
- 0.7.0: the shells register the `.tsx` hook before loading the app by dynamic import. Packaging (dmg, exe, deb) is still not built.

## Goal

An acrylblends app (the folder `init` creates: `src/app.ts`, the manifest, the plugins, the agent) also runs as a desktop app with the smallest possible addition: the same folder, the same
plugins, and a desktop shell that starts the app's own Node.js server inside the Electron main process and opens a window on its URL. No second app, no second routing layer, no rewrite of a plugin.

## Facts this rests on

Measured here, on this machine, before writing the proposal.

- **Electron's Node runs our apps unchanged.** The Electron 43 build of the installed ACRYL app reports Node 24.17.0 and Chrome 150 (`ELECTRON_RUN_AS_NODE=1`), and runs a `.ts` file with type stripping
  (`const x: number = 1` printed `ts ok`). Generated apps need Node 22.19 or newer and use only erasable TypeScript, so their source loads as it is. What is **not yet measured** is the same in the
  GUI main process (`electron src/desktop/main.ts` as the entry); the first task is a small spike that settles it (the fallback is a two-line `main.js` that imports `./main.ts`).
- **Size.** The `electron` npm package is 1.1 MB; it downloads the platform binary at install. The macOS Electron framework inside the installed ACRYL app is 228 MB, the whole app 644 MB (ACRYL
  also ships native tools: a terminal, search, document and speech libraries). A minimal acrylblends desktop app is the 228 MB framework plus the app's own few MB, so a user pays that once per app on disk.
- **ACRYL Desktop is large and Host-specific.** `apps/acryl-desktop` is about 46,000 lines of source, tests and scripts, with a `main.ts` of 1,279 lines that boots the ACRYL Host, profiles, plugin
  recovery, updates and a startup-recovery window. Almost none of that applies to an acrylblends app, whose server is `createApp(...)` returning `{ url, stop }`.
- **What ACRYL proved that is small and reusable.** (1) `src/shell/desktop-user-data.ts` (38 lines, depends on `node:path` only): an isolated Electron `userData` folder, chosen before the single-instance
  lock, from an explicit override or from the selected instance's own folder, so a development or per-app run never shares window state, logs, crash evidence or the lock with another app.
  (2) The window security settings in `src/shell/window-options.ts`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, a preload that exposes nothing but what it must,
  window created with `show: false`. (3) The single-instance lock, quit and graceful-shutdown order (`src/shell/shutdown.ts`, 177 lines): stop the server, then exit.
- **Packaging exists in ACRYL, and depends on its signing.** `electron-builder` 26.15.7 with hardened runtime, notarization for macOS (`mac.notarize`), NSIS for Windows and a Linux script; the mac target is
  `dir` and a separate release script makes the dmg. That needs the owner's signing identities and notarization credentials, which this repository does not have.
- **Our server is already window-ready.** `createApp` serves on a loopback port (`port: 0` picks a free one), the pages the app serves are same-origin to the window, and `loopbackOnly({ callers: 'own-page' })`
  (in the framework) accepts exactly requests from a page the app served: the window's own pages pass, other programs on the machine do not.

## Proposal

### Decision 1 - how an app becomes desktop: one optional plugin, one command

A library plugin `desktop` (`acrylblends add desktop`, or `acrylblends init my-app --desktop`, which is `init` plus `add desktop`). It copies one file, `src/desktop/main.ts` (about 120 lines), adds `electron`
to `devDependencies` and a script `"desktop": "electron src/desktop/main.ts"`. `npm run desktop`:

1. chooses the app's instance exactly as `src/main.ts` does (`selectInstance`) and sets Electron's `userData` to `<app home>/electron` before anything else;
2. takes the single-instance lock, named from the app's home, so the same app opens one window and two different apps open two;
3. calls `createApp(chosen)` (the server starts in-process, on a free loopback port) and opens one `BrowserWindow` on `app.url`, with the secure `webPreferences` above;
4. on window close or quit, `await app.stop()` (closes streams, frees the port, as today) and exits.

Nothing in `src/app.ts`, the manifest or any plugin changes; `npm run dev` and `npm run desktop` run the same code. Navigation inside the window is limited to the server's origin; any other link opens in the system browser.
An app with an `agent` shows the agent's pages and the routes it installs live in the same window, because the window is just a browser on the app. A coding agent works on the same files with the same docs.
`electron` is a dev dependency so a plain app (and `npx acrylblends init`) never downloads 228 MB; `init --desktop` is the only path that does.

### Decision 2 - v1 is run-from-source; packaging (dmg, exe, deb) is v2, written down but not built

For v1 `npm run desktop` is the whole product: it proves the shell, the isolation and the lifecycle, and it needs no certificates. Packaging a distributable app needs: a signing identity and notarization
credentials for macOS, a code-signing certificate for Windows, an icon set, an update channel, and CI runners per platform. None of that is in this repository today, and a dmg that is unsigned is refused by
macOS by default, so shipping one without the owner's credentials would be a worse experience than none. v2 would reuse ACRYL's `electron-builder` configuration shape (asar with the app's folder unpacked,
fuses, hardened runtime) with a per-app `build` section generated by `add desktop --packaging`. The spec for v2 is a follow-up once the owner supplies the identities and picks the platforms.

### Decision 3 - reuse ACRYL's small proven pieces by vendoring, not by depending on ACRYL Desktop

Take the two pure pieces (the isolated-userData resolver and the window security options, about 70 lines together) through the existing digest-checked sync (`scripts/sync-framework.mjs`), as the framework plugins
and the todo template are taken today, so the desktop shell and ACRYL Desktop cannot drift apart and a security fix upstream reaches generated apps. Do **not** depend on `apps/acryl-desktop`: it is not a
package, it needs the ACRYL Host, and its size would defeat the point. Write `main.ts` ourselves (the 4 steps above); the lifecycle order follows ACRYL's `shutdown.ts`. Ask ACRYL to move the two pieces into a
tiny shared package or a clearly marked folder so the sync has a stable source.


### Addition 2026-11-18 - the app icon from Settings

Status: ticket, not started. Requested by the owner 2026-11-18: "upload/update icon via Acryl Blends settings to set new icon that goes to source of the blends app".

#### What the person can do

In a running Blends app, Settings > App > Icon shows the app's icon. They can:

- upload a new image (PNG, JPEG, SVG or WebP), see it previewed, and keep it;
- go back to the default ACRYL Blends logo.

The new icon is part of the app's source, so it travels with the app: a save point, a share to GitHub, a clone, the next packed installer (Dock, Finder, the Windows installer, About) and the Control Center card all show it.

#### Where it lives today

- The icon is the app's own `assets/icon.png`, else the ACRYL Blends logo (`plugins/desktop/brand.ts`, `iconFile`).
- The packer uses the same file for the installed app (`scripts/pack-blank-mac.mjs`, around line 413).
- There is no screen to change it: a person replaces the file by hand.

#### Acceptance

1. Upload in Settings writes `assets/icon.png` (converted and squared to 1024x1024; transparent padding, never stretched) and the change shows up as an unsaved change of the app, like any edit.
2. A running desktop window and the Dock pick up the new icon without a restart; the web page favicon follows it.
3. "Use the default" removes `assets/icon.png`.
4. A file that is not an image, or larger than 5 MB, is refused with a plain message; nothing is written.
5. Packing the app after the change gives an installer with the new icon on macOS, Windows and Linux.
6. The Control Center card for the app shows the icon instead of the letter tile.

#### Open questions

- Which settings section: Settings > App (where the app's name is) or Settings > General.
- Whether the conversion happens on the Host (sharp, or the platform's own tool) or the page sends an already squared PNG from a canvas. The canvas route needs no new dependency.

## Not in this spec

Bun, `bun compile` and Electrobun (the same shell idea with a lighter runtime: decided later, once Bun is a verified runtime); auto-update; tray, menus and notifications beyond Electron's defaults; Windows and
Linux specifics beyond what Electron does by itself; any change to how the agent builds plugins.

## Plan if confirmed

1. Spike (half a day): `electron src/desktop/main.ts` in a generated app loads TypeScript and `createApp`, one window shows `Acryl!`/the todo page, quit frees the port. Report what failed, if anything.
2. The `desktop` plugin and `init --desktop`; the userData isolation test (two apps, two homes, two windows, no shared state); a test that quit stops the server.
3. Vendor the two ACRYL pieces with a digest and a drift check.
4. Docs: a "Desktop" page in the framework docs (in ACRYL) and the Blends guide; a gate that launches the shell headlessly in CI where a display exists.
5. v2 (separate spec): packaging, signing, update.

## Risks

- The GUI main process may handle `.ts` differently from `ELECTRON_RUN_AS_NODE`: the spike answers it before any other work.
- Electron's Node (24.x) differs from the Node the app runs under with `npm run dev` (22.19 or newer): a plugin that relies on a Node 22-only behavior would differ. Generated apps are tested on both in CI.
- 228 MB per app: acceptable for an opt-in dev dependency, and the reason v2 packaging should offer a shared runtime later.
- `electron` postinstall downloads from GitHub releases: air-gapped installs need a mirror (`ELECTRON_MIRROR`), which the docs should mention.
