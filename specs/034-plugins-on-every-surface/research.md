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

## Q3 - What exactly does `Settings > Plugins` enumerate?

**Status**: open
**Gates**: T003, T005

Known from the panel itself: it groups rows as `Session plugins` ("Composed per
session by agent presets") and `Global plugins` ("Shared by the system and
every session"), with a preset selector, and it searches across presets
("1 more matches in other presets: Minimal mode"). The host side is
`@deepseek-ai/dsh-host-plugin-inventory` (service `pluginInventory`), which all
three surfaces can mount; the client side is
`@deepseek-ai/dsh-client-ui-settings-plugin-inventory`. Open: whether the host
service's row set is derived purely from the booted Loader composition (in
which case a CLI can read it without any client UI) or from preset metadata
that only some bundles ship.

## Facts already established

- Composition seam: `acryl-harness-runtime/src/coding-capabilities.ts` -
  `ACRYL_CODING_CAPABILITIES` (with a `surfaces` field per capability),
  `createAcrylCodingCapabilityPatches(surfaces)`, and the non-TUI filter
  `NON_TUI_SHARED_ROW_IDS` (currently `authorization` only).
- Call sites: `engine-dsh.ts:178` (`['tui']`), `engine-dsh.ts:252` (`['web']`),
  `acryl-desktop/src/profile.ts:689` (`['desktop']`).
- Dependency asymmetry per surface: see the table in `spec.md`.
- Desktop-owned plugin modules: `desktop-plugins.ts`, `desktop-market.ts`,
  `desktop-plugin-reconcile.ts`, `desktop-plugin-watch.ts`,
  `plugin-lifecycle-*`, `plugin-architecture-*`.
- `acryl-control` domains today: `agent`, `architecture`, `authorization`,
  `contracts`, `credential`, `lifecycle`, `protocol` - the plugin domain joins
  this pattern.
