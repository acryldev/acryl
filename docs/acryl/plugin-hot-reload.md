# Plugin hot-reload

ACRYL Desktop enables, disables, reloads, installs, and uninstalls plugins in
the running application - no process restart. This is the equivalent of Pi's
`/reload` for the Cordis plugin tree.

## What is hot, and where

| Action | Host (Node process) | Renderer (web UI) |
| --- | --- | --- |
| Toggle a loaded plugin (Lifecycle tab) | `entry.update({ disabled })` unmounts / remounts the fiber | reload |
| Reload a loaded plugin (Lifecycle tab) | `entry.fiber.restart()` - dispose effects, re-run `apply` | reload |
| Install from the plugin market | `ctx.livePluginActivation.activate(pkg)` mounts the new row | reload |
| Uninstall from the plugin market | `ctx.livePluginActivation.deactivate(pkg)` unmounts the fiber | reload |
| Local checkout changes (`ACRYL_PLUGIN_WATCH`) | `fiber.restart()` on a debounced file event | reload |

"reload" means the web content reloads inside the same Electron window (about a
second, no window flash, the Host process and its session state untouched) -
not an application relaunch.

## What can be toggled

The Lifecycle tab (Settings -> Plugins -> Lifecycle) offers a working toggle
for:

- the Development Canvas and the two brand-slot packages (the legacy seed), and
- **every package in the active profile's `dsh.profile.bundles`** minus the
  base template (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`).

A plugin market install writes the package into `dsh.profile.bundles`, so it is
lifecycle-managed automatically. Core runtime capabilities (settings,
connection, the renderer, session controllers, the base template) show a
disabled toggle with a reason - they are not user-toggleable.

Mutability is derived at runtime from the profile bundle list, not a
hard-coded allowlist. `acryl-desktop/src/plugin-lifecycle-state.ts`
(`readUserMutableBundleNames`) and
`acryl-desktop/src/plugin-lifecycle-controller.ts` (`isMutable`).

## Dependency cascade

Disabling a plugin that other **mutable** plugins hard-`inject` a service from
disables those dependents in the same transaction (dependents first, so a
consumer unmounts before its provider). The confirm dialog lists them
("Disabling this also disables: ..."). Dependents are computed transitively
from the live Cordis service graph (`ctx.root.reflect.store` + `fiber.inject` +
`fiber.store`).

A plugin that a **protected** core capability depends on is not mutable in the
first place, so this never reaches the user.

## Persistence

- Enable / disable is persisted per profile in
  `<userData>/plugin-lifecycle/state.json` as a list of disabled Loader entry
  ids, applied at the next boot as `{ id, disabled: true }` overlay patches
  (matched by id, so a row whose id and package name differ still disables).
- Install / uninstall is persisted in `dsh.profile.bundles` by the market's
  `pnpm add` / `pnpm remove` + reconciliation
  (`acryl-desktop/src/desktop-plugin-reconcile.ts`). The live mount uses the
  bundle's real `cordis.patch.yml` row id, so the reboot patch and the live
  entry are the same.
- Reload is not persisted.

## Local development loop

```sh
# link a checkout into the desktop profile
dsh plugin --profile desktop add file:/abs/path/to/my-plugin   # (from the app terminal)

# tell the desktop Host to watch it
ACRYL_PLUGIN_WATCH='my-plugin=/abs/path/to/my-plugin' corepack pnpm run dev
```

Edit the plugin, save, and its fiber restarts on a debounced file event. A
build that produces a broken module surfaces as a FAILED fiber in the
Lifecycle tab, not a Host crash. `ACRYL_PLUGIN_WATCH` accepts a comma-separated
list of `<package>=<absolute dir>` pairs and is off by default.

## The `livePluginActivation` capability

`acryl-desktop` publishes `ctx.livePluginActivation` (`activate` /
`deactivate`, keyed by package name) for the plugin market - a separate plugin
- to call after it writes `dsh.profile.bundles`. It is optional: a deployment
without it (or a live mount that throws) falls back to the restart prompt. See
`LivePluginActivationService` in
`acryl-desktop/src/plugin-lifecycle-controller.ts`.

## Limits

- The **renderer** still does a full web reload after a lifecycle change
  (`globalThis.location.reload()` in
  `acryl-desktop/src/client/plugin-lifecycle-api.ts`). A soft client-context
  reconcile that keeps renderer-local UI state (an open editor file, scroll
  position) is future work - the client module loader
  (`@deepseek-ai/dsh-client-modules`) has the `invalidate` / `arrive`
  primitives, but the host-served boot-graph does not yet stream additions.
- The base-template bundles stay restart-only.
- Engine / runtime-provider swapping is a different mechanism (specs 028/029).

## Reference

- `specs/032-universal-hot-reload/` - spec, plan, task ledger.
- `specs/016-plugin-lifecycle-control/`, `specs/017-cordis-architecture-explorer/`.
- `specs/031-desktop-plugin-install/` - the install path this builds on.
