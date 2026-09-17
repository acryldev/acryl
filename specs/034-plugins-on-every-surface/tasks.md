# Tasks: plugins on every surface

Ordered. Each task lands as its own commit with its evidence; a task that
cannot show its evidence is not done. `T001` gates `T002`+ by answering the
open research questions that change the design.

Order amended 2026-09-12 after the composition measurement in `research.md`:
`T005` runs before `T003`, because T003's commands invoke the shared lifecycle
capability T005 creates - the reverse order would ship a CLI command over
Desktop-private code and then rewrite it. `T002` is scoped to the measured
diff: tui gains the Host inventory row (`pluginInventory`), desktop and web
keep today's rows.

## T001 - Answer the composition and panel questions

**Files**: `research.md`
**Do**: determine (a) what `@deepseek-ai/dsh-host-plugin-inventory` enumerates
and whether a TUI can read it without a client UI, (b) which ACRYL plugin rows
each surface can host today, (c) whether `cordis-plugin-market` runs under a
non-Electron host.
**Evidence**: answers written into `research.md` with the console/activation
proof for each, or an explicit "unknown, prototype needed" before T004/T006.
**Done when**: Q1-Q3 have a status and the plan's per-surface table is either
confirmed or corrected.

## T002 - Make plugin composition declaration-driven

**Files**: `acryl-harness-runtime/src/coding-capabilities.ts`,
`acryl-harness-runtime/src/engine-dsh.ts`, `acryl-desktop/src/profile.ts`,
`acryl-harness-runtime/tests/*`
**Do**: express the plugin capabilities as entries in
`ACRYL_CODING_CAPABILITIES` with per-capability (and where needed per-row)
`surfaces`; replace `NON_TUI_SHARED_ROW_IDS` with that declaration;
`createAcrylCodingCapabilityPatches` returns the declared set for the requested
surfaces. No behavior change on `desktop` yet; `web` gains the shared rows it
declares.
**Evidence**: table-driven tests per surface asserting the exact composed row
ids; full `acryl-harness-runtime`, `acryl-cli`, `acryl-desktop` suites green.
**Done when**: adding a capability to one surface is a data change, not a new
branch.

## T003 - CLI plugin surface

**Files**: `acryl-cli/src/**`, `acryl-harness-runtime/src/**`
**Do**: add the plugin command surface (`list`, `enable`, `disable`, and the
read-only `doctor`), invoking the shared capability, with `--json` output
matching the other CLI commands. No client UI dependency.
**Evidence**: cold start with a throwaway `ACRYL_HOME`; `list` shows the
composed ACRYL plugin ids for the profile; `disable` drops the row on the next
boot; output pasted into the development log.
**Done when**: the CLI can see and change the same plugin set the Desktop
panel shows for the same profile.

**Landed 2026-09-12, commit `82f05cd`.** `acryl plugin list|enable|disable|
doctor` plus `--json` boots the profile the way the TUI does, mounts the shared
capability from T005, drives it, and disposes. `acryl-cli/src/host/plugin-command.ts`
owns the boot/drive/dispose and `cli/plugin-render.ts` only renders; the CLI holds
no lifecycle logic. Evidence as specified: a cold throwaway `ACRYL_HOME` whose
profile has one local bundle installed reports `on include:acryl-evidence-plugin`,
`disable` writes the override, and the next boot reports the row `off`; the full
transcript is in the development log, including the refusals (core row, unknown
row, `add`) and a check that nothing was written outside the throwaway home.
Suites: `acryl-cli` 17 files / 310 passed, `acryl-desktop` 95 files / 850 passed,
`acryl-control` 41 passed, `acryl-harness-runtime` unchanged at its four known
failures. Two decisions the task did not settle and this one did: the override
store moves from `resolveAcrylHome()` to the engine home
(`<dshHome>/plugin-lifecycle/state.json`), because `~/.acryl` ignores `$DSH_HOME`
and a dev or throwaway `DSH_HOME` would otherwise read and write overrides in the
operator's real install - the Desktop now passes its own `homeDir` and leaves
Electron's `userData`; and `add`/`remove` parse but are refused with a pointer to
T006 rather than surfacing as unknown actions.

## T004 - Web plugin panel parity

**Files**: `acryl-harness-runtime/src/engine-dsh.ts`,
`acryl-web/package.json`, `acryl-web/src/**`
**Do**: mount the plugin inventory rows (and the market provider, gated on
T001) in the web composition; ensure the Settings panel reports the real rows
for the attached profile.
**Evidence**: real `acryl-web` cold start, panel screenshot or client-side
assertion listing the same ids the CLI reports; `--json` `engine` field still
reports `dsh`.
**Done when**: the panel no longer reports `0 plugins` for a profile whose
CLI reports plugins.

**Partially landed 2026-09-12, commit `fa70e7e` (market provider half only).**
Q3's own measurement already showed `@deepseek-ai/dsh-host-plugin-inventory`
(`pluginInventory`) composed on web today - the plugin-inventory-rows half of
this task was already done before this spec existed. What was actually
missing was the market provider row, resolved by Q1 above and landed the same
way `acryl-desktop`'s own `DESKTOP_MARKET_IDENTITIES.community` row works:
`materializeProfilePackage` + a Loader insert in `resolveWebEngineComposition`,
unconditional rather than a user-toggleable setting (Web has no settings
surface for that yet, unlike Desktop's `desktop-market.ts`). Verified with a
real boot and a real HTTP request to `/api/community-market/state` (200, real
catalog sources, `desktopActions` correctly reporting absent) - not yet
verified against a rendered Settings > Plugins > Market tab in an actual
browser (no browser tooling available in that session). Full monorepo
typecheck and test suite green except the four pre-existing
`acryl-harness-runtime` failures this spec's earlier entries already record.
This was done independently of this spec's own numbering (a different session
without visibility into `specs/034` yet) - recorded here now so T004 reflects
its real state before anyone else picks it up.

## T005 - Shared plugin lifecycle capability

**Files**: `acryl-control/src/plugin/**`, `acryl-harness-runtime/src/**`,
`acryl-desktop/src/plugin-lifecycle-*.ts`
**Do**: move the plugin lifecycle contract and controller into `acryl-control`
following the existing domain pattern, and mount the matching Cordis service
from the runtime package. Desktop's controller becomes a caller; its route
stays a surface concern.
**Evidence**: desktop suite green with the shared controller in the path
(assert by test double: the desktop route drives the shared controller);
lifecycle state still round-trips `plugin-lifecycle/state.json`.
**Done when**: two surfaces exercise one lifecycle implementation.

**Landed 2026-09-12, commit `46cd479`.** `acryl-control/src/plugin/**` (was
`src/lifecycle/**`) holds the host-neutral mechanics behind an explicit
`PluginLifecycleHost` seam; `acryl-harness-runtime` holds the DSH-profile policy,
the shared `plugin-lifecycle/state.json` store, and
`createAcrylPluginLifecycle`/`mountAcrylPluginLifecycle`; the Desktop controller
is a caller (583 to 250 lines) that publishes `ctx.acrPluginLifecycle` inside its
Host plugin's existing `ctx.reflect` guard. Evidence as specified: `acryl-desktop`
95 files / 850 passed with the shared controller in the path, including the
registry-resolved-service round trip in `tests/plugin-lifecycle-controller.spec.ts`;
`acryl-control` 16/16 against a real Loader; desktop typecheck clean across all
five tsconfigs. Two design points the spec did not settle and this task did:
building the lifecycle authority and publishing it as a Cordis service are
separate acts (`Service` registers with `ctx.reflect` at construction, which a
bare route-test stub lacks), and `activate()` consults the host's bundle row
before its already-mounted shortcut so the host stays the single authority on
what may be activated. The Desktop reaches `acryl-control` through runtime
re-exports, so no dependency or lockfile edit was needed.

## T006 - Install/reconcile with an injected anchor

**Files**: `acryl-desktop/src/desktop-plugin-reconcile.ts` (or its moved
home), `acryl-cli/src/**`, `acryl-harness-runtime/src/**`
**Do**: generalize the install/reconcile path so the install anchor is an
input, resolving Electron from packaged resources and CLI/Web from their own
installation directory.
**Evidence**: a real install into a throwaway profile from the CLI, ending with
`dependencies` plus `dsh.profile.bundles` correct (`specs/031`'s
`assertInstalledBundle` conditions), then a boot that loads the plugin.
**Done when**: install works from at least one non-Electron surface.

**Landed 2026-09-12, commits `05a2d06`, `652506a`, `8833eca`** (Web, not CLI -
the CLI's own `acryl plugin` command still has no install verb). Chose reuse
over the planned generalization: rather than moving Desktop's
`desktop-plugin-reconcile.ts` (paired with 1,500+ lines of Electron-generation-
restart-cycle crash recovery in `pnpm.ts`/`install-recovery.ts` that Web has no
equivalent risk to protect against), Web's own `desktopProfiles`/`desktopPnpm`
(`acryl-harness-runtime/src/web-market-install.ts`) shell out to
`dsh plugin --profile web add/remove` directly - the exact command a human
operator already runs, confirmed to have no `--profile web` restriction the
way Desktop's packaged CLI blocks `--profile desktop`. `desktopPlugins`
(`web-market-plugins.ts`) is a thin market-shaped view over the same shared
`AcrPluginLifecycleController` (T005) the CLI and Desktop already drive - Web
had no shared plugin-lifecycle mount at all before this commit series.

Also added live activation (`livePluginActivation`), reusing
`AcrPluginLifecycleController.activate()`/`.deactivate()` - the same proven
host-side hot-mount mechanism `specs/032-universal-hot-reload`'s T1/T2/T4/T5
already ship - after real user testing on a real running profile showed an
install left the plugin inactive until a full server-process restart.
Fixed two real bugs along the way, both found only by driving the actual
Market UI end to end against real environments: `cordis-plugin-market`'s own
`CORDIS_RUNTIME_VERSION` constant was stale at `4.0.1` (rejecting a plugin
correctly pinning the actually-current `^4.0.2`), and
`resolvePackageJson`'s documented contract was backwards in both
`acryl-cli/src/host/plugin-command.ts` and this commit's own first draft -
the callback receives the full `<packageName>/package.json` specifier
already, not a bare package name to append it to.

Full monorepo typecheck/test green, including a real cross-package
TypeScript declaration-merging conflict with `acryl-desktop`'s own
`desktopProfiles`/`desktopPnpm`/`desktopPlugins` types found and fixed (no
`declare module` augmentation needed in the new file at all - `Service`'s
constructor takes a plain `name: string`).

**CLI landed 2026-09-13, commit `0092490`.** `cli-market-install.ts`/
`cli-market-plugins.ts` (`acryl-harness-runtime`) adapt Web's proven
`desktopProfiles`/`desktopPnpm`/`desktopPlugins`/`livePluginActivation` for
`composition.surface === 'tui'`, mounted in `engine-dsh.ts` with the same
ordering constraint as Web (`desktopPlugins` before `desktopProfiles`, since
`cordis-plugin-market`'s own `ctx.inject` reads the former). The one real
difference from Web: the CLI has more than one named profile (Web's is always
`'web'`), so the profile name comes from the booted composition's own
directory, not a literal. `MarketOverlay.ts` gives the TUI a `/market` command;
verified end to end with a real PTY session (`market-pty-smoke.mjs`):
navigate, install a real catalog plugin, live-activate with no restart, then
use the newly-installed plugin's own contributed command in the same running
process. All three surfaces (Web `8833eca`, Desktop's pre-existing
`desktop-plugin-reconcile.ts`, CLI `0092490`) now install and live-activate a
Market plugin without a process restart - the spec's original per-surface
install-verb gap is closed.

**Desktop's install path had a deeper bug than the missing `-w` flag.**
`71c7df7` (2026-09-13) added `-w` to every Market `pnpm add`, matching Web's
invocation, but repeated real-world retests still failed ("The desktop
package manager did not complete successfully"). `e321be1` (2026-09-13) found
the actual root cause: a profile's `pnpm-workspace.yaml` (from `initProfile`'s
fixed upstream template, which takes no override parameter) never allows any
dependency's install/postinstall script to run at all - `node-pty` (a real
dependency of at least one Market plugin) needs its native build to be usable,
pnpm silently skips it (`ERR_PNPM_IGNORED_BUILDS`), and the Market's own
post-install `assertInstalledBundle` check then rejects the bundle and rolls
the whole install back. `ensureProfileAllowsNativeBuilds()` repairs this the
same way `ensureDesktopProfile()` already repairs `dsh.profile.bundles` -
idempotently, on every boot, wired into both real profile-loading paths
(`ensureDesktopProfile` and `loadRecoveryFilteredProfile`). Verified with a
real test: a fresh profile already has the setting with no second boot
needed, and a profile stripped back to a bare `pnpm-workspace.yaml` is
repaired on the very next call. A real end-to-end GUI retest by the user is
still the open item (see Ledger).

**CLI/Web install-path robustness fixes, 2026-09-16, commits `1f7d888`,
`c29c52f`, `1ff7917`, `1356228`, `5283ad4`.** Four
real bugs, each found by driving a real install end to end rather than
assumed from reading the code:
1. `MarketOverlay`'s browse list and its actual install target both trusted
   `acryl.dev`'s own catalog `latestVersion` field, which is a separately
   re-indexed snapshot of npm, not a live pass-through - reproduced directly
   (a package published to npm within seconds still showed the prior version
   in the catalog minutes later). `resolveInstallVersion()` now queries
   `registry.npmjs.org` directly for `dist-tags.latest`, falling back to the
   catalog version on any failure; both the install target and the displayed
   label read through it (`c29c52f`, tests in `market-overlay.spec.ts`).
2. A failed install surfaced only `"pnpm add exited with code 1"` - useless
   for telling a store mismatch from a 404 from a network failure apart
   without reproducing the underlying `dsh plugin add` command by hand.
   `install()` now captures `handle.stderr` (ANSI-stripped, collapsed to one
   line, capped to 400 chars for the fixed-width popup) into the thrown
   error (`1ff7917`).
3. That capture then raced a real bug in `CliPnpmService`/
   `WebMarketPnpmService.runPlugin()`: both resolved `done` on the spawned
   child's `'exit'` event, which Node's own docs warn can fire before piped
   stdout/stderr have finished draining - a fast-failing `dsh` invocation
   showed a near-empty stderr capture as a result. Both now resolve on
   `'close'` instead (`1356228`).
4. With (2) and (3) fixed, a real install of `acryl-dsh-editor-plugin-cli`
   published minutes earlier by this same session failed with
   `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` - a supply-chain default recent
   pnpm versions ship enabling a ~24h minimum age before an install is
   allowed. Installing a just-published version of ACRYL's own tooling
   through the Market is the normal case here, not the untrusted-fresh-
   package scenario the policy guards against, so both `installPlugin()`
   paths now pass `--config.minimum-release-age=0` on the one `add`
   invocation only - the operator's own global pnpm config is left
   untouched (`5283ad4`).

Also surfaced, machine-local rather than a code bug: this development
machine had three separate `pnpm` installations (a corepack shim, a real
`npm install -g pnpm` whose own `bin/pnpm` symlink had been silently
overwritten by that shim, and a fully separate standalone install under a
different global prefix) resolving inconsistently across shells/terminals -
the proximate cause of bugs (3) and (4) actually reproducing for a real
user while every one of this session's own manual repros of the identical
command kept succeeding. Consolidated to the one real `npm`-global install;
`corepack pnpm` (this repo's own pinned-version workflow) is unaffected,
since it dispatches through the `corepack` binary directly rather than
through whatever plain `pnpm` resolves to on `PATH`.

## T007 - Retire the desktop-private duplication

**Files**: `acryl-desktop/src/desktop-plugins.ts` and friends
**Do**: delete what T005/T006 made dead. Each deletion is confirmed with the
user at that point (repo rule: no removing old implementations unilaterally)
and lands separately from the behavior change.
**Evidence**: desktop suite + `verify:loader` + `verify:profile` green; real
GUI launch for install/enable/disable.
**Done when**: no surface owns plugin lifecycle logic.

## T008 - Parity gate

**Files**: a shared test that boots each engine definition's composition for
one profile and compares plugin row id sets; the desktop/web/cli gates.
**Do**: assert FR-008 as a gate, so a new plugin row cannot be added to one
surface without declaring its surfaces.
**Evidence**: the gate fails when a row is added to exactly one surface.
**Done when**: CI/local gate enforces parity.

**Known gap found while gathering T003's evidence (2026-09-12).** The CLI
composes the `tui` surface, so booting a profile whose own bundles already
compose what that surface also inserts fails at boot with
`duplicate loader entry id: agent-presets` - reproduced with
`acryl plugin list --profile desktop`, and with the `tui` and `web` profiles in
the operator's real home. It is pre-existing (`ACRYL_CODING_CAPABILITIES`'
`agent-presets` insert is committed behavior, untouched by T003) and it is the
cross-surface half of FR-008: parity has to hold across compositions that are
allowed to overlap, not only across surfaces that happen to boot today.

## T009 - TUI presentation-slot extension point

**Files**: `acryl-cli/src/tui/**`, `acryl-harness-runtime/src/**`
**Do**: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md:31` already says "Dynamic
ACRYL plugins load into the runtime. They may contribute capabilities,
commands, events, and declared TUI, Electron, or Web presentation slots" -
today only Web has that seam (`dsh.client`, the Cordis Client slot registry
Web's own brand/editor plugins already use). The TUI has none: `SLASH_COMMANDS`
(`acryl-cli/src/tui/commands.ts`) and its dispatch `switch` are a hardcoded
array and case list, not something an installed plugin can add a row to, and
`/plugins` (`src/tui/plugins/PluginsOverlay.ts`) is a read-only viewer of the
composed Loader tree, not a slot host. Design a real Cordis-service-based
registration seam (a plugin's own `apply(ctx)` calls something like
`ctx.get('tuiCommands')?.register({command, description, open})`, disposed via
`ctx.effect()`) that `acryl-cli`'s TUI session (`src/tui-app/session.ts`,
which already holds `host.ctx` - the same Cordis Context the engine host
runs) reads to extend `SLASH_COMMANDS`/dispatch dynamically. Write the six-part
Cordis mini-design (capability boundary, provides/consumes, effects/disposal,
configuration/composition, events/durability, verification) before touching
`session.ts`, per this repo's own Cordis development protocol - this is a new
service and a new Loader-composition contract, not a wiring job like T003/T004.
**Evidence**: a real installed test plugin (mirroring
`acryl-dsh-editor-plugin-web`'s host/client split, but TUI-native - no
`dsh-client-connection`/`webServer` at all, since the TUI and the Loader tree
share one process) registers a command via the new service, a real TUI session
boot shows it in `/help`'s command list and dispatches it to a real overlay,
and removing/disabling the plugin makes the command disappear on the next
boot with no crash. Full `acryl-cli` suite green, no change to `SLASH_COMMANDS`
dispatch behavior for the built-in commands.
**Done when**: an installed CLI plugin can add a real slash command without
editing `acryl-cli`'s own source - the TUI-side counterpart to `dsh.client`.
Not blocking T005-T008; independent of the Web/Desktop parity chain.

**Mechanism landed 2026-09-12.** `acryl-cli/src/tui/tui-commands-service.ts`:
a `Service` (`ctx.get('tuiCommands')`) a plugin's own `apply(ctx)` calls
`register({command, description, open})` on, returning a disposer;
`open({tui})` is called lazily by `TuiApp`'s own `buildOverlayComponent` (a
new `'dynamic'` overlay kind carrying only the command name, resolved and
built at render time - not pre-built and stored, since only `TuiApp` holds
the live `tui` reference `open()` needs). Provided once via
`startDirectHost`'s own `prepare` hook, before any engine's Loader entries
mount, so a plugin in the initial composition can register during its own
`apply()`. `commands.ts` gained a module-level `dynamicSlashCommands` list
(`setDynamicSlashCommands`, called once per process from `session.ts` after
boot) merged into `matchSlashCommands`'s results, and `runSlashCommand`'s
switch falls through to `actions.runDynamicCommand?.(command)` for anything
not built-in - `matchSlashCommands` is what keeps a genuinely unknown command
from ever reaching that fallthrough in the real prompt flow. Evidence: a real
`startDirectHost` boot (`tests/direct.spec.ts`) provides `tuiCommands` and
accepts/removes a registration exactly like a profile plugin's own
`apply(ctx)` would; `tests/tui/tui-commands-service.spec.ts` covers
register/list/get/duplicate-rejection/idempotent-disposal directly;
`tests/tui/commands.spec.ts` covers the `matchSlashCommands`/
`runSlashCommand` merge and dispatch, including that a genuinely unknown
command still reaches nothing built-in. `acryl-cli` 18 files / 318 passed,
typecheck clean.

**Example plugin landed 2026-09-12** (`github.com/acryldev/acryl-dsh-editor-plugin-cli`,
commit `ccff778`): a real TUI-native `/files` command (browse from the home
directory, view a file read-only) using the seam above - no Host/Client
split, since the CLI and its Loader tree share one process; `apply(ctx)`
both registers the command and reads files directly. Verified end-to-end
with a real PTY session (`node-pty`, not a mock): a fresh throwaway
`ACRYL_HOME`, `dsh plugin add` from the local checkout, a real `acryl tui`
boot, `/files` opens showing real home-directory contents, Escape closes it,
clean exit code 0. Also fixed a real gap the first consumer surfaced:
`TuiCommandOpenContext` had no way for a plugin's own overlay to close
itself (`close(): void` added, commit `dd6c503`).

**Fuzzy filter added to `/plugins` 2026-09-15/16, commits `82d316c`, `2785545`.**
The read-only Loader-tree viewer T009 itself names above got real subsequence
fuzzy search (`fuzzyScore`/`filterPluginRows` in `PluginsOverlay.ts`) - a
real list this size (~90 rows on a populated profile) was reported directly
as unusable to scroll through by hand. Found and fixed a real regression
while adding it: arrow-key navigation (multi-byte escape sequences) was
silently swallowed by the single-character printable-input branch while a
filter was active, fixed by extracting a shared `handleNavigation()` used by
both the filtering and non-filtering `handleInput` branches. Regression test
in `tests/tui/plugins-overlay.spec.ts` covers navigation-while-filtering
directly, disambiguating prefix-colliding ids (`include:dsh-editor` vs
`include:dsh-editor-cli`).

**Per-command overlay presentation added 2026-09-16, commit `318e53e`.**
Every dynamic command registered through this task's own `tuiCommands`
service got identical full-screen presentation (`TuiApp.ts` unconditionally
wrapped every one in `FullScreenOverlay` + one shared `OVERLAY_OPTIONS`) -
fine for `/plugins`' own long list, wrong for a small file browser, and a
real gap against the reference implementation
(`github.com/almegal/pi-file-browser`) this task's own `/files` example
plugin was built to match, which renders as a compact, anchored popup with
chat history visible above it. `TuiCommandRegistration` gained an optional
`overlay` hint (`TuiCommandOverlayHint`: `width`/`anchor`/`margin`, a narrow
pass-through subset of `@earendil-works/pi-tui`'s own `OverlayOptions` -
that capability was already present in the library ACRYL's CLI is built on,
this was wiring, not a missing feature); `TuiApp.ts`'s `updateOverlay` calls
`tui.showOverlay()` directly when a hint is present, and keeps today's exact
`FullScreenOverlay` path, byte-for-byte, when absent - `/plugins` and
`/market` are unaffected by construction (neither registration sets the
field). `acryl-dsh-editor-plugin-cli` (separate repo) opted `/files` in with
`{width: '60%', anchor: 'center', margin: {top: 2, bottom: 2}}`, matching
the reference's own values, in its `0.4.0` release - verified live against a
throwaway profile (`tuiCommands.resolve('/files').overlay` returns exactly
that shape) and against the real terminal UI. `acryl-cli` 353→354 tests
(2 new registration-hint regression tests), typecheck clean.

## Ledger

Each task appends its commit and human-readable explanation to
`docs/DEVELOPMENT-LOG.md` after the implementation commit. `spec.md`'s
`Status:` line moves to `ready-for-human` when T001-T007 are landed and only
the GUI confirmation is outstanding.
