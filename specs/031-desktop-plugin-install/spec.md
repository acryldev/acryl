# Desktop plugin install: own pnpm + bundle reconciliation

Status: ready-for-agent

## Problem

Installing a plugin into the `desktop` profile fails - from the Market UI
("The package manager finished, but the plugin bundle was invalid, so the
installation was rolled back") and from the ACRYL Terminal (`dsh plugin add`
is a silent no-op; `pnpm add` alone works but never updates
`dsh.profile.bundles`).

Root cause, in two layers, both from the DSH `0.1.1-rc.2` -> `0.1.5-alpha.1`
bump:

1. **desktop-cli bootstrap** - FIXED in `4b7bb3a`. `@deepseek-ai/dsh@0.1.5`
   guards its dispatch with `if (import.meta.main)` and exports `runCli`.
   `desktop-cli.ts` loaded `bin.js` with a bare `import()` and relied on the
   import side effect, which stopped running - every packaged `dsh` command
   became a silent success no-op.

2. **`dsh plugin` forbids the desktop profile** - NOT fixed. `dsh@0.1.5`'s
   `plugin` command calls `rejectElectronProfile` and hard-errors on
   `--profile desktop` ("managed exclusively by the Electron application").
   `acryl-desktop/src/pnpm.ts` builds every plugin install as
   `<electron> <desktop-cli.js> plugin --profile desktop add <spec>`, so with
   layer 1 fixed the install now fails loudly instead of silently. Upstream is
   explicitly telling the Electron app to manage this profile itself.

`assertInstalledBundle` in `dsh-community-market` then correctly rolls the
install back because the profile manifest never gained the dependency or the
`dsh.profile.bundles` entry.

## Objective

`acryl-desktop` performs the plugin install for the `desktop` profile itself,
using `@deepseek-ai/dsh-app-boot` primitives, instead of forwarding to
`dsh plugin`. The Market managed-install contract
(`assertInstalledBundle`: exact dependency version + bundle-list membership +
lockfile integrity) and the durable install-recovery WAL are unchanged.

## Source of truth

`@deepseek-ai/dsh-app-boot@0.1.5-alpha.1` exports the primitives to do this
without the CLI: `readProfileManifest`, `writeProfileManifest`,
`resolveBundleDir`, `resolveProfileDir`, `initProfile`, `PROFILE_TEMPLATES`,
`DEFAULT_PROFILE_BUNDLES`.

The reconciliation rule is the one `dsh`'s own `reconcilePlugins`
(`@deepseek-ai/dsh/lib/plugin-*.js`) applies, reproduced here because it is
CLI-internal:

- After pnpm materializes the install, for every entry in the profile
  manifest's `dependencies`: if `resolveBundleDir` resolves it and its
  `package.json` declares `dsh.bundle.patch`, it must appear in
  `dsh.profile.bundles` (appended in dependency order).
- A name in `dsh.profile.bundles` that is a former dependency and no longer
  resolves to a `dsh.bundle` package is removed.
- In-box template bundles (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`)
  are not dependencies and are never touched.
- A newly added dependency that declares no `dsh.bundle` is left as a plain
  dependency (warn once).

## Deliverables

### A. Direct pnpm install path in `acryl-desktop/src/pnpm.ts`

- `installPlugin` (and `runPluginInstall`) run `pnpm add --save-exact <spec>`
  via the existing direct-pnpm `start()` path (the one already used for
  `why` / `list`), cwd = `activeProfileDir`, not through `desktop-cli.js`
  `plugin`.
- Keep the `DesktopInstallRecoveryStore` transaction wrapper, the pre-install
  snapshot, the post-`done` sealing, and cancellation exactly as today.
- `plugin remove` takes the same direct route.

### B. Bundle reconciliation

- A small owned helper (in `acryl-desktop`, next to `desktop-plugins.ts`)
  that applies the rule above using `dsh-app-boot` primitives.
- Runs after a zero-exit pnpm install/remove, before the handle's `done`
  resolves, so `assertInstalledBundle` sees a reconciled manifest.
- Two-anchor resolution (`INSTALL_ANCHOR`, then the profile dir), matching the
  Loader.

### C. Terminal parity

- The generated `dsh` shim's `plugin add` / `plugin remove` / `plugin update`
  for the `desktop` profile route through the same owned path (the terminal
  help text already advertises these commands).
- `dsh plugin --profile <other>` (tui, custom profiles) still forwards to the
  upstream CLI unchanged - only `desktop` is owned.

### D. Verification

- `market-pnpm-integration.spec.ts` / `pnpm.spec.ts`: an install writes the
  exact-version dependency and the `dsh.profile.bundles` entry; a remove
  reverses both; a bundle-less dependency is added without a bundle entry.
- `dsh-community-market` `assertInstalledBundle` passes against a profile
  reconciled by the new helper (integration test with a real fixture package).
- Recovery: a killed pnpm mid-install leaves no partial manifest; the WAL
  restores the pre-install snapshot.
- Loader boot smoke still green.

## Out of scope

- Non-`desktop` profiles (tui, headless, custom) - they keep using `dsh plugin`.
- Changing the Market verification or catalog contracts.
- The `dsh-market` provider import-guard (separate concern).

## Acceptance criteria

- From the Market UI with the ACRYL Package Catalog selected, installing
  `acryl-dsh-editor-plugin` (or `cordis-plugin-graph`) completes: the confirm
  dialog succeeds, the profile manifest gains
  `"acryl-dsh-editor-plugin": "<exact>"` and the `dsh.profile.bundles` entry,
  a receipt is saved, and after restart the plugin's Settings tab appears.
- `dsh plugin add <pkg>` in the ACRYL Terminal does the same.
- A mid-install kill rolls back to a clean profile.
- `pnpm --filter acryl-desktop run check` green.

## Related

- `4b7bb3a` - layer 1 fix (packaged dsh CLI entry).
- `specs/030-acryl-marketplace` - the marketplace this unblocks.
- `dsh-community-market/src/install/service.ts` `assertInstalledBundle` - the
  contract this must satisfy.
- `acryl-desktop/src/pnpm.ts`, `acryl-desktop/src/desktop-plugins.ts`,
  `acryl-desktop/src/desktop-terminal.ts`.
