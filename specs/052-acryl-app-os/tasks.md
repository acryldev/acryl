# Spec 052 tasks - ACRYL as an app OS

Decisions are in [`spec.md`](spec.md). Each task names its proof; a task is done when its proof ran on the named machines.

## Phase 0 - WebBoxes (D9, D10), first

- [x] T030 (done 2026-11-24, webboxesai 37a05b7: one read-only store per image content, each box an overlay; a new box 3.5 MB (was ~400 MB), box + published copy 6.4 MB (was ~780 MB).) The box image carries the framework's `node_modules` for its `@acryldev/blends` version as a read-only layer; the app in the
  volume resolves its own packages first, then the shared layer. Proof on z370n: a new box adds under 50 MB to its volume; its app,
  terminal, agent and Update work; Deploy's published copy adds only its code.
- [x] T031 (done 2026-11-24, webboxesai eafd39d..77b7a86: 14 boxes and 6 published copies moved one at a time with backup and automatic rollback; 8252 MB to 1543 MB of volumes (81% less); 392 MB of backups kept for the owner.) Existing boxes move to the shared layer by reinstall (D8), one at a time, each checked before the next.
- [x] T032 (done 2026-11-24: an edit box starts in 2 s; a published copy wakes in 1.2 s through the gate (warm 36 ms); 13 of 14 edit boxes were asleep at idle.) Measure for D10: a box's cold start time, and how many boxes had no request in the last hour/day.
- [x] T033 (done 2026-11-24, webboxesai 50fe7f7: published copies stop after 60 idle minutes and wake on the next visit (edit boxes already slept after 30 min); idle memory 0 MB.) Idle boxes sleep and wake on the next request (after T032 says the start is short enough).

## Phase 1 - Shared runtimes and store (D1, D2, D8)

- [x] T001 (done 2026-11-24, [`baseline.md`](baseline.md): npm today 701-754 MB per app; spec 049's shared Program 7-12 MB per extra app on all three OSes with Electron once; pnpm's store alone 305-404 MB, the Electron override alone 367-451 MB; every layout starts with terminal, live plugins and HMR.) Measure the baseline on macOS (AION), Windows (mbpi9win), Ubuntu (z370n): a Control Center copy and one store app, sum of file
  sizes per folder, as in the spec's table. Recorded in `specs/052-acryl-app-os/baseline.md`.
- [ ] T002 The runtime record: `acryl.runtime` in an app's `package.json` (`desktop: electron@<version>` or `electrobun@<version>`), one
  exported type, read by `@acryldev/desktop-shell` and the Electrobun shell. Unit tests.
- [ ] T003 The runtime store `~/.acryl/runtimes/<name>-<version>/`: download once, verify the checksum, atomic rename into place, a lock so
  two starts do not download twice. Through the `AppInstance` family (never `homedir()` elsewhere). Tests with a fake download.
- [ ] T004 `acryl-desktop` starts an app with the shared Electron; the macOS branded clone (`brand.ts`) is made from the shared bundle.
  Proof: an app with no `electron` in `node_modules` opens its window on all three OSes.
- [ ] T005 The same for Electrobun apps (`electrobun/main.ts`, `shell-core.mjs`): the shared Bun and Electrobun. Proof: the Electrobun
  Blank and CRM walks pass with the shared runtime.
- [x] T006 (done 2026-11-24, [`step1-proof.md`](step1-proof.md): the store is spec 049's Program in `~/.acryl/program/blends-<version>`, the one install `plugins/launcher/app-install.js` run by `acryl` and Control Center; 5.9-12.8 MB per extra app on macOS, Windows and Ubuntu, one Electron, every start check, the Program whole after its first app is removed. `acryl new` in a terminal installs through it too since cb92e01c (6.7-18 MB per extra app on the three hosts, [`step1-proof.md`](step1-proof.md#acryl-new-installs-through-the-one-install-2026-11-24-commit-cb92e01c0c496b773bb77a08a609130d9569ff3f)); a bare `npm create acrylblends` still installs in full, accepted for developers.) The package store `~/.acryl/store`: apps made by `acryl new`, the store and agents install through it (hard links), native
  modules once per runtime ABI, a same-volume check that falls back to copies with a sentence. Proof: second app adds under 50 MB.
- [ ] T007 The app template and the Control Center/ADE Blends drop `electron` from their dependencies and name their runtime (T002).
- [x] T008 (done 2026-11-25, 8d7aeb91, [`step1-proof.md`](step1-proof.md): `acryl apps reinstall [<id>]` puts an app onto the shared Program, `acryl clean` removes the Programs no app uses after saying what and how much and asking once; proven on z370n, mbpi9win and AION.) `acryl apps reinstall` (all apps or one) and `acryl clean` (unused runtimes and store entries, after saying what it removes).
- [ ] T009 Walk: HMR and on-the-fly plugin creation (`_testfield/crm-eb/live-test.sh`) on an app using the shared runtime and store, on
  all three OSes.

## Phase 2 - Add to Applications (D4)

- [x] T010 The launcher model: what is written per OS, as data (paths and contents), one function per OS, pure and unit-tested
  (`plugins/launcher/os-launchers.js` `launcherPlan`, `plugins/launcher/tests/os-launchers.test.mjs`).
- [x] T011 macOS: `~/Applications/<Name>.app` (Info.plist with `io.github.acrylblends.<id>`, `.icns` from the app's icon, a script that
  starts the app, ad-hoc `codesign`). Proof on AION (scratch user folder, 2026-11-24): `codesign --verify` valid, Spotlight (`mdfind`) finds the bundle,
  `open` starts the app and its Electron window shows (visible true, the saved model key in its environment, none in any launcher file), the app is
  in `lsappinfo`; closing it leaves no process. Dock name (AION, scratch HOME, 2026-11-24, a real Notes app made with blends 1.7.32 and desktop-shell 0.1.13,
  `open --env HOME=<scratch> Notes.app`): the running app is desktop-shell's branded clone (`<acryl root>/electron/notes-50f6.app/Contents/MacOS/Electron`, bundle id
  `com.acrylblends.app.notes-50f6`), not the stock Electron, so the launcher's path does reach `brandedElectron`. Found there: the Dock said "notes" (the package's name)
  while the window says the Blend's "Notes"; `launch.ts` named the clone from `appTitle`, now from the instance (`brandingOf`, test in `test/launch.test.ts`), and
  `lsappinfo` then says "Notes". The clone has the icon file (`electron.icns`, the ACRYL Blends logo: the app has no `assets/icon.png`); the Dock drawing itself was not looked at.
- [x] T012 Windows: Start menu `.lnk` with the icon (`.ico`, 256 px). Proof on mbpi9win (Windows 10, scratch user folder): the `.lnk` resolves to
  `C:\Windows\System32\wscript.exe` + the `.vbs` that runs Node with window style 0; started from the interactive session (scheduled task /IT) the
  app's window showed; closing leaves no process. Not checked: Start search itself (the scratch folder is not the real Start menu) and that no console
  flashes.
- [x] T013 Linux: `.desktop` file and icon under `~/.local/share`. Proof on z370n (Ubuntu, no display): `desktop-file-validate` valid, `gio info` reads
  it, `gio launch` starts the app (its record says headless), closing leaves no process. Not checked: the app menu showing it and a window opening
  (z370n has no display).
- [x] T014 Remove from Applications deletes exactly what T011-T013 wrote (recorded in `<home>/launchers.json`). Proof on all three: nothing of the
  launcher is left (the user's `.acryl` keeps only the list, the key and the opener's empty log folder).
- [x] T015 `acryl --gui` offers once to add the Control Center itself (the answer is kept in `launchers.json`); `acryl apps add-to-applications <id>`
  and `remove-from-applications <id>` in the terminal; the Control Center has the same two as a button per app (`appShortcut` on the service).
  Moved Node.js or app folders are written into the launchers at the next start. Not walked: the offer prompt itself in a real terminal.

## Phase 3 - Apps as apps in the Control Center (D5)

- [ ] T016 Each app's own icon on its tile (`assets/icon.png`, served by the launcher's Host half; the letter only without one).
- [ ] T017 A grid view (icons and names, like a launcher) beside the list; remembered per viewer.
- [ ] T018 Per-app actions: Add to Applications / Remove, Export as installer, with Share, Deploy, Update as today.
- [ ] T019 The terminal Control Center (`acryl --tui`) gets the same actions as menu items.
- [ ] T020 Side-by-side screenshots of grid and list, light and dark, on a real screen.

## Phase 4 - Export as installer (D6)

- [ ] T021 "Export as installer" runs `acrylblends pack` for this OS and CPU into a chosen folder, as a job with progress and the
  installer's size; other OS/CPU pairs named, not attempted.
- [ ] T022 Proof: an app made in the Control Center exports and installs on a clean scratch home on macOS (DMG), Windows (exe) and
  Ubuntu (deb), and starts.

## Phase 5 - ACRYL AOS, its own Blend (D11-D14, design `design/aos.html`)

- [x] T040 Repository `acrylblends/01-acryl-aos` (category 01 System, subcategory "Agentic operating systems" added to the site's taxonomy),
  made with create-acrylblends on the current frame; desktop (Electron) surface first.
- [x] T041 Desktop: icons of every app in `control-center-apps.json` (their own `assets/icon.png`), folders, files that open in their app,
  menus, dock, Settings; the arrangement in `~/.acryl/desktop.json`, written through `desktop.*` tools the agent can call.
- [x] T042 A click opens the app in its own OS window (D12) with its own host (D11); sleep after idle; Activity view with real numbers.
- [x] T043 One chat that drives every app through the door's tools; tool steps and model steps shown apart, tokens counted from the
  provider's usage; "Save as workflow" into Workflow Automation, replayed with no model call.
- [x] T044 Per app: Add to Applications (D4, the shared launcher code), Export as installer (D6).
- [x] T045 Proof on AION, mbpi9win and z370n: made, opened, an app started from it in its own window, a chat turn with DeepSeek that uses
  a tool, a saved workflow replayed with 0 model tokens; screenshots side by side with `design/aos.html`; released v0.1.0 on the store.

Delivered 2026-11-24 (AOS 0.1.4 to 0.1.7, `acrylblends/01-acryl-aos`; first release with installers v0.1.4, not v0.1.0, because the
store entry had reached 0.1.3 while the proof was being made). Measured on AION (macOS, M4), z370n (Ubuntu, Xvfb) and mbpi9win (Windows 10,
console session), each AOS made from the store with create-acrylblends 1.7.31:

| | AION | z370n | mbpi9win |
|---|---|---|---|
| Notes opens in its own OS window (window server lists notes + workflow-automation) | 28.2 s | 9.1 s | 27.8 s |
| The chat (DeepSeek) arranges the desktop with AOS tools: provider tokens | 70,814 | 70,486 | 73,067 |
| Saved as a workflow, Run again: model tokens added | 0 | 0 | 0 |
| Activity, Notes from its processes | 325 MB, 7 | 1,093 MB, 10 | 763 MB, 9 |
| Asleep after 1 min unused, then woken by an open (AOS's measure) | 4.0 s | 2.4 s | 7.5 s |
| Add to Applications / Remove | notes.app | acryl-notes.desktop | notes.lnk |
| Export as installer (Notes) | dmg 217 MB, 107 s | deb 144 MB + tar.gz 183 MB, 55 s | exe 177 MB, 364 s |

The open time includes installing the app's packages on its first open. AION's Node is an x64 build under Rosetta, so its export is
mac-x64: the packer follows the running Node because npm installs native packages for it. The v0.1.4 Apple silicon installer from the
release's download link started on AION under a scratch home in 6 s and showed its window.

Differences from `design/aos.html`, all chosen while building: D12's one chat is the frame's own chat, not a separate panel with suggestion chips; the meter has
no "runtime 1, host 1" (D11: one host per app); a fresh desktop has only the app icons in one column, not sample folders and files; there is
no Blends Store icon. Partly done in T041: a file tied to an app opens that app, not the document inside it; other files open as text in an
AOS window. Export needed `@acryldev/create-blends` 1.7.31 (9d30f0e1): create copies a folder as git sees it, so a running app's door file
stays behind.

## Phase 6 - Each Blend a real OS app on one shared engine (D15; after `baseline.md` is complete)

- [ ] T050 Characterize first (Working Effectively with Legacy Code): a test per install place (Control Center "+ New app" and Start,
  `acryl new`, `acryl --gui`/`acryl ade` copies, the store's Make, an agent's install) recording the folder it makes and what starts.
- [ ] T051 One install module (A Philosophy of Software Design, deep module): every place above calls it; it installs the app's own
  packages on top of the shared Program for its Blends version (`~/.acryl/programs/blends-<version>/`, through `AppInstance`), with the
  two Step 0 fixes (`.package-lock.json` copied, the copy stamped now). Same-volume check; another disk falls back to a copy, said once.
- [ ] T052 The framework-first resolver, generalised from `plugins/extensions/resolve.ts` (spec 049): framework names resolve to the
  Program for any parent, everything else normally. Proof: two apps share one framework instance each (no second copy; the October
  lesson), HMR and live plugins pass (`live-test.sh`) on all three OSes.
- [ ] T053 The D4 launcher opens a per-app engine copy (`make-blend-app.mjs` / `linkTree`, `brand.ts`), so no Node is needed to open
  an app. Proof on AION, mbpi9win, z370n: found by the OS search, opens with its name and icon, MB per app measured.
- [ ] T054 `acryl apps reinstall` moves an existing app onto the Program (old `node_modules` kept until it starts) and `acryl clean`
  removes Programs and engine copies no app uses (Release It!, steady state).
- [ ] T055 The Control Center Blend (`acrylblends/63-acryl-control-center`) takes `@acryldev/launcher-desktop` as a dependency instead of its
  own copy `plugins/acryl-launcher-host` (The Pragmatic Programmer, DRY: v0.2.21 needed the 0.1.11 to 0.2.0 diff of `runner.ts` and
  `service.ts` patched in by hand). What the copy differs in today (checked against `plugins/launcher-desktop` at c5022486 and the Blend at
  16ad070): `door.ts` calls `/api/door/...` where the package calls `/api/acryl-door/...`; `index.ts` is another plugin (`name`
  `acryl-launcher-host`, no `appInstance` and no `acrylTools`, so no launcher tools for the chat; home from `ACRYL_LAUNCHER_HOME` or
  `~/.acryl`, not `appInstance.home`; the self-update view is built there; routes mounted under `/app`); it has no `node.ts` and no
  `tools.ts`; the page is the built `public/launcher.js`, not the package's client; its `package.json` is `0.1.0` with no build. `contract.ts`,
  `registry.ts`, `route.ts`, `runner.ts`, `self-update.ts` and `service.ts` are the package's files unchanged. Done when the Blend lists
  the package, its mount points and `appInstance` come from the frame, the copy and `scripts/launcher-blend.mjs` are gone, and a release
  starts, makes and updates apps as v0.2.21 does (AION walk).
  Done in the Blend as v0.2.22 and v0.2.23 (acrylblends/63-acryl-control-center): the package is a dependency, `plugins/acryl-launcher-host` and
  `public/launcher.js` are gone, and `src/launcher.ts` is a wrapper that gives the package two things a Blends frame names differently (T055a, T055b).
  `scripts/launcher-blend.mjs` is still here: `pnpm dev`, `pnpm desktop` and `pnpm launcher blend` run Control Center from this checkout through it, so it
  goes only with a replacement for that dev start (T055c).
- [ ] T055a `@acryldev/launcher-desktop` takes ACRYL's root as an option, read from the AppInstance family (`acrylRoot` of `@acryldev/instance/storage`),
  so a Blend needs no `src/launcher.ts` to replace `appInstance.home`: in a Blends frame `appInstance.home` is the app's own data folder
  (`~/.acryl/apps/<id>/data`), in this repository's runtime it is ACRYL's root, and the package reads it as the root (found 2026-11-24 when the Blend
  took the package: the apps listed would have been the wrong ones).
- [ ] T055b The Blends frame provides the `acrylTools` port the way `@acryldev/harness-runtime` `engine-tools` does (a thin delegate over the chat's `tools`),
  so no Blend provides it itself. Today the Control Center Blend provides it to the launcher alone (`src/launcher.ts`, isolated scope, provided from a plugin
  of that scope: a provide made straight from `apply` is not seen by the package); the other plugins that inject `acrylTools` (plugin-admin, workspace)
  find no port in a Blends frame, so their tools are not in the Blend's chat. Providing it for the whole frame brings those tools into the chat: decide that
  with the owner first.
- [ ] T055c Replace what `scripts/launcher-blend.mjs` does for `pnpm dev` (assemble the Control Center Blend from this checkout) with the Blend's own
  repository run from source, then remove the script and `launcher-dev.mjs`'s `blend` face.

## Phase 7 - Share with team (D16, D17)

- [ ] T060 One "Share" place in an app's Settings and per app in the Control Center: Save to GitHub (`@acryldev/save`), a feature to the
  registry (`@acryldev/plugin-share`), Deploy to WebBoxes.ai, each as today, gathered, not rewritten.
- [ ] T061 "Share with team": save and push, run the app repository's release workflow, show progress and one download link.
- [ ] T062 AppImage as a Linux target in the packer and the release workflow, beside deb and tar.gz.
- [ ] T063 The download link is the app repository's GitHub release page (owner 2026-11-24); its notes carry the first-open steps for
  unsigned installers on macOS and Windows, with pictures.
- [ ] T065 Windows signing for free: apply to SignPath Foundation's open source program once T061 builds in CI, Control Center first;
  wire its signing step into the release workflow when approved.
- [ ] T064 Proof: an app made in the Control Center is shared with "Share with team"; on a second machine with no git and no Node, the
  installer from the link installs and opens it, on macOS, Windows and Ubuntu.
