# Plan: universal plugin hot-reload

T1, T2, T4, T5, T6 below landed as written; T3 landed then was reverted
after live crash reports. See `spec.md`'s status table and
`issues/01-unify-disable-state.md` (done) for the current state.

## Task order (each a green, committable slice)

### T1 - graph-independent mutability from the profile bundle list  ← core

The one that unlocks "toggle every plugin I installed", low risk.

- `plugin-lifecycle-state.ts`: state schema **v2**. `disabledEntries` becomes
  `Array<{ entryId, patchId, moduleName }>` - self-describing, so
  `pluginLifecyclePatches` (runs at profile-composition time, before the
  Loader exists) needs no lookup table. Migrate v1 (`string[]` of the 3 legacy
  ids) through `MANAGED_PLUGIN_LIFECYCLE_ENTRIES`, which stays as the
  migration table + the always-mutable seed set (canvas, both brands).
- Bootstrap gains `profileDir`.
- `plugin-lifecycle-controller.ts`: `mutable(entry)` =
  `LEGACY_MUTABLE.has(entry.id)` OR
  (`entry.options.name` is in the profile's `dsh.profile.bundles` AND is not a
  base-template bundle `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app`).
  A user-added bundle's inserted row is mutable; the base template and every
  core `include:` under it is not.
- `setEnabled` / `reload` accept any entry `mutable()` admits; they persist
  the live entry's `{entryId, patchId, moduleName}` descriptor.
- `snapshot()` reports `mutable` + a reason string per entry.
- Tests: state v1->v2 migration; a market bundle entry is mutable; a core
  `include:` is not; disable/enable/reload a non-legacy entry round-trips.

### T2 - live install: no restart prompt

- After `installPlugin` + `reconcileProfileBundles` (spec 031), the Host
  reads the new bundle's `cordis.patch.yml` and inserts its row via
  `ctx.loader` (same path `setEnabled` uses), then signals the renderer.
- Uninstall: unmount the Fiber first, then `pnpm remove` + reconcile.
- The market operation result carries `restartRequired: false` unless the
  plugin's patch declares otherwise; the client stops showing the restart
  banner in that case.

### T3 - soft renderer reconcile

- `client/plugin-lifecycle-api.ts`: replace `location.reload()` with a client
  Cordis reconcile - re-scan `clientModules`, mount/unmount only affected
  client Fibers. Full reload stays as the declared fallback.
- Market client: same, for install/uninstall.

### T4 - dependency-aware cascade UX

- `snapshot()` adds `dependents: string[]` (mutable entries that inject a
  service this entry provides), computed from
  `plugin-architecture-inspector.ts`'s graph.
- `setEnabled(disable)` on an entry with mutable dependents disables them in
  the same transaction; the receipt lists them; the UI shows "also disables".
- An entry a **protected** entry depends on is never `mutable` (T1 already
  excludes core; add the graph check so a user bundle that a core entry
  injects is also excluded).

### T5 - local development loop (v1: manual)

- `dsh plugin add file:/abs/path` already works through spec 031.
- Add a dev-only Host effect: watch a registered checkout dir, debounce,
  call `controller.reload(entryId)` on change. Gated behind a Development
  Canvas / advanced-mode setting. No packaging impact.

### T6 - docs + DEVELOPMENT-LOG

- `docs/acryl/plugin-hot-reload.md`; update `specs/016` cross-reference.

## Verification each slice

`pnpm --filter acryl-desktop run typecheck && … run test && … run verify:loader`.
GUI check at T2 and T3 (install -> tab appears live; disable -> gone; editor
plugin keeps its open file across a reload).
