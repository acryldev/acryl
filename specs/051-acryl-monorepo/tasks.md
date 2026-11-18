# Spec 051 tasks - one ACRYL monorepo

Branch `051-acryl-monorepo` (worktree `acryl.worktrees/051-acryl-monorepo`). Nothing merges to `main` before the 2026-11-20 workshop (D6).

## Phase 0 - say where code comes from

- [x] T001 [docs] Each Blend README (05-acryl-ade, 63-acryl-control-center, and the template's README in `framework/packages/create`) names
  where its shared code comes from: `plugins/library.lock.json` and `acrylblends upgrade` for the library plugins; Control Center's
  `launcher-lib/` is acryl's `plugins/acryl-launcher`, built.
  Done 2026-11-18: acrylblends/05-acryl-ade cbe6f51, acrylblends/63-acryl-control-center b12fea5, acrylblends/acrylblends 7711a4ce
  (`packages/create/README.md`; it reaches `framework/` with the next `git subtree pull`, T009).

## Phase 1 - inventory

- [x] T002 [inventory] Measure each `framework/ide/*` port's drift against its acryl source, the copies in Blend repositories and the two
  pnpm setups: [`inventory.md`](inventory.md).

## Phase 2 - one roof

- [x] T003 [import] `git subtree add --prefix=framework` of acrylblends/acrylblends `main` (1a976364, release 1.5.20) with its full history.
- [x] T004 [guard] `scripts/verify-layout.mjs` passes with `framework/` inside (it now accepts node:test's `after` as a teardown).
- [x] T005 [workspace] One pnpm workspace and one lockfile: one pnpm release, one node range, the framework's packages listed in the root
  `pnpm-workspace.yaml`, its `allowBuilds` and `minimumReleaseAgeExclude` merged; `pnpm install --frozen-lockfile` at the root works and
  `framework/pnpm-lock.yaml` and `framework/pnpm-workspace.yaml` are gone.
  Done 2026-11-18 (96a15157): one lockfile for 61 projects. ACRYL's packages now use the framework's own source (`workspace:^`) instead of
  npm acrylblends 1.0.0. The pnpm release is still 11.11.0 at the root; the move to 12 is its own commit.
- [x] T006 [checks] The framework's `check` (all 23 steps: lint, build, typecheck, tests, its verify scripts) runs inside the monorepo, next to
  acryl's build, verify and check:layout; both green (2026-11-19, 25 of 25 after the subtree pull). The framework keeps its own biome
  (ACRYL has none); its release tags are read as `acrylblends-v*` inside ACRYL (a38f42a4).
- [x] T007 [layout] Dependency direction guard, the Pi model (owner 2026-11-19): `scripts/dependency-direction.mjs`, run by
  `scripts/verify-layout.mjs`. No cycles between workspace packages, and three "never depends on" rules by package role (the framework
  foundation depends only on itself; ACRYL's runtime only on the foundation and itself; nothing depends on an app). 60 packages, 0 cycles,
  0 wrong-way dependencies. Done 80aeab6a.
- [ ] T009 [mirror] acrylblends/acrylblends stays live until the cut-over: changes made there are brought in with
  `git subtree pull --prefix=framework`, never copied by hand. First pull done 2026-11-19 (acrylblends 7711a4ce: release 1.5.21).

### Tonight's restructure, the Pi model (owner 2026-11-19)

Folders stay flat and the layers live only in the dependency graph, like earendil-works/pi. Each step is one commit, with ACRYL's build,
verify and check:layout and all 23 framework check steps green before it lands.

- [x] T016 [pnpm] Develop with pnpm 12.14.0 (root and framework); the pnpm the app ships to users stays 11.11.0. Done eb96faea.
- [ ] T017 [flat plugins] The framework's 13 packages (`acryl-door`, `acryl-router`, `acryl-db`, `acryl-kv`, `acryl-page`,
  `acryl-web-server`, ...) move into the one flat `plugins/` folder beside ACRYL's own: everything imports them from there. The 19 plain app
  plugins (`desktop`, `instance`, `save`, ...) stay in `framework/plugins/` for now: they are not packages, the CLI copies them into apps as
  source, and they develop against the framework's own dependencies (making them packages is Phase 3). The CLI reads its plugins from both
  folders; the published npm package still ships one `plugins/`. **In progress: built, full check run going (2026-11-19 02:20).**
- [ ] T018 [apps] The Blends frame (`framework/ide/*`) moves into `apps/`, where everything people run lives (no `products/` folder).
- [ ] T019 [docs] This spec and `docs/acryl/MONOREPO.md` rewritten in Pi's terms: one table of what each package owns and what it
  deliberately does not do; the layer picture (framework foundation, ACRYL runtime, plugins, apps) as documentation of the graph; phases 3-5
  updated (no `products/`, no updater bridge release: installed apps are reinstalled). Copied to main.
- [ ] T020 [boot] A real Desktop boot from this branch (isolated home), the last check before Phase 2 is called done.
- [ ] T021 [exception] `acryl-harness-runtime` composes every plugin a surface runs (the guard's one named exception); move that
  composition up into `apps/`.
- [ ] T022 [decision] Whether ACRYL's agent gets the door's new `reload` and `navigate` as tools (named, not registered today).

## Phase 3 - packages, not copies

- [ ] T010 [launcher] acryl's `plugins/acryl-launcher` is published as a package; Control Center depends on it and its
  `launcher-lib/` hand copy (8 files) is deleted.
- [ ] T011 [desktop, instance] The desktop shell and the instance become packages; `acrylblends upgrade desktop` moves an app from the copied
  folder to the package once; ADE and Control Center switch.

## Phase 4 - products

- [ ] T012 [updater first] The last release of Control Center and ADE from their current repositories points their in-app updater at the new
  home, and an installed copy is seen to update from there (Mac, Windows, Linux), before anything else in this phase.
- [ ] T013 [products] `products/control-center` and `products/ade` (blend.yaml, assets, release workflow); installers build from the
  monorepo; product tags `control-center-v*`, `ade-v*`.

## Phase 5 - registry and the old repository

- [ ] T014 [registry] The registry sites are generated by CI from tagged releases (with the official/community origin the registry syncs compute).
- [ ] T015 [cut-over] acrylblends/acrylblends: README and description point to `acryldev/acryl/tree/main/framework`; then a read-only mirror
  filled by `git subtree split`, or archived; open issues transferred; npm `repository` fields name `acryldev/acryl` with `directory`.
