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
each surface can host today, (c) whether `dsh-community-market` runs under a
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

## Ledger

Each task appends its commit and human-readable explanation to
`docs/DEVELOPMENT-LOG.md` after the implementation commit. `spec.md`'s
`Status:` line moves to `ready-for-human` when T001-T007 are landed and only
the GUI confirmation is outstanding.
