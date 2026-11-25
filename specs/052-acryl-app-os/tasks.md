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

The open time includes installing the app's packages on its first open. AION's Node in these runs was an x64 build under Rosetta (a non-login ssh shell picks it), so its export is
mac-x64: the packer follows the running Node because npm installs native packages for it. The v0.1.4 Apple silicon installer from the
release's download link started on AION under a scratch home in 6 s and showed its window.

Differences from `design/aos.html`, all chosen while building: D12's one chat is the frame's own chat, not a separate panel with suggestion chips; the meter has
no "runtime 1, host 1" (D11: one host per app); a fresh desktop has only the app icons in one column, not sample folders and files; there is
no Blends Store icon. Partly done in T041: a file tied to an app opens that app, not the document inside it; other files open as text in an
AOS window. Export needed `@acryldev/create-blends` 1.7.31 (9d30f0e1): create copies a folder as git sees it, so a running app's door file
stays behind.

## Phase 6 - Each Blend a real OS app on one shared engine (D15; after `baseline.md` is complete)

### Slice plan (2026-11-25, approved by the coordinator)

What exists already, from reading the code:
- **T050 and T051 are met by Step 1 (T006).** Every install place calls `plugins/launcher/app-install.js`. The Program is
  `~/.acryl/program/blends-<version>`, not `programs/`; the home is passed in by the caller.
- **T054 is met by T008,** except "engine copies". There are none to clean: the engine is the Program's Electron, linked or cloned into
  each app.
- **T052 is met by the layout, without a resolver.** Each app's `node_modules` is one whole tree (links or clones of the Program plus its
  own packages), so an app resolves one framework instance normally. The two-copies failure of October cannot happen within an app.
  `live-test.sh` passed on every host for every app (step1-proof.md). Proposed: mark T052 done with that evidence, not build a resolver
  (YAGNI, The Pragmatic Programmer; APOSD: no module that hides nothing).
- **T053, which is what remains:** today a launcher (T011-T013) runs the recorded Node with `shortcut-open.mjs`, which runs `npm run desktop`
  in the app's folder. The app then runs on its own Electron, which is the Program's, shared. "No Node on PATH" already holds, because the
  launcher records Node's absolute path.

What is still missing for "its own app with its own name and icon", per OS:
- **macOS:** done in the code. desktop-shell's `brand.ts` runs a per-app clone `<acryl root>/electron/<id>.app` named after the app, with
  `assets/icon.png` or the ACRYL Blends logo. T011's proof saw the Dock name; the Dock icon itself was not looked at.
- **Windows:** the app runs as the stock `electron.exe`. The taskbar groups it as "Electron", and pinning pins Electron, because neither
  the app (`app.setAppUserModelId`) nor the Start shortcut (`System.AppUserModel.ID`) sets an AppUserModelID.
- **Linux:** the `.desktop` file has no `StartupWMClass`, so a dock or app menu cannot match the window to the entry; it shows a generic
  icon.

Slices, each with characterization tests first (Working Effectively with Legacy Code), then the change, then the proof:

- [x] T056 **The app's identity is one value** (DDD Distilled: one term, one meaning; Clean Code: no duplication). The app id and name the
  launcher writes (`launcherPlan`) and the ones desktop-shell runs under (`brandingOf`) come from one place, so the AppUserModelID, the
  WM class and the macOS bundle id agree. Characterize `launcherPlan` and `brandingOf` as they are today, then share the rule.
- [x] T057 **Windows: one AppUserModelID** (`com.acrylblends.app.<id>`). The Start `.lnk` carries it, set through the PowerShell writer
  with values in environment variables, as the other fields are. The app calls `app.setAppUserModelId` with the same value before its
  window opens. Clean Architecture: the launcher (edge) and desktop-shell (frame) each know only the shared id rule.
- [x] T058 **Linux: one WM class.** The `.desktop` file gets `StartupWMClass=<class>`, and the app runs with that class (Electron's
  `desktopName` / `--class`, whichever Electron 44 honours, checked by `xprop WM_CLASS` on z370n's Xvfb).
- [ ] T059 **The proof on all three hosts:** an installed Blend with its own `assets/icon.png` (Notes), added to Applications, opened from
  the OS entry. Measured per host:
  - macOS (AION): `mdfind` finds it; `open` starts it; `lsappinfo` shows the app's name and bundle id; the Dock tile's icon file is the
    app's icon.
  - Windows (mbpi9win): the `.lnk` carries the AUMID; the running window's AUMID (read with PowerShell's shell property store) matches;
    the taskbar button groups under the app.
  - Linux (z370n): `desktop-file-validate` passes; `gtk-launch` starts it; `xprop WM_CLASS` of its window equals `StartupWMClass`.
  - Disk per app: the measurement from step1-proof.md, plus what the clone or launcher adds.
  - Every start check.

T056-T058 done in 503b746e. T059 run 2026-11-25 ([`phase6-proof.md`](phase6-proof.md)); it stays open for these:
- Windows Start search, known gap: the entry is in the Start menu with its AUMID, Get-StartApps did not list it within 180 s on a locked
  session; retest on an unlocked one.
- Windows taskbar grouping: unproven for lack of a screen. The running window's AUMID was not read.
- macOS, found in review: the `~/Applications` entry and the running app have different bundle ids; keeping the running app in the Dock is
  untried.
- Icons on Windows and Linux: not looked at.

What the proof cannot see, named up front:
- Start search on Windows and the app menu on Linux read the real user's folders. On the test hosts this means user alexa's Start menu on
  mbpi9win, and z370n's user. Question for the coordinator: may T059 write there (test hosts, never the owner's Mac), or should it stay in
  scratch folders, as T012 and T013 did? Answered: yes on mbpi9win, with the Start menu and the `HKCU` Classes and Uninstall keys listed
  before and after and left as they were.
- z370n has no desktop session, so a dock drawing cannot be seen there. The WM class match is the evidence.

Not in these slices (said so they are not lost): opening an app without npm. That means the launcher running the app's Electron directly
on its built frame, with Electron as Node, so neither Node nor npm is needed. It is what `make-blend-app.mjs` does for a packed product.
It is a larger change to desktop-shell's start path, and is proposed as the next slice after T059.


- [x] T050 Characterize first (Working Effectively with Legacy Code): a test per install place (Control Center "+ New app" and Start,
  `acryl new`, `acryl --gui`/`acryl ade` copies, the store's Make, an agent's install) recording the folder it makes and what starts.
  **Done 2026-11-25:** Met by Step 1 (T006).
- [x] T051 One install module (A Philosophy of Software Design, deep module): every place above calls it; it installs the app's own
  packages on top of the shared Program for its Blends version (`~/.acryl/programs/blends-<version>/`, through `AppInstance`), with the
  two Step 0 fixes (`.package-lock.json` copied, the copy stamped now). Same-volume check; another disk falls back to a copy, said once.
  **Done 2026-11-25:** Met by Step 1 (T006).
- [x] T052 The framework-first resolver, generalised from `plugins/extensions/resolve.ts` (spec 049): framework names resolve to the
  Program for any parent, everything else normally. Proof: two apps share one framework instance each (no second copy; the October
  lesson), HMR and live plugins pass (`live-test.sh`) on all three OSes.
  **Done 2026-11-25:** Met by the layout; no resolver built (slice plan above).
- [ ] T053 The D4 launcher opens a per-app engine copy (`make-blend-app.mjs` / `linkTree`, `brand.ts`), so no Node is needed to open
  an app. Proof on AION, mbpi9win, z370n: found by the OS search, opens with its name and icon, MB per app measured.
- [x] T054 `acryl apps reinstall` moves an existing app onto the Program (old `node_modules` kept until it starts) and `acryl clean`
  removes Programs and engine copies no app uses (Release It!, steady state).
  **Done 2026-11-25:** Met by T008; the old `node_modules` is kept until the install succeeds, and there are no engine copies to clean.
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
- [x] T055a (code on main ba09221a, to publish as launcher-desktop 0.2.1; the Blend passes `{ root }` from `acrylRoot` until it moves to the version) `@acryldev/launcher-desktop` takes ACRYL's root as an option, read from the AppInstance family (`acrylRoot` of `@acryldev/instance/storage`),
  so a Blend needs no `src/launcher.ts` to replace `appInstance.home`: in a Blends frame `appInstance.home` is the app's own data folder
  (`~/.acryl/apps/<id>/data`), in this repository's runtime it is ACRYL's root, and the package reads it as the root (found 2026-11-24 when the Blend
  took the package: the apps listed would have been the wrong ones).
- [x] T055b (code on main ba09221a, to publish as @acryldev/blends-frame 0.2.18; owner direction 2026-11-19 makes the plugin-admin and workspace tools in a Blend's chat wanted) The Blends frame provides the `acrylTools` port the way `@acryldev/harness-runtime` `engine-tools` does (a thin delegate over the chat's `tools`),
  so no Blend provides it itself. Today the Control Center Blend provides it to the launcher alone (`src/launcher.ts`, isolated scope, provided from a plugin
  of that scope: a provide made straight from `apply` is not seen by the package); the other plugins that inject `acrylTools` (plugin-admin, workspace)
  find no port in a Blends frame, so their tools are not in the Blend's chat. Providing it for the whole frame brings those tools into the chat: decide that
  with the owner first.
  Flake check (2026-11-25): the `{"error":"invalid JSON request"}` seen on a first POST to `/new` in two of five fresh-home runs of my own curl scripts was not reproduced in 145
  first-POST attempts on AION against v0.2.23 (50 warm restarts x 3, 25 with the failing script shape, 20 fresh homes); the request path reads the body once. Not reproduced, no fix made;
  if it recurs, record the exact request and timing.
- [ ] T055d `@acryldev/plugin-admin`'s agent tools (`acryl_plugin_list`, `acryl_plugin_set_enabled`) work in a Blend's chat (owner direction 2026-11-19: every
  agent drives the app). Found in the v0.2.24 walk: the frame gave the tools port but no `acrPluginLifecycle`, which only the ACRYL runtime provided. The
  frame owns switching (the same list and switch as its Settings > Plugins) and provides it as `frameAppPlugins` (@acryldev/blends-frame 0.2.18);
  `@acryldev/app-context` 0.2.3 adapts it to `acrPluginLifecycle` (`src/plugin-lifecycle.ts`, as `acryl-tools.ts` adapts the tools). The app's plugins
  (`blend.yaml` rows and `plugins/` folders) are changeable, each change asked of the person; the frame's own rows are listed and locked. No second plugin
  screen: DSH's `ui-settings-plugins` stays out of a Blend, so plugin-admin's two tabs have no place to show. Done when: tests, the full gate, and an AION
  chat walk that lists and switches a plugin, with a look at Settings showing one Plugins page.
- [ ] T055c Replace what `scripts/launcher-blend.mjs` does for `pnpm dev` (assemble the Control Center Blend from this checkout) with the Blend's own
  repository run from source, then remove the script and `launcher-dev.mjs`'s `blend` face.

## Phase 7 - Share with team (D16, D17)

Order decided by the owner (2026-11-25: "Ability to share it: push it to a GitHub repository, but also build the executable DMG, deb or exe for
distribution, like export app or make build ... multi way to share or move an app: persist to repo, to registry, produce a build, deploy to
webboxes.ai"; then "go build, yes"): one **Share** place per app first, with **Build installer** (T021, this computer's OS) as its first new action,
beside Save to GitHub, Publish to registry and Deploy to WebBoxes.ai (T060); then Share with team (T061-T064); then D18 steps 2 and 3 (T068, T069).

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

## Phase 8 - Shared until changed (D18)

- [x] T066 (done 2026-11-25, `sealProgram` in `plugins/launcher/app-install.js`, tests in `tests/app-install.test.mjs`; walked on hosts with T070) The Program is read-only: `plugins/launcher/app-install.js` makes its files read-only when it makes it (directories stay writable for
  npm's own work in an app); an app installed from it can still `npm install` its own packages; `acryl clean` and `acryl apps reinstall` still
  remove and replace it. Test: an in-place write to a linked file fails (Linux, Windows), a write in a macOS clone stays in that app.
- [ ] T067 The agent's instructions (app-context docs, the acryl-app skill) say: never edit `node_modules`; to change a core part, own it (T068).
- [ ] T068 `acryl plugin own <name>`: copy the plugin's source into the app's `plugins/`, mount it in place of the shared one (same row id), record
  it so `acrylblends update` merges upstream into it; refuse with the reason for a part that cannot be owned. Test and proof: an app owns
  `blends-frame`, changes its left panel, a second app is unchanged.
- [ ] T069 `acryl detach [--vendor]`: own real packages, leave the Control Center's list, move the app's data into its folder, drop the update
  link, `--vendor` copies every `@acryldev/*` package into `plugins/`, write `LICENSES.md`. Proof: the detached app installs and starts with
  `~/.acryl` moved away.
- [ ] T070 Proof of D18 on AION (macOS), z370n (Ubuntu) and mbpi9win (Windows), then the marketing line on acryl.dev and acrylblends.github.io
  (proposed to the owner first, never replacing the owner's own copy).

