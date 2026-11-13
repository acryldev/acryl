# Tasks: the ACRYL launcher (spec 050)

Design first: the owner reviewed `design/launcher.html` and answered Q1-Q3 on 2026-11-12 (D1-D3 in `spec.md`).

- [x] T001 [design] The owner reviews `design/launcher.html` in lavish-axi; the answers to Q1-Q3 are written into `spec.md` as decisions and
  the open questions removed.
  Done when: `spec.md` has no open question and the design page shows the decided behavior.
  Done 2026-11-12: D1-D3 in `spec.md`.
- [ ] T002 [core] The journey model: `acryl-launcher` provides `launcher` (`journeys()`, `start`, `answer`, `cancel`, events). The nine
  journeys of the design page as data, each step running the existing command, each ending with the equivalent command.
  Done when: a test runs every journey headless against a scratch `ACRYL_HOME` and the app it makes equals the app `acryl new` makes, file
  for file; cancelling a step leaves no process behind.
  State 2026-11-12: eight journeys (all but the model one, T010) and the session in `plugins/acryl-launcher`, each journey walked headless
  to its command (tests/session.test.mjs). A journey ends in the `acryl` command itself, so the app it makes is the app `acryl new` makes by
  construction; the session runs nothing, so a cancelled step has no process. Open: the Cordis `launcher` service, built with T004.
- [ ] T003 [terminal] The terminal face with `pi-tui` and `acryl-ui-tui`, opened by the command Q1 decides; arrows, Enter, Esc back, Ctrl-C
  cancel; works at 80 columns and in light and dark terminals.
  Done when: a pseudo-terminal test drives "create an app" with Enter only and gets a running app; the same on Windows Terminal and on
  Ubuntu.
  State 2026-11-12: `apps/acryl-launcher-tui`, opened by a bare `acryl` in a terminal (D1). tests/pty.test.mjs starts the packed selector
  with the real bundle in a pseudo-terminal, presses Enter four times and checks `acryl new my-app blank` ran (a local stand-in for
  create-acrylblends, no network); it passes on this Mac and runs in the Linux and Windows CI.
  Ubuntu walk 2026-11-12 (z370n, Node 24.14, a scratch home, the published `npx -y acryl@0.2.7` in a pseudo-terminal): the menu shows all
  eight journeys; Enter on "Create an app", Enter at the name (`my-app`) and the starter (Blank) shows "This runs now: acryl new my-app
  blank", then makes the app (131 files), installs it (586 packages, about a minute) and starts it at `http://127.0.0.1:3999/?token=...`;
  Ctrl-C stops it and nothing keeps running. Found on the way and fixed in c7fb29c1: on Node 18 (the Ubuntu default) `acryl` failed with
  "Invalid regular expression flags"; it now says it needs Node.js 22.19 and how to get it (ships with the next release). Seen, not yet
  changed: npm's own install output (audit, funding, a deprecation warning) is the noisiest part of the journey for a beginner.
  Open: the same walk on Windows Terminal.
- [ ] T004 [desktop] The desktop face with `@acryl/ui` over the same service, per Q3.
  Done when: a Playwright run on the window makes the same app as T003; an app made in either face is listed in the other.
- [ ] T005 [one file] The desktop launcher builds as one file per OS (DMG for macOS arm64 and x64, NSIS EXE for Windows x64, DEB for Ubuntu
  x64 and arm64) carrying its own Node; installing and creating an app needs nothing else installed.
  Done when: on a fresh account on this Mac, mbpi9win and z370n (scratch user), the downloaded file installs, creates an app and runs it,
  with no Node, npm or git preinstalled (git: the app-storage note's open item decides).
- [ ] T006 [docs] The workshop guide, the READMEs and acryl.dev start with the launcher: "run `npx acryl`" or "download ACRYL".
  Done when: every page that tells a person how to start shows the launcher first and the commands second.
- [ ] T007 [walk] The owner's walk: from nothing to a running app and a pulled plugin, once in the terminal face and once in the desktop
  face, on each OS, without opening the docs.
  Done when: the owner says it is simple; the screenshots are in the workshop handout.
- [ ] T008 [terminal] The ACRYL CLI reads light or dark from `acryl-ui-tui/scheme.js` instead of its own copy
  (apps/acryl-cli/src/tui/theme.ts resolvePaletteMode, themeDetection.ts schemeOfBackground), once acryl-ui-tui ships types.
  Done when: the rules exist once and the CLI theme tests pass against them.
- [ ] T009 [packaging] `npx acryl` downloads only the selector and the launcher: the 454 MB IDE runtime (`acryl-cli-<os>-<cpu>`) stops being an
  optional dependency and is fetched and verified when `acryl ade` is chosen, the way `acryl web` fetches the Web runtime.
  Done when: `npx acryl` on a fresh machine shows the launcher after downloading under 1 MB; `acryl ade` then fetches the runtime once.
- [x] T010 [core] "Set up a model": a command that sets a model provider and key for an app (none exists yet: not in the CLI grammar, the
  acrylblends command or the app door), then its journey.
  Done when: the journey sets a working model for an app made by "create an app" and the command it shows does the same.
  Done 2026-11-12: `acryl model` (status), `acryl model set deepseek` (asks for the key with typing hidden, or reads a pipe; stored once in
  `~/.acryl/model.json`, owner-only, never shown beyond its last four characters), `acryl model clear`. Every app the `acryl` command starts
  gets it as DEEPSEEK_API_KEY unless the environment already names one. The launcher has a "Set up a model" row.
- [ ] T011 [design, then both faces] The launcher as the local app store and control center (owner direction 2026-11-12, spec.md
      "Direction"): every app made with ACRYL on this machine in one list (path, Blend, running or not, address, update waiting), open with one
      key, and upkeep from the same place (update, check, share, stop, remove). Needs one registry of local apps under `~/.acryl` that
      `acryl new` and `acryl deploy` write to. Designed in `design/launcher.html` first, for the owner's review.
      Done when: the owner approves the design, and in the terminal face an app made by `acryl new` appears in the list and opens from it.
      State 2026-11-12: design in `design/control-center.html`, answered by the owner (spec.md D6-D9). Build order: the registry
      `~/.acryl/apps.json` and the list in the terminal face first, then the desktop screen, both before the workshop of 2026-11-20.
      Built 2026-11-12 (terminal face): the list `~/.acryl/apps.json` (plugins/acryl-launcher/apps-registry.js), `acryl apps` / `acryl apps add <folder>` /
      `acryl apps remove <id>`, an app made by `acryl new` (direct or from the launcher) listed when the command ends, the ACRYL home screen
      (apps with state and Blend, then + New app, Blends store, Add an app folder, Health, ACRYL ADE, All things to do; Enter opens, u updates,
      p pulls a plugin), "+ New app" asking for the folder (suggests ~/ACRYL, made if missing), `acryl --tui` (the same screen, needs a terminal)
      and `acryl --gui` (opens the installed desktop app, else fetches its installer). Not built yet: running state and the address in the list
      (the launcher runs nothing and records no port), update-waiting, start/stop, deploy, keep (agent apps); the desktop screen (T004).
- [ ] T012 [desktop] Build the Control Center design (`design/control-center.html`) as the desktop screen (owner 2026-11-12 D10): the list and
      numbers (apps, running, updates, on WebBoxes.ai), recent cards, the selected app's panel (Open, Stop, Deploy, Share, Open folder), search,
      + New app (where, name, starter, surface) and Add a folder; each card shows its surface (Web, Desktop) and CLI (TUI) is greyed out with
      "coming". Runs commands with the Node and npm on the machine and says so when missing (T005 comes after).
      Done when: the screen opens as the first screen of the desktop app on this Mac in an isolated home, makes an app, lists an app made in the
      terminal, and matches the design side by side.
      State 2026-11-12: built as `plugins/acryl-launcher-desktop` (Host routes and the screen in the frame's `shell.overlay` seat, composed on Web
      and Desktop; spec 050 "Desktop face"). Run on this Mac in the worktree's own isolated instance: the screen opens first with the design's nav,
      search, + New app, Add a folder, surface chips (CLI (TUI) greyed "coming"), the four numbers, cards and the selected app's panel; an app made
      through its route (`create-acrylblends` with the machine's npm) was listed, started with `npm run dev` and shown running with its address.
      Each app has a surface in `apps.json`; the terminal list shows it too. Not built (disabled with "coming" or a sentence): updates waiting,
      Deploy to WebBoxes.ai, Share, Open folder, Keep and Discard. A Desktop app starts with `npm run desktop` (own window) from the screen and from the
      terminal's "Open an app" (2026-11-13); "+ New app" in the terminal stays Enter-only and makes a Web app (the surface is chosen on the screen, so the
      terminal journey keeps its three answers).
      2026-11-13 (owner: "desktop should also be working", "pulling from registry acrylblends", the first-run popup, the look): the Blends store view lists the
      public registry (acrylblends.github.io/registry/index.json, 49 Blends, searchable) and "Make an app" runs `acryl new <name> --from <id>` in the chosen
      folder; an app that arrives without its dependencies (a registry Blend does) gets `npm install` first, from the screen's making step and from Start,
      shown as "making" / "starting". Seen live in an isolated home: a Desktop app from the registry (CSV Explorer) installed, started with `npm run
      desktop` and opened its own Electron window, the card showing running. The first-run popup now renders Settings > Models itself (DeepSeek key, third-party
      provider, custom API, account sign-in) with "More providers in Settings" and Later. The screen uses the ACRYL IDE's fonts, pill buttons and tokens, with
      colour for contrast, and the store is a card grid.
      Plugins from the screen (owner, 3 hours before a meeting, 2026-11-13): a running app's panel lists its plugins (made in the app, or pulled with their
      source and author), pulls one from a registry source (`github:owner/repo@version`) and shares one made in the app: the app's own publish plan is shown
      (account, repository, version, license, files, the line a friend pulls it with) and nothing is sent until the person clicks yes (the screen sends
      the door's `publish-confirmed` with the plan they read, as the terminal's prompt does). Seen live on this Mac: a plugin pulled from inboxxobni's
      registry repository, a plugin pushed to inboxxobni/acrylblends-demo-hello v0.1.0 (public repository and release confirmed on GitHub); the app's refusal
      (a test plugin in an old tool shape) is shown in its own words.

