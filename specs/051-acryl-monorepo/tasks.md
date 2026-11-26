# Spec 051 tasks - one ACRYL monorepo

Branch `051-acryl-monorepo` (worktree `acryl.worktrees/051-acryl-monorepo`). Nothing merges to `main` before the 2026-11-20 workshop (D6).

## Phase 0 - say where code comes from

- [x] T001 [docs] Each Blend README (05-acryl-ade, 63-acryl-control-center, and the template's README in `framework/packages/create`) names
  where its shared code comes from: `plugins/library.lock.json` and `acrylblends upgrade` for the library plugins; Control Center's
  `launcher-lib/` is acryl's `plugins/launcher`, built.
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
  (ACRYL has none); its release tags are read as `blends-v*` inside ACRYL (a38f42a4).
- [x] T007 [layout] Dependency direction guard, the Pi model (owner 2026-11-19): `scripts/dependency-direction.mjs`, run by
  `scripts/verify-layout.mjs`. No cycles between workspace packages, and three "never depends on" rules by package role (the framework
  foundation depends only on itself; ACRYL's runtime only on the foundation and itself; nothing depends on an app). 60 packages, 0 cycles,
  0 wrong-way dependencies. Done 80aeab6a.
- [x] T009 [mirror] acrylblends/acrylblends stays live until the cut-over: changes made there are brought in with
  `git subtree pull --prefix=framework`, never copied by hand. First pull done 2026-11-19 (acrylblends 7711a4ce: release 1.5.21).
  Ended 2026-11-20: acrylblends/acrylblends is a pointer to this repository and archived (owner go 06:29, T015).

### Tonight's restructure, the Pi model (owner 2026-11-19)

Folders stay flat and the layers live only in the dependency graph, like earendil-works/pi. Each step is one commit, with ACRYL's build,
verify and check:layout and all 23 framework check steps green before it lands.

- [x] T016 [pnpm] Develop with pnpm 12.14.0 (root and framework); the pnpm the app ships to users stays 11.11.0. Done eb96faea.
- [x] T017 [flat plugins] The framework's 32 plugins moved from `framework/plugins/` into the flat root `plugins/` (branch 051-t017,
  2026-11-19): the 13 were packages already, the 19 app plugins (`agent`, `instance`, `desktop`, `sandbox`, ...) are now workspace
  packages (`@acryldev/agent`, `@acryldev/instance`, `@acryldev/desktop-shell`, ...; two names differ where the plain name was taken). They import
  each other by package name, build to `lib/` with tsdown, and the CLI keeps copying their source into an app's `plugins/` by rewriting
  those names to relative paths (`copyPlugin` handles both the `src/` packages and the app plugins that keep their files at the folder
  root). `pnpm-workspace.yaml` is `plugins/*`; `framework/plugins/` is gone.
- [x] T018 [frame plugins] The Blends frame's three packages (`@acryldev/blends-frame`, `@acryldev/versions`, `@acryldev/app-context`) are Cordis
  plugins, not apps: they move from `framework/ide/` into the flat `plugins/` folder, and `framework/ide/` is gone. Their eight existing DSH
  imports are now counted by ACRYL's guard (ceiling 138 to 146, none new). Done b04eed6c (26 of 26 checks green).
- [x] T019 [docs] This spec and `docs/acryl/MONOREPO.md` rewritten in Pi's terms: one table of what each package owns and what it
  deliberately does not do; the layer picture (framework foundation, ACRYL runtime, plugins, apps) as documentation of the graph; phases 3-5
  updated (no `products/`, no updater bridge release: installed apps are reinstalled). Copied to main.
  Done 3c39b787 (docs/acryl/MONOREPO.md, CLAUDE.md layout, spec.md layout and phases, framework specs -> specs/blends, package descriptions).
- [x] T023 [review] Adversarial review (Fork3, 2026-11-19): 9 findings. Fixed 9b1e34ed (guard: pnpm's own package list, the harness
  runtime's 20 edges by name, framework packages must have a role), 79f460ad (the online channel refuses reload/navigate), 60750415
  (ratchets reach framework/, a real teardown, 7 leaking tests fixed), a298e8a3 (one check: root `check` runs the framework's; its CI at the
  root), c640bca4 (spike, duplicate spec tooling and dead `ide/` fallbacks removed), a9fddbb2, 3c39b787; the 114 `blends-v*` release
  tags pushed to acryldev/acryl. The 3-way merge of the ports was verified clean, file by file.
- [x] T020 [boot] A real Desktop boot from main 47edaaed (scripts/live-run.mjs desktop, isolated home, 2026-11-19): the home screen renders, page health has one startup long task, stop reported "port free, real homes untouched".
- [x] T021 [exception] The composition moved up (branch 051-t021, 2026-11-19). `plugins/coding-capabilities` (package
  `@acryldev/coding-capabilities`) owns the surface composition: the capability rows, the packages each surface must make resolvable, the shell-mode
  split and the advanced-shell rows. The runtime keeps the Blueprint vocabulary (capability ids, surfaces/shellMode types, id + needsRouter) and
  takes a `CodingCapabilities` input in its engine definitions and legacy boots; Web, CLI and Desktop pass their own composition. The runtime's 20
  plugin dependencies are gone and `RUNTIME_COMPOSITION_EDGES` is deleted, so the rule is "the runtime depends only on the foundation and itself";
  the runtime names plugins in `devDependencies` only (its integration tests boot the real composition), which the guard allows by field and fails
  in `dependencies`/`peerDependencies`. The two capability tables are asserted equal id by id in the runtime's tests, so neither can drift.
- [ ] T022 [agents drive the app] Decided by the owner 2026-11-19: yes, and it is the baseline, not a choice - "we should have
  functionality as it was before unification". The ACRYL chat AND every PTY driver agent (Claude Code, Pi, Codex, ...) fully control the
  running app as a user does, like @acryldev/control: look, click, type, fill, select, press, scroll, wait, reload, navigate. Done when each
  agent kind is proven on a real app: the chat through its `door_*` tools, a PTY agent through `.acryl/bin/acryl`, in dev and installed ADE.
  Proven 2026-11-20 on macOS and Linux (z370n). The app was link-shortener from create-acrylblends 1.7.4 in @acryldev/blends-frame 0.2.2, run
  with `npm run dev` under a scratch HOME. The proof: create a short link through the app's own form, then see it top of Recent links with
  Active links one higher.
  - Pi (right-panel PTY tab, DeepSeek): proven on both OSes from one plain prompt: `acryl look`, `act type` x2, `act click`, back to
    Overview, look again. The only extra step is Pi's own one-time "Trust project folder?".
  - Claude Code: proven on both OSes with the user's own login (run in the app folder, allowed tools limited to `.acryl/bin/acryl`).
    The panel tab starts it fine, but the frame gives PTY agents the app's HOME. In a HOME without a Claude login it stops at "Select
    login method", which a real user's HOME does not.
  - Codex: needs the user's own login (same HOME reason); not run.
  - ACRYL chat: drives the app (look, click), but it chose Bash with `.acryl/bin/acryl`, not its `door_*` tools.
  - "Page: not open" is the door reporting that no app page is connected (none open, or reloading); not a door bug.
  2026-11-21/22 (Fork6): the door itself answers in the installed products, packed from their repositories: Control Center v0.2.9, ADE v0.2.6, SDE
  v0.1.5 on macOS, Windows and Linux (`acryl window list`, `brief`; `frame close/open left` in a real page for Control Center and the store apps).
  Open: an agent (the chat through its `door_*` tools, a PTY agent) driving the installed ADE.
  2026-11-23: the chat of the installed ADE (release DMG v0.2.11, macOS arm64, scratch HOME, DeepSeek) read the page with `door_look`
  and clicked with `door_act`, no shell. It found a real bug: after Collapse sidebar the rail was empty and the sidebar could not be
  opened again (fixed 88c0383d, @acryldev/workspace 0.2.5 + blends-frame 0.2.17, ADE v0.2.12). On v0.2.12 the chat collapsed the
  sidebar, clicked Expand sidebar and saw the Projects list back. Pi 1.5.2 (DeepSeek, `pi -p` in the installed app's folder, bash only)
  did the same round trip through `.acryl/bin/acryl look` and `act click --ref`. Still open: Pi from the panel's PTY tab of the
  installed ADE (run here in print mode beside it); Windows and Linux.

- [x] T024 [guard] The cross-package relative imports are gone (051-t017): `@acryldev/framework` imports `@acryldev/router` (new `/core`,
  `/connection`, `/conninfo` subpaths), `@acryldev/node-server` (new `/adapter`, `/conninfo`, `/upgrade-hub`, `/register`, `/serve-static`,
  `/test-websocket`), `@acryldev/db/conformance` and `@acryldev/kv/conformance` by name, with the packages declared; @acryldev/app-context's tests
  import `@acryldev/home` and `@acryldev/manifest/app-plugins`. The desktop shells load the app's `src/app.ts` by a computed path instead of a
  relative import out of the package.
- [x] T025 [row id] Rename the Loader row `acryl-web` to `@acryldev/web` (its package name; the shared-slot exception no longer fits,
  and installed apps are reinstalled). Touches the frame overlay apps get (`ide-profile.ts`).
- [x] T026 [ci] Lint every root workflow with actionlint (today only the framework's). Its built-in runner list is older than GitHub's
  (`ubuntu-24.04-arm`, `macos-26`, `macos-15-intel`) and it does not know `vars`: configure those, then lint all.
- [x] T027 [graph] The framework's 19 plain app plugins are workspace packages, so the direction guard sees every edge (051-t017). The
  13 stay FOUNDATION; the 19 are the named `FRAMEWORK_PLUGINS` set with role `plugin` (they depend on the runtime's blends-core and
  plugin-hub). `verify-layout` fails when a `plugins/*/plugin.json` folder is not a workspace package or has no role, so the library
  cannot drift out of the graph again. One named foundation edge: `@acryldev/framework` builds `acrylblends/drivers` from the agent
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
  @acryldev/app-shell. Fixed in 75f10079 (rootOwnsSettingsSeat); the Desktop then booted and stayed up, health clean, Settings opened.
- [x] T031 [app-shell, review 3] rootOwnsSettingsSeat decides once, at apply, from the Loader's static entries. Matches main for ACRYL Desktop
  and leaves ADE as the framework built it, but (Fork3, 2026-11-19): enabling DSH's left sidebar at runtime while the root owns the seat
  fails its activation; disabling it while it does not leaves Settings unreachable until a reload (same as main); a sidebar disabled through
  its parent group is not seen; `loader` is reached through Cordis's reflect walk, not declared in an inject list. Fix: declare `loader` as
  an optional inject (default: owns the seat) and re-decide in an effect that follows that one entry, without reading "fiber not yet active"
  as "absent" (that brings the crash back: the sidebar usually activates after the root). Test the runtime toggle under a real Loader.
  Installed ADE gets 75f10079 only with the next publish of @acryldev/app-shell.
- [x] T032 [self-extension after unification, owner note 2026-11-19] A Blend must still extend itself and know its own structure. Checked
  tonight: nothing @acryldev/app-context, @acryldev/plugin-context or @acryldev/system-prompt ships (lib/, docs/, example-plugins/, skills/) names a
  pre-move path; @acryldev/app-context reads the app's own blend.yaml, plugins/ and blend.lock.json and its own docs/ relative to where it is
  installed. Open: (a) repository fields of @acryldev/app-context, @acryldev/blends-frame and @acryldev/versions still name acrylblends/acrylblends
  ide/<name> (fixed with this task's commit); (b) these packages are still published from acrylblends, but since D6 their source lives only
  here (a subtree pull maps only framework/), so the next release needs a publish path from the monorepo; (c) that first release's
  acceptance: a fresh Blend from the new packages, its agent asked "add a plugin that shows a ledger page", cites paths that exist in the
  app, writes the plugin into the app's plugins/, and the plugin loads without a restart.
  (c) passed 2026-11-19 (AcrylImplementer): `npm create @acryldev/blends@1.6.0 ledger-app -- --template blank` (desktop frame, scratch HOME),
  `npm run dev`, DeepSeek key in the environment only; the frame's chat, asked "add a plugin that shows a ledger page", finished in 1m 57s.
  Cited, all present in the app: node_modules/@acryldev/app-context/docs/start-here/this-app.md, .../start-here/verify-before-done.md,
  .../extending/routes-and-pages.md, .../extending/feature-plugin.md, .../extending/state.md, .../extending/home-widget.md,
  .../example-plugins/README.md, src/routes.ts, src/about.tsx. Wrote plugins/ledger/index.ts (216 lines), a ledger row in blend.yaml and
  test/ledger.test.ts; the Ledger widget appeared on the running home page and /app/ledger answered 200 with no restart; npm test 10/10;
  it checked its own work through the door (8 look, 6 click, 2 type). One Edit step failed ("cannot modify ...") and the agent recovered.
  The app still depends on @acryldev/app-persistence, blends-core and plugin-hub (T038).
  (b) done 2026-11-19: 1.6.0 and the 18 @acryldev packages were published from this monorepo (framework/, plugins/, runtime/).
- [x] T033 [guard] FOUNDATION_PLUGIN_EDGES is gone (branch 051-t033, 2026-11-19). The Cordis-free drivers contract moved out of the
  agent panel into `plugins/drivers` (package `@acryldev/drivers`), a foundation package by role (FOUNDATION by name) that the copy path ships like any library
  plugin: `acrylblends/drivers` is built from its source, the framework declares it a workspace dependency, and the panel and the driver
  plugins import `@acryldev/drivers`. Decision (AcrylImplementer): a foundation package in `plugins/`, not framework source, because the
  agent template keeps no acrylblends dependency and its copied panel must resolve the contract without one.
- [x] T034 [products, overlays] Done: `acrylblends.root: workspace` in apps/acryl-ade/package.json; the generator keeps the workbench row and the IDE's own prompt identity (a full `upgrade --force` on a copy of ADE leaves cordis.patch.yml byte-identical). Was: The products' generated overlays (apps/acryl-ade, apps/acryl-control-center cordis.patch.yml) are in
  practice owned by the products: a full `acrylblends upgrade` replaces their workbench root row with the Blends frame (the generator's
  default, ide-profile.ts "never the IDE's workbench") and would silently turn ADE back into a plain Blend. Teach the generator a product's
  root row (from blend.yaml or product.json), with a test that regenerating an overlay keeps it. Found by Fork3 and DS_Fork3, 2026-11-19.
- [x] T035 [publish] Published 2026-11-19 with the owner's go (stored token): @acryldev/control 0.2.11, system-prompt 0.2.0, web 0.2.0, each packed by verify-frame-publish (fresh app from the tarballs boots the frame) and installed from npm afterwards. Was: Three frame package versions exist only in this repository: @acryldev/web 0.2.0,
  @acryldev/system-prompt 0.2.0, @acryldev/control 0.2.11. Apps made from main cannot install them until published (the gate takes
  them from local tarballs since ef386bca). The published create (1.5.21) is unaffected. Publish through framework-release.yml once the
  owner says go.
- [x] T036 [npm scope, owner decision 2026-11-19, AFTER the workshop] One scope: `@acryldev/*` (the npm org `@acryl` belongs to an
  unrelated project since 2019, checked by the owner). Plain names, one name per package everywhere (folder `plugins/web`, package and
  import `@acryldev/web`): `@acryldev/web`, `system-prompt`, `control`, `settings`, `workspace`, `sign-in`, `app-shell`, `ui`, `versions`,
  ... and `@acryldev/blends-frame` the only `blends-` name. T011's packages go straight to `@acryldev/desktop-shell`, `instance`,
  `node-server`. What people type stays unscoped: `acryl`, `acrylblends`, `create-acrylblends`. First: the npm user `acryldev` is
  converted to an org (owner `musichen`, members incl. `webboxescom`) or gets its own publish token - a user scope accepts no other
  publisher. One release: publish `@acryldev/*` at the same versions, `acrylblends upgrade` rewrites an app's package.json and
  generated overlay, then deprecate `@acryldev/*`. Open: row ids = short names (CLAUDE.md row-id rule change, owner decides).
  Done (verified 2026-11-22): the frame and the library publish as `@acryldev/*` (c1c09fac, 64ae202f; 1.6.0 e80ae541; now @acryldev/blends 1.7.x on
  npm), new apps and the registry starters depend on them, `acrylblends upgrade` rewrites an app's package.json. Not done: deprecating the old
  `@webboxes/*` names on npm (no deprecation notice is set), and the row-id rule note (owner decides).
- [x] T038 [names, owner decision 2026-11-19 "one name everywhere tonight"] Every workspace package's name, folder and import become
  `@acryldev/<short>` (Pi-style); design and name map in t038-design.md. Owner: DS2_Fork3, after T036, T031 and T021 land.
  Done (audited 2026-11-22, 79 workspace packages): every package is `@acryldev/<short>` and its folder is the short name (58d4e8c9 the moves,
  f0f3c53a the identifiers that are not specifiers, 2494721f, d3fdf8b6, e22b277d the follow-ups). The only other names are the documented ones: `acryl`,
  `acrylblends`, `create-acrylblends` (what people type) and the private example `acryl-organizer`; the folders `framework/packages/cli` and `create`
  are `@acryldev/blends` and `@acryldev/create-blends`. Open: the CLAUDE.md row-id rule note for scoped packages (with T036's row-id decision).
  Owner 2026-11-26: the short names are not kept. `acrylblends` and `create-acrylblends` are deprecated on npm (pointing to the scoped names) and no
  longer released; framework/packages/cli-alias and create-alias are removed (2d226de6's parent). The one unscoped name we publish is `acryl`.
- [ ] T037 [npm, deadline 2027-01] npm stops direct publishing with 2FA-bypass tokens in January 2027 (banner on npmjs.com, seen
  2026-11-19); every release here uses one. Set up npm trusted publishing for each package (GitHub Actions OIDC; today the release
  workflow's publish step 404s because nothing is configured on npm's side) and move publishing into the workflows.
  Found 2026-11-19: npm 11.17 sets this up from the command line (`npm trust github <pkg> --file <workflow>.yml --repo acryldev/acryl
  --allow-publish -y`), but the stored bypass-2FA token gets 403 on it (npm counts it an account change). So the owner runs it once per
  package after `npm login` with 2FA; an agent prepares the per-package lines and the workflows' `id-token: write` publish jobs.
  Done 2026-11-19 for all 18 `@acryldev/*` packages (owner as acryldevadmin with a security key; verified with `npm trust list`: github,
  framework-release.yml, acryldev/acryl, publish). Open: `acrylblends`, `create-acrylblends`, `acryl` (unscoped; need a maintainer
  login with 2FA), and switching the workflows' publish steps to rely on it.
## Phase 3 - packages, not copies

- [x] T010 [launcher] acryl's `plugins/launcher` is published as a package; Control Center depends on it and its
  `launcher-lib/` hand copy (8 files) is deleted. Done 2026-11-19: renamed to `@acryldev/launcher` (64ae202f, owner chose the
  @acryldev scope; also fixed the root filter that matched no package, so its 24 tests now run), published 0.1.0 by webboxescom with the
  owner's go, installed and imported from npm (29 exports); Control Center depends on it (a4c20622), proven by an npm install of the app,
  its typecheck and tests, and its host's launcher routes answering 200.
- [x] T011 [desktop, instance] The desktop shell and the instance become packages; ADE and Control Center switch. The one-time
  `upgrade --desktop-packages` move is dropped (day 0, owner 2026-11-19: installed apps are remade, never migrated).
  Done on branch 051-t011-packages (43a9475d, 9cfebac5): `init` and `add` write `@acryldev/instance` and `@acryldev/desktop-shell` as dependencies at
  their exact workspace versions (library.ts PACKAGED) instead of copying them; the shell's `acryl-desktop` bin is `npm run desktop`; templates,
  generated rows, `open` and the docs use the package; ADE and Control Center dropped their identical copies. Proved on a real app made by the CLI
  and installed from local tarballs (check passes; the desktop window opens from node_modules). Open: publish both packages in the release
  (the release script's closure has them as roots), then prove the ADE and Control Center packs; and the T038 Cordis-name fix, without which
  a made app fails its own tests.
  Done 2026-11-20: both published (@acryldev/desktop-shell 0.1.3, @acryldev/instance 0.1.2 with Fork6's README/types fixes; 0.1.1/0.1.2 of the
  shell were the start-path fix 05183d31 and the prepack fix daa3abef), Control Center and ADE pin them and build from npm (product-release runs
  44685244987 / 44685248538 from bcd27361); a fresh `npm create @acryldev/blends@1.7.3` app on macOS and Ubuntu installs them, passes its own
  tests (7/7) and serves. The T038 Cordis-name issue no longer shows: the made app's tests pass.

## Phase 4 - products

- [x] T012 [updater] Each product's in-app updater looks for its own product's latest release by tag (`control-center-v*`, `ade-v*`),
  since one repository releases several products. No bridge release: installed copies are reinstalled (owner, 2026-11-19).
  Done ff45d3d8: `releases.tagPrefix` in product.json (bundle.ts readProduct), plugins/desktop-shell/updater.ts takes the newest non-draft,
  non-prerelease release whose tag starts with it (the version is the tag after the prefix); no prefix keeps releases/latest. updater.test.ts.
- [x] T013 [products] Control Center and ADE build their installers from `apps/` (blend.yaml, assets, release workflow) with product tags
  `control-center-v*`, `ade-v*`.
  Done: .github/workflows/product-release.yml (ff45d3d8; a tag publishes with `--latest=false`, a manual run only uploads artifacts); packer
  fixes 83240111/97d3e144 (--from folder) and 3713c1af/31d59abc (Windows npm and tar). ADE built 6/6 (macOS arm64/x64, Windows x64/arm64,
  Linux x64/arm64) in runs 44484087307 and 44500345827 (main 3696d3b3). Mac install of that DMG: starts, serves in 2 s, quits clean, bundle
  unchanged. It found the host restart loop (an access-time change from `git diff` restarted node --watch; fixed by plugins/desktop-shell/watch-host.mjs,
  branch 051-walk-acryl-home). Before the first product tag: the same install check on Windows (mbpi9win) and Ubuntu (z370n).

- [x] T041 [products, no installs] A participant installs nothing but Control Center. Done on main 15dfac4d: on a computer without Node.js
  22.19+ (with npm) or gh, Control Center fetches them once from nodejs.org and github.com/cli/cli, checks each against its published SHA-256
  list, unpacks them into `~/.acryl/tools` and puts them first on every app's PATH (`plugins/launcher/tools.js`, @acryldev/launcher 0.1.2); git
  comes with the product (dugite). Proven on macOS (Node 24.22.3, npm 11.19, gh 2.105 in 8 s). Open: the Windows (.zip through System32 tar)
  and Linux walks.
  Proven 2026-11-20 with the release installers control-center-v0.2.0/v0.2.1 on macOS arm64, Windows x64 (mbpi9win) and Linux x64
  (z370n), scratch home, no Node on PATH: Node and gh fetched into ~/.acryl/tools, Make an app from a Blueprint runs.
- [x] T042 [share, owner 2026-11-20] Publish Blend apps and Cordis plugins to the person's own GitHub from the GUI. Done: Connect GitHub in
  Control Center (GitHub device sign-in with ACRYL's own OAuth app, token handed to apps as GH_TOKEN; 75642b47), Private/Public on Share,
  Settings > Share in every app (frame 0.2.1, CLI 1.7.3; bcd27361) beside the existing Settings > Plugins share; proven by a fresh 1.7.3 app
  sharing itself privately to inboxxobni/s2 through the route. Open: the GUI walk with a person approving the device code.
  Proven 2026-11-20 on macOS, Windows and Linux up to GitHub's device-code screen (the approval is the person's step), from Control
  Center (Share) and from inside the app (Settings > Share; frame 0.2.2 fixed its label layout); a real private share to inboxxobni/s2
  passed earlier. Deploy to WebBoxes.ai is T045.
- [x] T043 [registries, owner 2026-11-20] "community" vs "official": both registries carry `origin` (acrylblends.github.io a34c1c2,
  cordisplugins.github.io already); Control Center's store shows Official/Community (380252ce) and lists the community Blends the registry found
  on GitHub, made from their own release with a "not reviewed" note (9258c4ae); the store filters All/Official/Community (0aa399bc). Released in
  control-center-v0.2.1.

- [x] T044 [frame, regression found 2026-11-20] Apps made from a registry Blueprint came out without the Blends frame in 1.7.0-1.7.3 (no chat,
  no Settings > Share; 1.6.0 framed them): the frame step needed an installed desktop-shell (create runs it before npm install) and the host
  rows named plugins/node-server etc. while archives carry plugins/acryl-*. Fixed 1cdfbc88 (Fork3), released @acryldev/blends 1.7.4; proven:
  `create --from acrylblends.link-shortener` serves the frame, /app and the share route, and so does Make an app in the released Control
  Center v0.2.0 on macOS. Archives agent/chat/notes-desktop rebuilt from the current templates (acrylblends.github.io 29f40c5).
- [x] T045 [deploy] Control Center's "Deploy to WebBoxes.ai" opens webboxes.ai's New WebBox form with the shared app's GitHub repository
  filled in (f8648075; webboxesai d333da3 prefill), enabled once the app has a github.com origin. Released in control-center-v0.2.1.

- [x] T046 [archives] Every registry Blueprint (acrylblends.github.io registry/blends, runtime acrylblends) regenerated with
  @acryldev/blends 1.7.4 so an app made from it passes its own `npm test` / `npm run check`: today the archive's test pins the manifest
  rows without plugin-share (which create adds) and its old plugins/instance copy clashes with @acryldev/instance (TS2717). Owner: Fork6,
  per-archive proof (install, test, check, the frame serves).
  Done 2026-11-21 (Fork6): the 55 registry Blueprints regenerated from the @acryldev/blends 1.7.11 and then 1.7.21 templates (acrylblends.github.io
  70732f4, b245621), the three products rebuilt from their repositories' release tags (c3aa9ae, f975652). Proof: each made with `npm create
  @acryldev/blends`, install, `npm test`, `npm run check`, dev serves the frame, the door answers (z370n: 55/55 on 1.7.11, 58/58 on 1.7.21).
- [x] T047 [walk findings 2026-11-20] Fixed and released: the blank page after an agent's edit on Windows reloads itself (frame 0.2.2 +
  0.2.3, 4ca0db75, 1fd916e8); the Connect a model dialog fits small windows (sign-in 0.2.1, 1a3892b8); a just-made app's card says
  starting while npm install runs (launcher-desktop 0.1.5, 14157dc6, control-center-v0.2.2). Open: ADE shows the sign-in dialog and the
  workspace's model card at once (two plugins; after the workshop); Enter once left a chat message unsent (Send worked; not reproduced).

- [x] T048 [release homes, owner decision 2026-11-20] Control Center and ADE are Blends whose source is apps/ here and whose installers are
  published to their own release repositories, Latest there, so download links never change:
  https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-<platform> and
  .../05-acryl-ade/.../ACRYL-ADE-<platform> (scripts/publish-product-release.sh after each product release). Registry entries, WorkshopPanel
  and docs point there. control-center-v0.2.3 walked on macOS from the fixed link 2026-11-20 15:58 (store 58 Official + 2 Community with
  category and by @owner, Make an app framed, save/share scripts).
- [x] T049 [store placement] A shared Blend or plugin lands in its Blends-store category: package.json keywords acrylblends-blend /
  cordis-plugin, acrylblends-category-<slug>, acrylblends-subcategory-<slug>; /categories.json is the one list; `npm run share --
  --visibility public --list` and Settings > Share's store row (prefilled from the Blueprint); plugins take the app's place. Proven on real
  GitHub (inboxxobni) in both stores (35680113, 4136e9d1, 61a0911e, fae06251, 1965046b; @acryldev/blends 1.7.8-1.7.9).
- [x] T050 [WebBoxes] Deploy proven end to end with @acryldev/blends 1.7.9 (2026-11-20, Fork2): prefilled form, Running in 51 s, Publish,
  <name>.webboxes.ai serves the app, chat answers. Open: PTY agent tabs inside a box; sign-up mail delivery not yet seen in an inbox.

## Phase 5 - registry and the old repository

- [x] T014 [registry] The registry sites are generated by CI from tagged releases (with the official/community origin the registry syncs compute).
  Done acrylblends/acrylblends.github.io a5c5a5e (owner go 2026-11-19): deploy.yml runs scripts/sync-products.ts each deploy and hourly;
  per product it asks git/matching-refs for its tag prefix (no tag cap), takes the highest tag, copies apps/<product>/ from the monorepo tarball
  into registry/blends/<id>/ under the README's file rules, sets metadata.version, rewrites index.json and re-runs registry-index --check.
  No tag yet: both entries stay byte-identical (first live deploy 2026-11-19 logged that for both). The download path first runs at the first tag.
- [x] T015 [cut-over] acrylblends/acrylblends: README and description point to `acryldev/acryl/tree/main/framework`; then a read-only mirror
  filled by `git subtree split`, or archived; open issues transferred; npm `repository` fields name `acryldev/acryl` with `directory`.
  Done 2026-11-20. Main was already fully in framework/ (acrylblends f5ad1a69, subtree pull 47edaaed). Repository pointer commit
  acrylblends ffefcbc (README, LICENSE kept, one-line description), then archived (isArchived=true). Open issues: none. The two open PRs
  (#4 Ctrl-C lets the host finish stopping, #5 data lives in ~/.acryl/apps/<id>/, both by smrifat1411) were already in framework/ as
  51f09720 and e20c6a58 with that author, so nothing was applied; the PRs are left open and uncommented. Monorepo 54a7ebdf: the last
  package.json naming the old repository (@acryldev/absent) now names acryldev/acryl with `directory`, the macOS Git source offer and the cli
  and framework READMEs' issues line point at acryldev/acryl (the other framework packages already did). Not changed: documentation links
  in the framework README prose still point at the archived repo's docs/ tree, which stays readable. The 13 side branches with commits
  not on main stay on the archived repo (readable; unarchive to use): 020-blueprints, 106-ide-slice6-boot, 106-ide-slice6-upgrade,
  125-frame-redesign, 125-port-inventory, 125-slice1, 125-slice2, 129-merge-proof, blueprints/batch-01-tasks, blueprints/batch-02-tasks,
  workshop-guide-connect, workshop-preflight, workshop-readiness-windows.
- [ ] T039 [gates, Windows] `framework/scripts/verify-packed.mjs` cannot run on Windows: it starts `npm` (and `pnpm`) through `execFileSync`
  without a shell, and on Windows those are `.cmd` files Node only starts through one (`spawnSync npm ENOENT`, seen on mbpi9win 2026-11-19 from
  main ca369d52 with pnpm 12.14.0). CI does not see it because `verify:packed` runs only inside framework's `check` (Linux, macOS); the Windows
  job runs `verify:create`, which already passes `shell: true` for `.cmd` tools. Fix the same way as verify-create-npm.mjs (`shell: isWindows`),
  then run it on mbpi9win. Not a 1.6.0 blocker.
  Fixed 2026-11-19 (AcrylImplementer): verify-packed's runner starts npm and pnpm through `npmSpawn` / the new `pnpmSpawn` in
  framework/scripts/lib/platform.mjs (Windows: through the shell, pnpm named bare so PATHEXT finds pnpm.cmd or pnpm.exe); unit-tested in
  platform.test.mjs on macOS. NOT yet proven on Windows: mbpi9win is off the network tonight; open until `pnpm run verify:packed` passes there.
  2026-11-22: not run. mbpi9win is up, but `verify:packed` needs the whole framework installed and built on Windows first (pnpm install of the
  workspace with the isolated linker, the full build), a long run with its own symlink and path-length risks; left open on purpose.

- [x] T040 [release, after the 2026-11-20 workshop] framework/scripts/release-local.sh waits for npm visibility once, after the last publish and
  before the tags and proofs, not after every package. Found 2026-11-20 by the coordinator during the 1.7.0 publish: the per-package `visible`
  wait (up to 6 min each, about 2.5 min in practice) made 28 packages take over an hour, and `npm publish` does not need its dependencies
  visible. The coordinator's scratch copy `release-fast.sh` did this for 1.7.0; make it the script's default and keep the final wait for every
  published name@version before the proof from npm.
  Done 2026-11-22 (Fork6): release-local.sh records each published name@version while it publishes and waits for all of them once, after the last
  publish and before the tags and the proofs (`PUBLISHED`, framework/scripts/release-local.sh); `bash -n` clean, name/version split checked for scoped names.
  Not run through a real publish.