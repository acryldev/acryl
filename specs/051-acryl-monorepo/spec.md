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
desktop shell, the npm releases, and `ide/`, ports of acryl packages), every Blend repository (copied `plugins/desktop`, `plugins/instance`,
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
- **D4 Names users see do not change.** npm keeps `acrylblends`, `create-acrylblends`, `@acrylblends/*` and their version line (1.5.x), so
  existing apps, `npm create acrylblends` and installed products notice nothing. The `repository` fields point at `acryldev/acryl` with a
  `directory`.
- **D5 What stays separate.** acrylblends.github.io (GitHub Pages serves an organisation's site only from that repository name; its registry
  is generated, never hand-edited) and each Blend repository (apps people fork and share; they depend on published packages instead of
  carrying copied folders).
- **D6 Timing.** Nothing moves on `main` before the workshop (2026-11-20). This branch is where the direction is shown and tried.

## Layout (target)

```
apps/          surfaces: acryl-cli (the `acryl` command), acryl-desktop, acryl-web, acryl-launcher-tui
runtime/       the stable core: acryl-control, acryl-harness-runtime, loopback-http, and (Phase 3) desktop shell and instance
plugins/       Cordis plugins: launcher, workspace, settings, sign-in, plugin hub, market, ...
framework/     acrylblends, imported with history: packages/cli, packages/create, frame/, ide/, plugins/, scripts/
products/      (Phase 4) Control Center and ADE: blend.yaml, assets, release workflow; installers are built from here
registry/      (Phase 5) the generator that writes the registry sites from tagged releases
deepseek-harness/   pinned upstream submodule (unchanged)
```

Dependency direction, enforced by `scripts/verify-layout.mjs` once the framework joins the workspace:

```
apps/*       -> runtime/*, plugins/*, framework/*
products/*   -> apps/*, plugins/*, runtime/*, framework/*
plugins/*    -> runtime/*
framework/*  -> runtime/*
runtime/*    -> nothing above it
Blend repositories -> published npm packages only, never source copies
```

## Phases

- **Phase 0 - freeze and say where code comes from** (now): each Blend README names where its shared code comes from.
- **Phase 1 - inventory**: which acryl packages the framework's `ide/` ports, how far each has drifted, which copies exist in Blend
  repositories, whether the two pnpm setups merge. First pass measured: [`inventory.md`](inventory.md).
- **Phase 2 - one roof**: the framework in `framework/` with history (done on the branch), then one pnpm workspace and one lockfile, the
  framework's checks run from the root, and each `ide/` port merged with its acryl original so one copy remains.
- **Phase 3 - packages, not copies**: the desktop shell, the instance and the launcher become packages (`@acrylblends/desktop`,
  `@acrylblends/instance`, `@acrylblends/launcher`, names to confirm); ADE and Control Center depend on them and their copied folders go.
- **Phase 4 - products**: Control Center and ADE release from `products/`. Highest risk: an installed app looks for updates in its current
  repository, so the last release from the old repositories must already point its updater at the new home, or installed apps never update
  again.
- **Phase 5 - generated registry and the old repository**: the registry sites are generated by CI from releases; acrylblends/acrylblends
  becomes a mirror filled by `git subtree split`, or is archived with a README pointing here.

## Done when

- `git clone github.com/acryldev/acryl && pnpm install && pnpm test` builds and tests the core, the framework and the products.
- A fix to the desktop shell is one commit and one publish; ADE and Control Center get it by a version bump or their in-app update.
- No file in any Blend repository is a hand copy of monorepo code.
- `npm create acrylblends`, `npx acryl` and installed products' in-app updates work unchanged for users.
