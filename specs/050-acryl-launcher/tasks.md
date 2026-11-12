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
  create-acrylblends, no network); it passes on this Mac and runs in the Linux and Windows CI. Open: the owner walk with a real `npx acryl` on Windows
  Terminal and Ubuntu once 0.2.7 is published, where the app is made and started for real.
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
  optional dependency and is fetched and verified when `acryl code` is chosen, the way `acryl web` fetches the Web runtime.
  Done when: `npx acryl` on a fresh machine shows the launcher after downloading under 1 MB; `acryl code` then fetches the runtime once.
- [ ] T010 [core] "Set up a model": a command that sets a model provider and key for an app (none exists yet: not in the CLI grammar, the
  acrylblends command or the app door), then its journey.
  Done when: the journey sets a working model for an app made by "create an app" and the command it shows does the same.
- [ ] T011 [design, then both faces] The launcher as the local app store and control center (owner direction 2026-11-12, spec.md
      "Direction"): every app made with ACRYL on this machine in one list (path, Blend, running or not, address, update waiting), open with one
      key, and upkeep from the same place (update, check, share, stop, remove). Needs one registry of local apps under `~/.acryl` that
      `acryl new` and `acryl deploy` write to. Designed in `design/launcher.html` first, for the owner's review.
      Done when: the owner approves the design, and in the terminal face an app made by `acryl new` appears in the list and opens from it.
