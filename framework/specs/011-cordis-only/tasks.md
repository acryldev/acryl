# 011 tasks

A task closes when its evidence is on `main`.

- [x] T110 Constitution 3.0.0: Cordis is the framework; templates depend on `cordis` only.
- [x] T111 `app` and `agent` templates on Cordis and `node:http`. Evidence: 4 and 8 template tests from a fresh install.
- [x] T112 CLI reduced to `init`, `help`, `version`, split into templates, project, init, io and cli. Evidence: 12 tests.
- [x] T113 Removed the runtime packages, plugins, examples and their scripts; workspace, typecheck, lint and test
  configs reduced to match.
- [x] T114 `verify-scaffolder.mjs` for the two templates, including the cordis-only dependency check. Evidence: `OK`.
- [x] T115 Docs replaced by three pages; the docs test runs the six Cordis examples against `cordis@4.0.0-rc.10`.
- [x] T116 Specs 000 to 010 and the original brief archived; new roadmap and research R1.
- [x] T117 `pnpm run check` green.
- [ ] T118 Website (separate repository) still describes the removed runtime; update it in its own change.
