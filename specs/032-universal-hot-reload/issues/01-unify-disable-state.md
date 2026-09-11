Status: done

## Progress

- **Done.** The market's Installed tab enable/disable now routes through
  `PluginLifecycleController` (via the existing `ctx.livePluginActivation`
  bridge, extended with `setEnabled(packageName, enabled)` and
  `statusOf(packageName)`) whenever the package has a live Loader entry -
  live, no restart, and the Lifecycle tab and Installed tab agree on the same
  truth. `DesktopPluginsService.list()` also now overrides its file-based
  status with the live entry's actual state when one exists, so a
  Lifecycle-tab toggle is immediately visible in the Installed tab too.
  `disableDesktopProfileBundle`/`enableDesktopProfileBundle` (the
  bundle-layer file) remain the fallback for exactly the case they uniquely
  serve: a package with no live entry (import failure, or not yet mounted).
  Tested: `tests/plugin-lifecycle-controller.spec.ts` ("toggles a mounted
  plugin by package name..."), `tests/desktop-plugins.spec.ts` (live-status
  override, live disable/enable round-trip, fallback when no live entry).

- **Done (`354eb9a`).** `PluginLifecycleController.deactivate` now prunes the
  stale `disabledBundles` entry via the new
  `desktop-plugins.ts` `removeDesktopDisabledBundle`, wired through an
  optional `pluginManagementStatePath` on the lifecycle bootstrap. Uninstall
  then reinstall through the market UI no longer needs hand-editing. Tested:
  `tests/desktop-plugins.spec.ts` (`removeDesktopDisabledBundle`),
  `tests/plugin-lifecycle-controller.spec.ts` (deactivate prunes it live).
- **Reassessed, not "one store".** The two stores are not simply duplicative:
  `plugin-management`'s `disabledBundles` removes an ENTIRE bundle layer
  (all its patches) at composition time - the only mechanism that works when
  a bundle's module itself fails to import, which is what boot recovery's
  "skip a mutable plugin bundle" needs. `plugin-lifecycle`'s per-entry disable
  needs a working Fiber to `entry.update()` - it can't help when a bundle
  won't even import. Collapsing them into one store would lose that recovery
  path. The `## Wanted` section below is updated to reflect this; the
  remaining item is surface-level (UI/UX) inconsistency, not a data-model
  merge.

# Unify the two plugin-disable systems + clean uninstall

## Problem

Two independent disable stores for the same `desktop` profile:

1. `<userData>/plugin-lifecycle/state.json` - written by the Lifecycle tab
   (`plugin-lifecycle-controller.ts` / `plugin-lifecycle-state.ts`, spec 032
   T1). A list of disabled Loader entry ids; applied at boot as
   `{ id, disabled: true }` overlay patches. Mutability is derived from
   `dsh.profile.bundles` and this store; it does not read #2.
2. `<userData>/plugin-management/state.json` `disabledBundles` - written by the
   market Installed tab and the recovery "skip a mutable plugin bundle"
   control (`desktop-plugins.ts` `DesktopPluginsService`,
   `disableDesktopProfileBundle`). Keyed by package name.

Consequences observed:

- Disabling a plugin from the Lifecycle tab vs the market Installed tab writes
  different files; the two surfaces then show different enabled/disabled state
  for the same plugin.
- ~~A market uninstall ... does not remove the package from `disabledBundles`~~
  **Fixed in `354eb9a`.**

## Acceptance

- Uninstall then reinstall through the market UI works with no hand-editing -
  **done**.
- Disabling a healthy, mounted plugin in either surface shows disabled in
  both - **done**.
- `verify:loader` + `pnpm --filter acryl-desktop run check` green.
