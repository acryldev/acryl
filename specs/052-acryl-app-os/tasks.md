# Spec 052 tasks - ACRYL as an app OS

Decisions are in [`spec.md`](spec.md). Each task names its proof; a task is done when its proof ran on the named machines.

## Phase 1 - Shared runtimes and store (D1, D2, D8)

- [ ] T001 Measure the baseline on macOS (AION), Windows (mbpi9win), Ubuntu (z370n): a Control Center copy and one store app, sum of file
  sizes per folder, as in the spec's table. Recorded in `specs/052-acryl-app-os/baseline.md`.
- [ ] T002 The runtime record: `acryl.runtime` in an app's `package.json` (`desktop: electron@<version>` or `electrobun@<version>`), one
  exported type, read by `@acryldev/desktop-shell` and the Electrobun shell. Unit tests.
- [ ] T003 The runtime store `~/.acryl/runtimes/<name>-<version>/`: download once, verify the checksum, atomic rename into place, a lock so
  two starts do not download twice. Through the `AppInstance` family (never `homedir()` elsewhere). Tests with a fake download.
- [ ] T004 `acryl-desktop` starts an app with the shared Electron; the macOS branded clone (`brand.ts`) is made from the shared bundle.
  Proof: an app with no `electron` in `node_modules` opens its window on all three OSes.
- [ ] T005 The same for Electrobun apps (`electrobun/main.ts`, `shell-core.mjs`): the shared Bun and Electrobun. Proof: the Electrobun
  Blank and CRM walks pass with the shared runtime.
- [ ] T006 The package store `~/.acryl/store`: apps made by `acryl new`, the store and agents install through it (hard links), native
  modules once per runtime ABI, a same-volume check that falls back to copies with a sentence. Proof: second app adds under 50 MB.
- [ ] T007 The app template and the Control Center/ADE Blends drop `electron` from their dependencies and name their runtime (T002).
- [ ] T008 `acryl apps reinstall` (all apps or one) and `acryl clean` (unused runtimes and store entries, after saying what it removes).
- [ ] T009 Walk: HMR and on-the-fly plugin creation (`_testfield/crm-eb/live-test.sh`) on an app using the shared runtime and store, on
  all three OSes.

## Phase 2 - Add to Applications (D4)

- [ ] T010 The launcher model: what is written per OS, as data (paths and contents), one function per OS, pure and unit-tested.
- [ ] T011 macOS: `~/Applications/<Name>.app` (Info.plist with `io.github.acrylblends.<id>`, `.icns` from the app's icon, a script that
  starts the app, ad-hoc `codesign`). Proof on AION: Spotlight finds it, Launchpad shows it, a click opens the app with its name and icon in
  the Dock, Quit works.
- [ ] T012 Windows: Start menu `.lnk` with the icon (`.ico`). Proof on mbpi9win: Start search finds it, a click opens it.
- [ ] T013 Linux: `.desktop` file and icon under `~/.local/share`. Proof on z370n (GNOME): the app menu shows and opens it.
- [ ] T014 Remove from Applications deletes exactly what T011-T013 wrote (recorded in `~/.acryl/launchers.json`). Proof: nothing left.
- [ ] T015 `acryl --gui` offers once to add the Control Center itself; `acryl apps add-launcher <app>` in the terminal.

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
