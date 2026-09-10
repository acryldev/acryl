Status: needs-triage

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
- A market uninstall (`pnpm remove` + `dsh.profile.bundles` reconcile, spec
  031) does not remove the package from `disabledBundles`. The stale entry
  makes the market treat the package as "installed but disabled" and hide the
  managed Install button - the package cannot be reinstalled through the UI
  until `plugin-management/state.json` is hand-edited.

## Wanted

- One disable store, or a single projection both surfaces read and write.
  Prefer folding `disabledBundles` into the lifecycle state (entry-id keyed,
  patch-applied) so `pluginLifecyclePatches` is the only thing that disables a
  row at composition time.
- `MarketInstallService` uninstall (and `livePluginActivation.deactivate`)
  clears any disable record for the package.
- The market "Installed" tab enable/disable calls the same
  `PluginLifecycleController` path as the Lifecycle tab.
- A package not in `dsh.profile.bundles` has no disable record - reconcile
  drops orphans.

## Acceptance

- Disabling a plugin in either surface shows disabled in both.
- Uninstall then reinstall through the market UI works with no hand-editing.
- `verify:loader` + `pnpm --filter acryl-desktop run check` green.
