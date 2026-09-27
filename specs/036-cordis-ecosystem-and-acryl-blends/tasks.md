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

- [x] T011a Repository organization decided (`repositories.md`, accepted) and run modes decided (`framework.md`: attached and standalone, one process per app)
- [x] T011b `blends-core` moved into the monorepo (`runtime/blends-core`); the runtime and the extension pack read and lock the format through it
- [ ] T011 Archive `acryldev/blends` (waits on the owner: its local checkout has uncommitted work that would be stranded)
- [x] T012 One Blend shape: an app folder is its Blend (`/blend snapshot` records into it, `/blend apply` installs in place), an app installs its own
      extensions and locked marketplace plugins at start (a fresh clone works), `acryl new --from <app or Blend folder>` (registry ids come with T014)
- [x] T012b Registries are git repositories: registry index and `blends-registry-index` (CI), `acryl new --from` a git URL or a registry starter id
- [x] T012c App persistence: `acryl save`, `acryl remote connect`, `/app save`, `/app connect`; the secret check and the private-to-public guard; new apps are private and Proprietary
- [x] T012d Three levels (Blank, Blueprint, Project): starters extend a Blueprint and boot as they are; a Project keeps its starter in `blueprints/` and its license in `THIRD-PARTY.md`
- [ ] T019 Publish `@acryl/blends-core` and `@acryl/app-persistence` to npm (the owner's decision), then add the CI workflow to `acryl new` (validate `blend.yaml`, run the app's checks)
- [ ] T020 `acryl publish`: a Project becomes a Blueprint in a registry through a reviewed pull request (public only; refused for private apps)
- [ ] T013 `acryl new` and the app lifecycle commands in the published CLI (today the launcher needs a framework checkout)
- [x] T014a The public registry on acrylblends.github.io: `registry/` with Blank and the organizer starter, CI validation, `/registry/` served, the Blends page listing real entries (PR acrylblends/acrylblends.github.io#1, deploys on merge)
- [ ] T014 More starters by category; `acryl pull` for updating a project from its starter
- [ ] T015 The rest of the brand: the harness's first-launch notice, the terminal banner and palette, the Electron window and Dock icon
- [ ] T016 Replace the pre-framework `dsh-desktop.blend` setting with app folders
- [ ] T018 `acryl package`: a standalone product from an app folder, a Web server tarball and a branded Electron app (name, app id, icon from `blend.yaml`), bundling only the plugins the app names
- [ ] T017 Real-app Desktop test of two branded apps side by side (Web is verified; Desktop is verified headless only)
