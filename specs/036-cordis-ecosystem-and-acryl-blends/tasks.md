# 036 milestone: ACRYL Blends, the framework (builder included)

Ledger of what the milestone delivers. Product definition: `framework.md`. Design notes: `blank-canvas-blend.md`, `blend-instance-design.md`.
Self-containment design: `docs/acryl/APP-INSTANCES-AND-BULKHEADS.md`. Repository organization: `repositories.md` (proposed). Human walkthrough: `HUMAN-TEST.md`.

## Done (branch `036-cordis-ecosystem-and-acryl-blends`)

- [x] T001 Blueprints as data: `acryl.blank` (the stem cell) and `acryl.ide` (the IDE as a Blend grown from blank); one composition function for Web, CLI, Desktop
- [x] T002 `acryl-brand`: the app's name, mark, colors, font, title, favicon and the assistant's identity from configuration
- [x] T003 First use case: the organizer grown from blank, used, captured with `/blend snapshot` and re-created with `/blend apply` (test and real model run)
- [x] T004 Blueprints from a file; `blend.yaml` is a Blends manifest the runtime boots from (one format)
- [x] T005 `acryl new <dir>`: an app the Rails way (blend.yaml, extensions/, AGENTS.md, bin/acryl, its own git repository), the user's product and license
- [x] T006 The builder inside an app builds into the app's `extensions/`; its docs cover Blueprints, branding and capture
- [x] T007 Apps that carry their own Web runtime (`acryl new --runtime`) and start with nothing of the framework but Node
- [x] T008 Self-containment, incident-driven: per-app homes, stable ports with scan, per-app Electron user data and Dock name, run claims, `ps`/`stop`/`rm`
- [x] T009 Bulkheads refactor: the `AppInstance` family (Abstract Factory, deep module) chosen once per composition root, the `appInstance` service, Pessimistic
      Offline Lock for runs and profiles, Registry of running apps, and a test that forbids ambient home lookups
- [x] T010 Git worktree dev runs never touch the main checkout's home, port or Electron app

## Next

- [ ] T011 Decide the repository organization (`repositories.md`), then follow its migration steps
- [ ] T012 One Blend shape: `/blend snapshot` writes into the app folder; `acryl new --from <file|registry id>`
- [ ] T013 `acryl new` and the app lifecycle commands in the published CLI (today the launcher needs a framework checkout)
- [ ] T014 Registry and catalog on acrylblends.github.io: validated `index.json`, `acryl pull`/`acryl push`, starters by category
- [ ] T015 The rest of the brand: the harness's first-launch notice, the terminal banner and palette, the Electron window and Dock icon
- [ ] T016 Replace the pre-framework `dsh-desktop.blend` setting with app folders
- [ ] T017 Real-app Desktop test of two branded apps side by side (Web is verified; Desktop is verified headless only)
