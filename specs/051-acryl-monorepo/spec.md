# Spec 051 - One ACRYL monorepo: every service under one roof

Status (2026-11-18): started on branch `051-acryl-monorepo`. The framework (acrylblends/acrylblends) is imported into `framework/` with its full
history, and acryl's layout check passes with it inside. Nothing is wired into the acryl workspace yet, and nothing has moved on `main`.
Tasks: [`tasks.md`](tasks.md). Measured facts: [`inventory.md`](inventory.md). Where everything lives, for a newcomer:
[`docs/acryl/MONOREPO.md`](../../docs/acryl/MONOREPO.md).

## The owner's words (2026-11-18)

"also for Unification craete a branch and worktree with beginning of direction of suggested unification of services into organized readable
code that everybody can understand and see the value of acryl as one monorepo unified all of the services into one roof, exactly as we
discussed in this document that I'm providing. ... also write down in specs to appropriate place"

The document is `docs-acryl-project-RnD-ideas-discussions-questions/UNIFICATION_of_ACRYL_platform/unify_acryl_platform.md` (outside this
repository). This spec is its decisions, checked against the real repositories.

## Why

One product's code lives in copies across five places: acryldev/acryl (the IDE, the launcher), acrylblends/acrylblends (the framework, the
desktop shell, the npm releases, and `ide/`, ports of acryl packages), every Blend repository (copied `plugins/desktop-shell`, `plugins/instance`,
and for Control Center the launcher, rewritten with `sed`), acrylblends.github.io (another copy of each Blend) and npm. One fix ("each
product opens only its own apps", 2026-11-18) meant editing the framework, publishing it, copying files into ADE and Control Center,
committing and tagging each, and sometimes the registry too. Miss one copy and they disagree without a sound: that is how Windows Control
Center 0.1.15 shipped without the updater, and how the registry once held a hand copy marked "EDITED HERE".

Book rules that decide this (CLAUDE.md, the five books): *The Pragmatic Programmer*, DRY - one fact, one place; a copy is a second source of
truth. *Clean Architecture*, the dependency rule - surfaces and products depend on the stable core, never the reverse, and a monorepo lets
`scripts/verify-layout.mjs` enforce it across what are today two repositories. *DDD Distilled* - the bounded contexts (core, framework,
products, registry) become folders with one owner each, not repositories that each hold part of every context.

## Decisions

- **D1 One home: acryldev/acryl.** The monorepo is acryldev/acryl, not acrylblends: it is what people find and install (the stars are
  here), and the core already lives here. acrylblends/acrylblends becomes a read-only mirror or is archived (Phase 5).
- **D2 A real monorepo, not a submodule.** A submodule leaves a plain `git clone` empty, makes every fix two commits in two places, and checks
  out a pinned commit instead of a branch. It stays right for `deepseek-harness`, code we do not own; it is wrong for code changed daily.
- **D3 Import with history.** `git subtree add --prefix=framework` keeps every acrylblends commit reachable (`git log` on the import's
  second parent). Done on this branch (T003).
- **D4 Names users see do not change.** npm keeps `acrylblends`, `create-acrylblends`, `@acryldev/*` and their version line (1.5.x), so
  existing apps, `npm create acrylblends` and installed products notice nothing. The `repository` fields point at `acryldev/acryl` with a
  `directory`.
- **D5 What stays separate.** acrylblends.github.io (GitHub Pages serves an organisation's site only from that repository name; its registry
  is generated, never hand-edited) and each Blend repository (apps people fork and share; they depend on published packages instead of
  carrying copied folders).
- **D6 Timing.** ~~Nothing moves on `main` before the workshop (2026-11-20).~~ Changed by the owner on 2026-11-19 (about 03:00 CET):
  the branch merges to `main` the same night, once the full root `check` (clean home) and a real Desktop boot pass, and the owner tests
  the merged `main` before the workshop. From the merge on, frame work (`plugins/blends-frame/`) happens only in acryldev/acryl;
  acrylblends gets no new frame commits (a subtree pull maps only into `framework/`).

## Layout: the Pi model (owner, 2026-11-19)

The owner chose [Pi's](https://github.com/earendil-works/pi) model over the folder-per-layer target this section first held: **flat
folders, and the layers live only in the dependency graph** that the package.json files declare. Priorities, in the owner's words: "it
works" and "code human engineers can understand and reason" about; installed apps do not matter (they are rebuilt and reinstalled).

```
framework/   acrylblends: packages/cli, packages/create, frame/ (its library plugins live flat in plugins/, below), docs, scripts
runtime/     ACRYL's runtime: @acryldev/control, @acryldev/harness-runtime, loopback-http, diagnostics, web-service, persistence, plugin hub
plugins/     every Cordis plugin that is a package: ACRYL's, the Blends frame's (@acryldev/blends-frame, @acryldev/versions, @acryldev/app-context) and the framework library's app plugins
apps/        what people run: acryl-cli, acryl-desktop, acryl-web, acryl-launcher-tui (and, Phase 4, Control Center and ADE)
deepseek-harness/   pinned upstream submodule (unchanged)
```

The layers, as documentation of the graph (accepted 2026-11-18): framework foundation (acrylblends and its packages) <- ACRYL runtime <-
plugins <- apps. `scripts/dependency-direction.mjs`, run by `scripts/verify-layout.mjs`, fails on any cycle and on any dependency that
points the wrong way; the one named exception is `@acryldev/harness-runtime`, the composition root, allowed exactly its 20 plugins (T021 moves
that composition up). Blend repositories depend on published npm packages only, never source copies. The map for people:
[`docs/acryl/MONOREPO.md`](../../docs/acryl/MONOREPO.md).

## Phases

- **Phase 0 - freeze and say where code comes from** (now): each Blend README names where its shared code comes from.
- **Phase 1 - inventory**: which acryl packages the framework's `ide/` ports, how far each has drifted, which copies exist in Blend
  repositories, whether the two pnpm setups merge. First pass measured: [`inventory.md`](inventory.md).
- **Phase 2 - one roof**: the framework in `framework/` with history (done on the branch), then one pnpm workspace and one lockfile, the
  framework's checks run from the root, and each `ide/` port merged with its acryl original so one copy remains.
- **Phase 3 - packages, not copies**: the framework's app plugins (desktop shell, instance, ...) and the launcher become packages that
  import each other by name; they then join the flat `plugins/` (T017), and ADE and Control Center depend on them instead of copied folders.
- **Phase 4 - products**: Control Center and ADE build their installers from `apps/` with product tags (`control-center-v*`, `ade-v*`). Each
  product's in-app updater looks for its own product's latest release by tag, since one repository now releases several products. No bridge
  release for installed copies: they are reinstalled (owner, 2026-11-19).
- **Phase 5 - generated registry and the old repository**: the registry sites are generated by CI from releases; the framework's release
  workflow moves to the root (tags `acrylblends-v*`, already on acryldev/acryl); acrylblends/acrylblends becomes a read-only mirror or is
  archived with a README pointing here.

## Done when

- `git clone github.com/acryldev/acryl && pnpm install && pnpm run check` builds and checks the framework, the runtime, the plugins and
  the apps, and CI runs the same command.
- A fix to the desktop shell is one commit and one publish; ADE and Control Center get it by a version bump or their in-app update.
- No file in any Blend repository is a hand copy of monorepo code.
- `npm create acrylblends` and `npx acryl` work unchanged for users; installed products are reinstalled once, and their in-app updates
  work from the new home after that.
