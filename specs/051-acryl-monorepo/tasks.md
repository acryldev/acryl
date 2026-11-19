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
- [x] T017 [flat plugins] The framework's 32 plugins moved from `framework/plugins/` into the flat root `plugins/` (branch 051-t017,
  2026-11-19): the 13 were packages already, the 19 app plugins (`agent`, `instance`, `desktop`, `sandbox`, ...) are now workspace
  packages (`acryl-agent`, `acryl-instance`, `acryl-desktop-shell`, ...; two names differ where the plain name was taken). They import
  each other by package name, build to `lib/` with tsdown, and the CLI keeps copying their source into an app's `plugins/` by rewriting
  those names to relative paths (`copyPlugin` handles both the `src/` packages and the app plugins that keep their files at the folder
  root). `pnpm-workspace.yaml` is `plugins/*`; `framework/plugins/` is gone.
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

- [x] T024 [guard] The cross-package relative imports are gone (051-t017): `acrylblends-framework` imports `acryl-router` (new `/core`,
  `/connection`, `/conninfo` subpaths), `acryl-node-server` (new `/adapter`, `/conninfo`, `/upgrade-hub`, `/register`, `/serve-static`,
  `/test-websocket`), `acryl-db/conformance` and `acryl-kv/conformance` by name, with the packages declared; acryl-app-context's tests
  import `acryl-home` and `acryl-manifest/app-plugins`. The desktop shells load the app's `src/app.ts` by a computed path instead of a
  relative import out of the package.
- [x] T025 [row id] Rename the Loader row `acryl-web` to `acryl-web-service` (its package name; the shared-slot exception no longer fits,
  and installed apps are reinstalled). Touches the frame overlay apps get (`ide-profile.ts`).
- [x] T026 [ci] Lint every root workflow with actionlint (today only the framework's). Its built-in runner list is older than GitHub's
  (`ubuntu-24.04-arm`, `macos-26`, `macos-15-intel`) and it does not know `vars`: configure those, then lint all.
- [x] T027 [graph] The framework's 19 plain app plugins are workspace packages, so the direction guard sees every edge (051-t017). The
  13 stay FOUNDATION; the 19 are the named `FRAMEWORK_PLUGINS` set with role `plugin` (they depend on the runtime's blends-core and
  plugin-hub). `verify-layout` fails when a `plugins/*/plugin.json` folder is not a workspace package or has no role, so the library
  cannot drift out of the graph again. One named foundation edge: `acrylblends-framework` builds `acrylblends/drivers` from the agent
  panel's `drivers.ts`.
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
- [x] T020 [boot] The real Desktop from the branch with an isolated home (scripts/live-run.mjs): it found what the full check could not -
  the window quit at once (dsh-client-ui-sidebar failed: "slot sidebar.settings is already declared"), caused by T008 merging the framework's
  acryl-app-shell. Fixed in 75f10079 (rootOwnsSettingsSeat); the Desktop then booted and stayed up, health clean, Settings opened.
- [ ] T031 [app-shell, review 3] rootOwnsSettingsSeat decides once, at apply, from the Loader's static entries. Matches main for ACRYL Desktop
  and leaves ADE as the framework built it, but (Fork3, 2026-11-19): enabling DSH's left sidebar at runtime while the root owns the seat
  fails its activation; disabling it while it does not leaves Settings unreachable until a reload (same as main); a sidebar disabled through
  its parent group is not seen; `loader` is reached through Cordis's reflect walk, not declared in an inject list. Fix: declare `loader` as
  an optional inject (default: owns the seat) and re-decide in an effect that follows that one entry, without reading "fiber not yet active"
  as "absent" (that brings the crash back: the sidebar usually activates after the root). Test the runtime toggle under a real Loader.
  Installed ADE gets 75f10079 only with the next publish of acryl-app-shell.
- [ ] T032 [self-extension after unification, owner note 2026-11-19] A Blend must still extend itself and know its own structure. Checked
  tonight: nothing acryl-app-context, acryl-plugin-context or acryl-system-prompt ships (lib/, docs/, example-plugins/, skills/) names a
  pre-move path; acryl-app-context reads the app's own blend.yaml, plugins/ and blend.lock.json and its own docs/ relative to where it is
  installed. Open: (a) repository fields of acryl-app-context, acryl-blends-frame and acryl-versions still name acrylblends/acrylblends
  ide/<name> (fixed with this task's commit); (b) these packages are still published from acrylblends, but since D6 their source lives only
  here (a subtree pull maps only framework/), so the next release needs a publish path from the monorepo; (c) that first release's
  acceptance: a fresh Blend from the new packages, its agent asked "add a plugin that shows a ledger page", cites paths that exist in the
  app, writes the plugin into the app's plugins/, and the plugin loads without a restart.
- [x] T033 [guard] FOUNDATION_PLUGIN_EDGES is gone (branch 051-t033, 2026-11-19). The Cordis-free drivers contract moved out of the
  agent panel into `plugins/drivers` (package `acryl-drivers`), a foundation package by role (FOUNDATION by name) that the copy path ships like any library
  plugin: `acrylblends/drivers` is built from its source, the framework declares it a workspace dependency, and the panel and the driver
  plugins import `acryl-drivers`. Decision (AcrylImplementer): a foundation package in `plugins/`, not framework source, because the
  agent template keeps no acrylblends dependency and its copied panel must resolve the contract without one.
- [x] T034 [products, overlays] Done: `acrylblends.root: workspace` in apps/acryl-ade/package.json; the generator keeps the workbench row and the IDE's own prompt identity (a full `upgrade --force` on a copy of ADE leaves cordis.patch.yml byte-identical). Was: The products' generated overlays (apps/acryl-ade, apps/acryl-control-center cordis.patch.yml) are in
  practice owned by the products: a full `acrylblends upgrade` replaces their workbench root row with the Blends frame (the generator's
  default, ide-profile.ts "never the IDE's workbench") and would silently turn ADE back into a plain Blend. Teach the generator a product's
  root row (from blend.yaml or product.json), with a test that regenerating an overlay keeps it. Found by Fork3 and DS_Fork3, 2026-11-19.
- [x] T035 [publish] Published 2026-11-19 with the owner's go (stored token): @acrylblends/control 0.2.11, system-prompt 0.2.0, web 0.2.0, each packed by verify-frame-publish (fresh app from the tarballs boots the frame) and installed from npm afterwards. Was: Three frame package versions exist only in this repository: @acrylblends/web 0.2.0,
  @acrylblends/system-prompt 0.2.0, @acrylblends/control 0.2.11. Apps made from main cannot install them until published (the gate takes
  them from local tarballs since ef386bca). The published create (1.5.21) is unaffected. Publish through framework-release.yml once the
  owner says go.
- [ ] T036 [npm scope, owner decision 2026-11-19, AFTER the workshop] One scope: `@acryldev/*` (the npm org `@acryl` belongs to an
  unrelated project since 2019, checked by the owner). Plain names, one name per package everywhere (folder `plugins/web`, package and
  import `@acryldev/web`): `@acryldev/web`, `system-prompt`, `control`, `settings`, `workspace`, `sign-in`, `app-shell`, `ui`, `versions`,
  ... and `@acryldev/blends-frame` the only `blends-` name. T011's packages go straight to `@acryldev/desktop-shell`, `instance`,
  `node-server`. What people type stays unscoped: `acryl`, `acrylblends`, `create-acrylblends`. First: the npm user `acryldev` is
  converted to an org (owner `musichen`, members incl. `webboxescom`) or gets its own publish token - a user scope accepts no other
  publisher. One release: publish `@acryldev/*` at the same versions, `acrylblends upgrade` rewrites an app's package.json and
  generated overlay, then deprecate `@acrylblends/*`. Open: row ids = short names (CLAUDE.md row-id rule change, owner decides).
- [ ] T037 [npm, deadline 2027-01] npm stops direct publishing with 2FA-bypass tokens in January 2027 (banner on npmjs.com, seen
  2026-11-19); every release here uses one. Set up npm trusted publishing for each package (GitHub Actions OIDC; today the release
  workflow's publish step 404s because nothing is configured on npm's side) and move publishing into the workflows.
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
