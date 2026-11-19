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
- [ ] T017 [flat plugins] Deferred to Phase 3 (T011). Tried 2026-11-19 and undone on purpose: the framework's 32 plugins import each other as siblings
  (`../acryl-router/...`), exactly as they sit in an app's `plugins/` folder once the CLI copies them in, so they must stay in one folder
  (`framework/plugins/`). Splitting them broke those imports (typecheck), and the 19 plain ones develop against the framework's own
  dependencies, which ACRYL's root does not install. They join the flat `plugins/` in Phase 3 (T011), when they become packages that import
  each other by name.
- [x] T018 [frame plugins] The Blends frame's three packages (`acryl-blends-frame`, `acryl-versions`, `acryl-app-context`) are Cordis
  plugins, not apps: they move from `framework/ide/` into the flat `plugins/` folder, and `framework/ide/` is gone. Their eight existing DSH
  imports are now counted by ACRYL's guard (ceiling 138 to 146, none new). Done b04eed6c (26 of 26 checks green).
- [x] T019 [docs] This spec and `docs/acryl/MONOREPO.md` rewritten in Pi's terms: one table of what each package owns and what it
  deliberately does not do; the layer picture (framework foundation, ACRYL runtime, plugins, apps) as documentation of the graph; phases 3-5
  updated (no `products/`, no updater bridge release: installed apps are reinstalled). Copied to main.
  Done 3c39b787 (docs/acryl/MONOREPO.md, CLAUDE.md layout, spec.md layout and phases, framework specs -> specs/blends, package descriptions).
- [x] T023 [review] Adversarial review (Fork3, 2026-11-19): 9 findings. Fixed 9b1e34ed (guard: pnpm's own package list, the harness
  runtime's 20 edges by name, framework packages must have a role), 79f460ad (the online channel refuses reload/navigate), 60750415
  (ratchets reach framework/, a real teardown, 7 leaking tests fixed), a298e8a3 (one check: root `check` runs the framework's; its CI at the
  root), c640bca4 (spike, duplicate spec tooling and dead `ide/` fallbacks removed), a9fddbb2, 3c39b787; the 114 `acrylblends-v*` release
  tags pushed to acryldev/acryl. The 3-way merge of the ports was verified clean, file by file.
- [ ] T020 [boot] A real Desktop boot from this branch (isolated home), the last check before Phase 2 is called done.
- [ ] T021 [exception] `acryl-harness-runtime` composes every plugin a surface runs (the guard's one named exception); move that
  composition up into `apps/`.
- [ ] T022 [decision] Whether ACRYL's agent gets the door's new `reload` and `navigate` as tools (named, not registered today).

- [ ] T024 [guard] Relative imports that cross packages are invisible to the direction guard (examples: the framework package's
  `../../../plugins/acryl-router/src`, acryl-app-context's tests into `framework/plugins`). Teach the guard to see them, or remove them when
  the framework's plugins become packages (Phase 3).
- [ ] T025 [row id] Rename the Loader row `acryl-web` to `acryl-web-service` (its package name; the shared-slot exception no longer fits,
  and installed apps are reinstalled). Touches the frame overlay apps get (`ide-profile.ts`).
- [ ] T026 [ci] Lint every root workflow with actionlint (today only the framework's). Its built-in runner list is older than GitHub's
  (`ubuntu-24.04-arm`, `macos-26`, `macos-15-intel`) and it does not know `vars`: configure those, then lint all.
- [ ] T027 [graph] The framework's 17 plain app plugins (agent, desktop, instance, sandbox, ...) are not workspace packages, so the
  direction guard never sees them. They enter the graph when they become packages (Phase 3, T011); until then the framework's own
  core-boundary check is what guards them.
- [x] T028 [review 2] Second adversarial pass (Fork3, 2026-11-19): the fixes hold, nothing weakened. Fixed: the legacy-layouts check no
  longer turns ACRYL's CI red on every new acrylblends release (inside the monorepo it records releases up to the version it holds);
  framework.yml triggers on every frame input; the docs say roles are named for the foundation and read from the folder for runtime and
  apps; the web-registration exemption matches the foundation's exact folders; the DSH ceiling scans framework/; stale CONSTITUTION, README,
  plan and test text; the teardown helper uses the plain fs names. Declined: one pnpm setup everywhere (Corepack), because Node 25 and later
  no longer ship Corepack and the framework's matrix runs Node 26; root CI (Node 24) keeps Corepack, framework.yml keeps pnpm/action-setup.
  Also found by the first full root `check` since 96a15157: verify-npm-web-entrypoint listed workspace packages from a fixed set of folders
  and missed acrylblends; it now reads pnpm's list.
- [ ] T029 [parked, owner decides] anti-slop (dmmulroy/anti-slop, Oxlint rules for TypeScript anti-patterns). Built in ca8d0003 (plugin at
  upstream d2a9aea3 in scripts/oxlint/anti-slop, oxlint 1.94.0, every rule at error, a per-rule ratchet in `pnpm run check`) and reverted in
  db99e81c: the owner (2026-11-19) parked it until things are stable after 051, "after we are stable we will see if we need it". Do not
  bring it back unasked. Measured on this branch: 45,630 findings; the blank-line autofix alone removes 30,546 of them in 1,841 source files.
  If it returns, ignore build output in .oxlintrc.json first (lib-publish/, build/, scaffold-template/): the first autofix touched four
  generated files.

## Phase 3 - packages, not copies

- [ ] T010 [launcher] acryl's `plugins/acryl-launcher` is published as a package; Control Center depends on it and its
  `launcher-lib/` hand copy (8 files) is deleted.
- [ ] T011 [desktop, instance] The desktop shell and the instance become packages; `acrylblends upgrade desktop` moves an app from the copied
  folder to the package once; ADE and Control Center switch.

## Phase 4 - products

- [ ] T012 [updater] Each product's in-app updater looks for its own product's latest release by tag (`control-center-v*`, `ade-v*`),
  since one repository releases several products. No bridge release: installed copies are reinstalled (owner, 2026-11-19).
- [ ] T013 [products] Control Center and ADE build their installers from `apps/` (blend.yaml, assets, release workflow) with product tags
  `control-center-v*`, `ade-v*`.

## Phase 5 - registry and the old repository

- [ ] T014 [registry] The registry sites are generated by CI from tagged releases (with the official/community origin the registry syncs compute).
- [ ] T015 [cut-over] acrylblends/acrylblends: README and description point to `acryldev/acryl/tree/main/framework`; then a read-only mirror
  filled by `git subtree split`, or archived; open issues transferred; npm `repository` fields name `acryldev/acryl` with `directory`.
