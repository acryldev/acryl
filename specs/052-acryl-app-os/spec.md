# Spec 052 - ACRYL as an app OS: shared runtimes, real app icons, export

Status (2026-11-23): written, nothing built. Tasks: [`tasks.md`](tasks.md).

## The owner's words (2026-11-23)

"why should we copy it duplicating many times / why not re-using electron/electrobun / and just wrapping custom app codebase into
electron/electrobun"

"and node_modules also can be re-used ? / how about makeing it behave like app? / i mean really having icon clickable / maybe we can turn acryl
control center (gui, web and tui) into like an "Operating System App" where we see "apps icons" inside of Acryl Control Center and can setup
UX there kind of simulating "OS" inside of Acryl CC / with possibility to extract (produce DMG for example, to build, to distribute) / with
possibility to create symlinks icons outside of acrylCC to just click and launch the app like normal app"

Earlier the same day: "why it's not in /Applications? (or in Windows in Program Files, in LInux where apps are, etc) so that it's also openable
as normal app, searchable etc". Answered then: a launcher written on the person's own machine needs no Apple Developer ID and no notarization
(nothing downloaded carries the quarantine flag); a downloaded DMG does.

## Why: what an app costs today (measured on AION, Mac mini M4, 2026-11-23)

`npx acryl --gui` made `~/.acryl/control-center`, an ordinary npm project:

| Folder | Size | What it is |
|---|---|---|
| `~/.acryl/control-center` | 701 MB | the app: its code plus `node_modules` (693 MB) |
| `.../node_modules/electron` | 309 MB | Electron, a dependency of this one app |
| rest of `node_modules` | ~384 MB | the framework (`@acryldev/*`, `@deepseek-ai/*`), the same in every app |
| `~/.acryl/electron/control-center-fb69.app` | 288 MB shown | an APFS clone (`cp -c`, `plugins/desktop-shell/brand.ts`) of that Electron, only for the Dock's name and icon; shares blocks |
| `~/.acryl/apps/control-center-fb69` | 21 MB | the app's data (window state, chats, logs) |
| `~/Library/Caches/electron` | 128 MB | Electron's download cache |

Every app made by `acryl new`, the store or an agent repeats the 701 MB. An Electrobun app repeats its own Bun and Electrobun. Ten apps are
about 7 GB of mostly identical files. And none of them is an app to the operating system: it lives in a hidden folder, no Spotlight, no
Launchpad, no Start menu, no app menu; it opens only through `acryl --gui` or the Control Center.

Book rules that decide this (CLAUDE.md, the five books): *The Pragmatic Programmer*, DRY - one runtime of a version is one fact; a copy per
app is a second, third, tenth source of the same bytes. *Clean Architecture*, the dependency rule and plugin architecture - an app is its
own code (the policy) and names the runtime it needs; the runtime (the detail) is installed once and plugged in, never vendored into the
policy. *A Philosophy of Software Design*, deep modules - "Add to Applications" and "Export as installer" are one button each over a
platform's mess (bundles, shortcuts, `.desktop` files, packers). *DDD Distilled* - the Control Center is the bounded context "apps on this
machine"; launchers, exports and the runtime store are its concepts, not each app's. *Clean Code* - one name per concept: an **app**
(a folder with `blend.yaml`), a **runtime** (Electron, Bun, Electrobun at one version), the **store** (shared packages), a **launcher** (the
OS-side icon that starts an app), an **installer** (a DMG, exe or deb made by export).

## Decisions

- **D1 One runtime per version, shared.** `~/.acryl/runtimes/<name>-<version>/` (`electron-44.9.3`, `bun-1.4.3`, `electrobun-2.0.7`),
  downloaded once, verified by checksum, used by every app that names that version. An app's `package.json` stops depending on `electron`;
  it names the runtime (`acryl.runtime: { desktop: "electron@44.9.3" }`), and `acryl-desktop` starts the app with the shared one. Two
  versions live side by side; one nothing uses any more is removed by `acryl clean`.
- **D2 One store for packages, hard-linked into apps.** Apps install from a content-addressed store in `~/.acryl/store` (pnpm's model,
  one package version stored once, linked into each app's `node_modules`). Native modules (`node-pty`, `koffi`) are stored once per runtime
  version (their ABI). An app that patches a package gets its own copy of that package only. Store and apps must be on one volume (hard
  links); a home on another volume falls back to copies, said in words.
- **D3 Packaged installers stay self-contained.** A DMG, exe or deb carries its runtime and packages: that is what an installer is. D1 and D2
  apply to apps in `~/.acryl` and `~/ACRYL`, made and run on this machine.
- **D4 A launcher per app, made on request.** "Add to Applications" writes one launcher that starts the app (its runtime from D1, its own
  folder, its data in `~/.acryl/apps/<id>`), with the app's name and icon:
  macOS `~/Applications/<Name>.app` (a small bundle: `Info.plist` with an identifier anyone may choose, the icon as `.icns`, a script that
  runs the app; ad-hoc signed; found by Spotlight and Launchpad), Windows a Start menu shortcut in
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\ACRYL\<Name>.lnk`, Linux `~/.local/share/applications/acryl-<id>.desktop` with the icon in
  `~/.local/share/icons`. Per user, no admin rights, nothing in system folders. "Remove from Applications" deletes exactly what was written.
  No Developer ID and no notarization: nothing is downloaded, so nothing is quarantined. The Control Center adds its own launcher the first
  time `acryl --gui` opens it (asked once).
- **D5 The Control Center shows apps as apps.** Each app's own icon (`assets/icon.png`; the coloured letter only when it has none), a
  launcher-style grid as a view beside the current list, a click opens it on its surface (window or browser), and per app: Add to
  Applications, Export as installer, Share, Deploy, Update. The same actions in the browser (`acryl --web`) and as menu items in the
  terminal Control Center (`acryl --tui`).
- **D6 Export as installer is the packer, from the screen.** "Export as installer" runs `acrylblends pack` (the packer the Control Center's
  own releases use) for this machine's OS and CPU, into a folder the person chooses, with progress and the result's size. Other OS/CPU
  pairs are named as what needs that OS (or the repository's release workflow), not attempted. Signing and notarizing for distribution stays
  a separate step that needs the owner's Developer ID (`dist:mac`).
- **D7 One home stays.** Everything ACRYL writes is under `~/.acryl` (the owner's rule), except the launchers of D4, which by their nature
  live where the OS looks, and the installers of D6, where the person chose.
- **D8 Day 0, no migration code.** Existing apps are reinstalled into D1/D2 (`acryl apps reinstall`), not migrated by compatibility code
  (owner rule: few installs, reinstall is fine).

## Order and acceptance

1. **Shared runtimes and store (D1, D2).** Accepted when: on macOS, Windows and Linux a second app made from the store adds under 50 MB
   (measured, sum of file sizes) instead of ~700 MB; both apps start, the terminal works, HMR and on-the-fly plugins work (the
   `live-test.sh` walk); `acryl clean` removes an unused runtime.
2. **Add to Applications (D4).** Accepted when: on each OS the app is found by the OS search (Spotlight, Start, the app menu), opens by a
   click with its name and icon in the Dock or taskbar, and "Remove from Applications" leaves nothing behind; walked on AION (macOS),
   mbpi9win (Windows), z370n (Ubuntu).
3. **Apps as apps in the Control Center (D5).** Accepted by side-by-side screenshots of the grid and the list, on a real screen.
4. **Export as installer (D6).** Accepted when: an app made in the Control Center exports a DMG on macOS, an exe on Windows and a deb on
   Linux, and each installs and starts on a clean scratch home.

## Out of scope

Signing and notarization (the owner's certificate); an app store of our own beyond the Blends registry; sandboxing apps from each other
(Cordis isolation is not an OS sandbox; the box runtime is spec work of WebBoxes).
