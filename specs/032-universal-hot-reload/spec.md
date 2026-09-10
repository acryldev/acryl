# Universal plugin hot-reload

Status: needs-triage

## Status: T1-T6 landed

- T1 `4270f25` - graph-derived mutability; any profile-bundle / market plugin toggles.
- T2 `d74b505` + `bd5adcb` - live install via `ctx.livePluginActivation`, renderer reload only.
- T3 `663fc25` - soft client-Loader reconcile in place of `location.reload()` for toggles.
- T4 `663fc25` - dependency-aware disable cascade.
- T5 `c717495` - `ACRYL_PLUGIN_WATCH` local dev auto-reload.
- T6 `e9d6093` - `docs/acryl/plugin-hot-reload.md`.

Remaining limit: a fresh install/enable whose browser bundle was not in the
page-load boot graph still triggers one renderer reload (the Host boot-graph
does not yet stream additions to the client module loader). Everything else is
hot.

## Objective

Any plugin - a market-installed one, a profile bundle, a locally linked
checkout - can be enabled, disabled, and reloaded live, without an app or
process restart, the way Development Canvas already can. This is ACRYL's
equivalent of Pi's `/reload`: change a plugin, see it in seconds, with the
canonical room/session state in the Host process untouched.

## Today's mechanism (already generic under the hood)

The live path exists and is not Canvas-specific:

- **`PluginLifecycleController.setEnabled(entryId, enabled)`**
  (`acryl-desktop/src/plugin-lifecycle-controller.ts`) persists the desired
  state to `plugin-lifecycle/state.json`, then calls
  **`entry.update({ disabled: !enabled })`** - a live Cordis Loader mutation.
  The Loader unmounts (or mounts) that entry's Fiber and its dependent
  consumers transactionally. No process restart.
- **`reload(entryId)`** calls **`entry.fiber.restart()`** - Cordis's native
  dispose-all-effects-and-re-`apply` cycle.
- The Host is genuinely hot. The **renderer** half is not: the client
  (`plugin-lifecycle-api.ts`) finishes every change with
  `globalThis.location.reload()` - a full web-content reload inside the same
  Electron window. Fast and flash-free, but it drops renderer-local UI state.

## What "managed" means, and why it is a wall

`MANAGED_PLUGIN_LIFECYCLE_ENTRIES` in
`acryl-desktop/src/plugin-lifecycle-state.ts` is a **hardcoded allowlist** -
three entries: `desktop-development-canvas`, `ui-brand-official`, `ui-acryl`.

The Lifecycle tab lists every Loader entry (`snapshot()` walks
`ctx.loader.entries()`), but only allowlisted ids get `mutable: true`.
Everything else - including every market-installed plugin - renders with
`protectedReason` and a dead toggle:

> This internal or dependency-managed Loader entry is not admitted to safe
> user lifecycle control.

The allowlist is a blunt safety instrument. The real risk it stands in for:
disabling an entry that another entry hard-`inject`s cascades a failure
through the Loader tree; disabling a core capability (settings, connection,
the renderer, session, the Loader itself) breaks the app. Rather than reason
about that, the current code names three entries known to be safe and denies
everything else.

## Approach: derive mutability from the live graph, not a static list

### 1. Mutability policy

Replace the frozen map with a policy function over the running Cordis graph
(`plugin-architecture-inspector.ts` already computes fiber `inject`
declarations and resolved providers). An entry is **user-mutable** when:

- it is not a protected core capability (a small denylist of capability names:
  `settings`, `connection`, `loader`, `locale`, `clientModules`, session,
  the brand slot contract, the lifecycle/architecture routes themselves), and
- no **non-mutable** entry hard-`inject`s a service it provides (mutable
  consumers may cascade; protected ones may not), and
- it is a profile-bundle or market-installed entry, not a base-template
  in-box bundle.

Everything a user added is mutable by construction; the core is never.

### 2. Market-installed plugins are managed automatically

An install receipt (`dsh-community-market` `installReceipts`) for the active
profile implies its Loader entry is lifecycle-managed. No allowlist edit per
plugin. The managed set becomes: `{ derived-mutable entries } ∪ { entries
with a market receipt }` minus the protected denylist.

### 3. Live install / uninstall (close the restart-prompt gap)

Profile composition is startup-only today: `installPlugin` writes
`dsh.profile.bundles` and the new entry appears only at the next boot -
hence "Restart ACRYL for the change to take effect."

After the pnpm install + `reconcileProfileBundles` (spec 031), the Host also:

- reads the newly added bundle's `cordis.patch.yml`,
- inserts its row live via `ctx.loader` (the same `entry.update` / insert path
  `setEnabled` uses),
- triggers the renderer reconcile.

Uninstall is the reverse: unmount the Fiber, then `pnpm remove` + reconcile.
The restart prompt becomes optional (offered for plugins whose patch declares
it needs one, e.g. one that patches a `root`-scope singleton).

### 4. Renderer reconcile without a full page reload

`location.reload()` works but loses renderer state (open file in the editor
plugin, scroll, form input). Move the client to a soft reconcile: the client
Cordis context re-scans the `clientModules` table on a Host lifecycle event
and mounts/unmounts just the affected client Fibers, the way the Host already
does. Full reload stays as the fallback for a plugin that declares it.

### 5. Dependency-aware UX

When disabling X that a mutable Y injects: the UI shows "also disables: Y"
and does it in one transaction. When a protected entry injects X: X is not
mutable in the first place (policy rule 1), so this never reaches the user.

### 6. Local development loop

A `dsh plugin add file:/path/to/checkout` (or a dev-only "watch this
directory" registration) plus a file watcher that calls `reload(entryId)` on
change gives the Pi `/reload` experience for a plugin you are editing.
Out of scope for v1 but the design must not preclude it.

## Non-goals

- Hot-swapping the engine/runtime provider (that is spec 028/029).
- Reloading the base template bundles (`dsh-base`, `dsh-web-app`) - those stay
  restart-only.
- Persisting renderer-local UI state across a declared full reload.

## Acceptance criteria

- Installing `cordis-plugin-graph` from the market makes its Settings tab
  appear **without a restart**; disabling it removes the tab live; re-enabling
  restores it; Reload re-runs its `apply`.
- The Lifecycle tab shows a working toggle for every market-installed plugin
  and every non-core profile bundle, and a disabled toggle with a clear
  reason for core capabilities.
- Disabling a plugin that a core capability depends on is not offered.
- Disabling a plugin that another user plugin depends on names the cascade
  and applies it atomically.
- The canonical Host session/room state survives every enable/disable/reload.
- `pnpm --filter acryl-desktop run check` green.

## Related

- `acryl-desktop/src/plugin-lifecycle-controller.ts`,
  `plugin-lifecycle-state.ts`, `plugin-architecture-inspector.ts`,
  `client/plugin-lifecycle-api.ts`.
- `specs/016-plugin-lifecycle-control` - the existing lifecycle surface.
- `specs/017-cordis-architecture-explorer` - the graph this reuses.
- `specs/031-desktop-plugin-install` - the install path this extends live.
- `specs/030-acryl-marketplace` - the plugins this unblocks.
