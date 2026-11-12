# Tasks: the ACRYL launcher (spec 050)

Design first: no code before the owner has reviewed `design/launcher.html` and answered Q1-Q3 of `spec.md`.

- [ ] T001 [design] The owner reviews `design/launcher.html` in lavish-axi; the answers to Q1-Q3 are written into `spec.md` as decisions and
  the open questions removed.
  Done when: `spec.md` has no open question and the design page shows the decided behavior.
- [ ] T002 [core] The journey model: `acryl-launcher` provides `launcher` (`journeys()`, `start`, `answer`, `cancel`, events). The nine
  journeys of the design page as data, each step running the existing command, each ending with the equivalent command.
  Done when: a test runs every journey headless against a scratch `ACRYL_HOME` and the app it makes equals the app `acryl new` makes, file
  for file; cancelling a step leaves no process behind.
- [ ] T003 [terminal] The terminal face with `pi-tui` and `acryl-ui-tui`, opened by the command Q1 decides; arrows, Enter, Esc back, Ctrl-C
  cancel; works at 80 columns and in light and dark terminals.
  Done when: a pseudo-terminal test drives "create an app" with Enter only and gets a running app; the same on Windows Terminal and on
  Ubuntu.
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
