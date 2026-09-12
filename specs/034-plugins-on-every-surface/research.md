# Research: plugins on every surface

Facts the plan waits on. Each answered question becomes a note here before the
task it gates starts.

## Q1 - Can `dsh-community-market` mount under the Web host?

**Status**: open
**Gates**: T004

Known: `dsh-community-market` is an implemented private Host/Client package
declared by `acryl-desktop` and enabled as an optional Desktop Market provider;
`acryl-web` does not declare it. The market's Client face is an ordinary Cordis
Client plugin and should render in the Web client like any other; the open part
is the Host face (install, profile reconcile, `desktopProfiles`/`desktopPnpm`
injection) and whether it assumes an Electron main process.

Measured: the package composes as one row (`dsh-community-market`) in the real
Desktop Loader tree - it is a plain Cordis Host row, not an Electron main-process
object, so the question is which of its injected services exist off-Electron,
not whether the row itself can mount. Not attempted yet under the Web host.

## Q2 - Does the install/reconcile path work without Electron?

**Status**: open
**Gates**: T006

Known: `acryl-desktop/src/desktop-plugin-reconcile.ts` plus the desktop's own
pnpm run the install into the active profile and reconcile
`dsh.profile.bundles` (`specs/031`). Outside Electron there is no
`app.getPath`; the runtime already has a precedent for an injected install
anchor in `engine-dsh.ts` (`materializeProfilePackage(profileDir, name,
installPackageUrl)`), which the CLI/Web engine definitions would supply from
their own package location.

Related, measured: the Desktop profile's own pnpm row (`acryl-desktop/pnpm`)
is composed only on Desktop - it is a service the install path would have to
re-create or inject on another surface.

## Q3 - What exactly does `Settings > Plugins` enumerate?

**Status**: resolved (2026-09-12), corrected (2026-09-12) - T003/T005 are unblocked
**Gates**: T003, T005

The host service is `@deepseek-ai/dsh-host-plugin-inventory` (service name
`pluginInventory`, `inject: ['loader']`). `list()`
(`lib/index.js:108-138` of the installed `0.1.5-alpha.1` copy) returns two
things, read live from the running runtime on every call - no cache, no
persisted roster:

- `entries` - the Loader's own entries, in Loader order, skipping
  `options.group` rows, each as `{ entryId, moduleName, enabled, fiberPhase }`.
  This is the panel's `Global plugins` section ("Shared by the system and every
  session").
- `agentPresets` - present only when `ctx.get('agentPresets')` resolves; each
  preset's `compositionInventory()` rows with `fiberPhase` resolved. This is
  the panel's `Session plugins` section ("Composed per session by agent
  presets"), one group per roster entry, which is what the preset selector and
  the "1 more matches in other presets: Minimal mode" line read.

Display detail that changes the reading of the original report: both section
counts are **post-search-filter** (`lib/client.js:245-262`; a section renders
only when its unfiltered list is non-empty). `Global plugins · 0 plugins` on a
screen where the query was `editor` therefore means "0 of N global rows match
`editor`", not "the surface composed no plugins".

### Measured composition per surface (2026-09-12)

Booted each real definition headlessly and dumped `ctx.loader.entries()`:

- tui: `createDshEngineDefinition('acryl-test')` under `createAcrylEngineHost`
  - 88 rows.
- web: `createWebEngineDefinition(<acryl-web package.json>)` under the same
  host - 157 rows.
- desktop: the repo's own headless gate,
  `DEBUG_VERIFY_LOADER_BOOT=1 node --expose-internals scripts/verify-loader-boot.mjs`
  (temp home, `prepareDesktopProfile`) - 168 rows.

Differences by module name:

| Set | Rows |
| --- | --- |
| desktop only | `acryl-desktop`, its `terminal`/`pnpm`/`profiles`/`updates`/`notifications`/`diagnostics`/`hello-world`/`webserver` rows, `acryl-development-canvas`, `dsh-community-market` |
| web only (vs desktop) | none (the include row's id differs) |
| web/tui share | every remaining row |
| tui only | none |

Plugin-relevant rows that already exist on web and desktop:
`@deepseek-ai/dsh-host-plugin-inventory`,
`@deepseek-ai/dsh-plugin-package-inventory-deepseek`,
`@deepseek-ai/dsh-client-ui-settings-plugins`,
`@deepseek-ai/dsh-client-ui-settings-plugin-inventory`,
`@deepseek-ai/dsh-agent-presets`, brand swap. On tui:
`@deepseek-ai/dsh-plugin-package-inventory-deepseek` and
`@deepseek-ai/dsh-agent-presets` only - **no `pluginInventory`**.

`@deepseek-ai/dsh-tool-str-replace-editor` is composed by **no** surface
globally; it appears only in the shipped `minimal` agent preset
(`@deepseek-ai/dsh-agent-presets/presets/minimal/agent.cordis.yml`), which is
exactly the panel's "1 more matches in other presets: Minimal mode" line. It is
declared by `acryl-harness-runtime`, not by `acryl-desktop`.

Consequences for this spec: (a) the row set is a property of the booted
composition, so a TUI can read the same list with no client UI at all - only
`agentPresets` plus `pluginInventory` need to be mounted; (b) the surfaces do
not differ by "has plugins" but by **which** rows they declare - the client
stack is correctly web+desktop only, while `pluginInventory` is a host service
tui can and should mount; (c) ACRYL's own plugin *management* (market install,
enable/disable, architecture inspector) is Desktop-only today because it is
implemented there (`desktop-plugins.ts`, `plugin-lifecycle-*`,
`plugin-architecture-*`, the `PluginLifecycleSettingsTab` client tab), not
because of a composition declaration; (d) any parity check must compare these
live rows, not a config file.

## Q4 - Which preset rows can a surface see, and where does the editor live?

**Status**: resolved (2026-09-12) - informs T003's output shape
**Gates**: T003

Agent presets are compositions of their own
(`@deepseek-ai/dsh-agent-presets/presets/<id>/agent.cordis.yml`, ids `cordis`,
`minimal`, `ptc`, `standard`). A row can therefore be "composed for a session"
without being a global row; `pluginInventory.list().agentPresets[]` is the only
place that distinction is visible at runtime. A CLI `plugin list` that claims
parity with the panel must print both halves for the same reason.

## Facts already established

- Composition seam: `acryl-harness-runtime/src/coding-capabilities.ts` -
  `ACRYL_CODING_CAPABILITIES` (with a `surfaces` field per capability),
  `createAcrylCodingCapabilityPatches(surfaces)`, and the non-TUI filter
  `NON_TUI_SHARED_ROW_IDS` (currently `authorization` only).
- Call sites: `engine-dsh.ts:178` (`['tui']`), `engine-dsh.ts:252` (`['web']`),
  `acryl-desktop/src/profile.ts:689` (`['desktop']`).
- `acryl-harness-runtime` is a workspace package but is **not** in the root
  `typecheck`/`test`/`build`/`check` filter lists - its own suite (including
  `tests/coding-capabilities.spec.ts` and `tests/engine-dsh.spec.ts`) runs only
  when invoked directly. A parity gate placed there would not run in the gate.
- Dependency asymmetry per surface: see the table in `spec.md`.
- `shippedPresetRoot()` (`acryl-desktop/src/profile.ts:421-426`) resolves
  `@deepseek-ai/dsh/config/agent-presets`, which no longer exists at the
  `0.1.5-alpha.1` pin (the payload moved to
  `@deepseek-ai/dsh-agent-presets/presets`). `scanRoot` treats `ENOENT` as an
  empty root, so the row's declared system root is silently dead rather than
  fatal: Desktop still gets presets from the package's own shipped root.
- Desktop-owned plugin modules: `desktop-plugins.ts`, `desktop-market.ts`,
  `desktop-plugin-reconcile.ts`, `desktop-plugin-watch.ts`,
  `plugin-lifecycle-*`, `plugin-architecture-*`; the client-side management UI
  is `src/client/plugin-lifecycle-settings.ts` +
  `PluginLifecycleSettingsTab.tsx`.
- `acryl-control` domains today: `agent`, `architecture`, `authorization`,
  `contracts`, `credential`, `lifecycle`, `protocol` - the plugin domain joins
  this pattern.
