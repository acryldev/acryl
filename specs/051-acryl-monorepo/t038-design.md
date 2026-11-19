# T038 - one name everywhere (`@acryldev/<short>`)

Owner decision 2026-11-19 ("one name everywhere tonight", Pi-style): a package has one name - its npm name, its workspace name and the
specifier code imports - and its folder is that name's short part. T036 already publishes the frame under `@acryldev/*` through a
publish-time map (`framework/frame/packages.json`); T038 removes the map's reason to exist.

## The rule

- Package name `@acryldev/<short>`, folder `plugins/<short>` (or `runtime/<short>`; the layer folders stay as they are).
- `<short>` = the current name without its `acryl-` prefix (`acryl-router` -> `router`, `acryl-drivers` -> `drivers`). Where the frame
  already published a short name, that name wins (`acryl-web-service` -> `web`, `dsh-client-ui-brand-acryl` -> `brand-client`).
- Imports: `@acryldev/router`, `@acryldev/node-server/adapter`, in this repository, in app templates and in installed packages alike.

## Collisions (decided here)

| Today | Becomes | Why |
|---|---|---|
| `plugins/acryl-settings` (frame Settings) / `plugins/settings` (`acryl-app-settings`) | `@acryldev/settings` / `@acryldev/app-settings` | the frame's keeps its published name |
| `plugins/acryl-save` is `acryl-app-save`; `plugins/save` is `acryl-save` | `@acryldev/app-save` / `@acryldev/save` | each keeps its package name's short part |
| `plugins/acryl-brand` / `plugins/dsh-client-ui-brand-acryl` | `@acryldev/brand` / `@acryldev/brand-client` | the latter's published name |
| `plugins/acryl-plugin-hub` / `runtime/plugin-hub` (`@webboxes/plugin-hub`) | `@acryldev/plugin-hub` / stays `@webboxes/plugin-hub` | see "stays" |
| `runtime/acryl-web-service` / `apps/acryl-web` | `@acryldev/web` / app keeps `acryl-web` | apps keep their names (below) |

## Stays as it is

- What people type and install as a product: `acryl` (root and `distribution/acryl-npm-launcher`), `acrylblends`, `create-acrylblends`,
  and the apps in `apps/` (`acryl-desktop`, `acryl-web`, `acryl-cli`, `acryl-launcher-tui`): product names, not libraries.
- Ecosystem-convention names: `cordis-plugin-market`, `dsh-community-fabric` (Cordis/DSH name their plugin kinds by prefix).
- `@webboxes/*` (`blends-core`, `plugin-hub`, `app-persistence`): WebBoxes s.r.o.'s packages; the owner decides separately.
- Loader row ids: unchanged. They are persisted in people's composition overrides (cordis.yml keys); renaming them breaks installed apps.
  The CLAUDE.md row-id rule ("row id = package name") gets the note that a scoped package's row id is its existing id.
- `examples/*`, `framework` (`acrylblends-monorepo`), the private `acrylblends-framework`: internal, renamed only if trivial.

## What must change with it (the parts a sed misses)

1. `framework/packages/cli/src/rewrite.ts`: `SPECIFIER` matches `acryl-*` only - it must match `@acryldev/*`; `rewriteSpecifiers`'
   `installed` check and `toPackageSpecifiers` must take a scoped package's first two segments, not `split('/')[0]`.
2. `library.ts`: a library plugin's name (what `acrylblends add <name>` takes) is its folder, now the short name; `add acryl-router` keeps
   working as an alias for one release (people and docs say it).
3. Apps carry copies under `plugins/<folder>`: `acrylblends upgrade` moves `plugins/acryl-router` to `plugins/router` and rewrites the
   app's relative imports (the legacy-layout machinery, `scripts/build-legacy-layouts.mjs`, gets the new layout).
4. The guard (`scripts/dependency-direction.mjs` role lists, `verify-layout.mjs`, `lint-coverage.mjs`, biome includes), the bulkhead
   ALLOWED paths, tsconfig `paths`, `pnpm-workspace.yaml`, workflow filters (`--filter acryl-*`), `frame/packages.json` (its map shrinks
   to versions), `FRAME_PACKAGES` in `ide-profile.ts`, the products' package.json and generated overlays, docs.

## Decisions on DS2's review points (2026-11-19)

- **Matching:** `SPECIFIER` matches the whole `@acryldev/<name>(/<subpath>)?`; the entry table decides with exact keys
  (`${packageName}${subpath}`), and anything unlisted keeps the "not a library plugin" error. No guessing where the package ends.
- **Library names follow the folders** (`plugins/router` -> library name `router`): `requires` lists, `acrylblends add <name>`, add.ts's
  suite stripping and the `#acryl-kv` imports map move to the new names; `add acryl-<name>` is accepted as an alias for one release.
  Legacy layouts stay as historical fixtures (they describe what old apps have).
- **App templates** import `@acryldev/<name>` in their source exactly as they import `acryl-<name>` today: `init`/`add` rewrite a copied
  plugin's specifiers in the app's files to relative paths at copy time (today's mechanism, new names). No tsconfig-paths trick.
- **Delivery mode decides** (T011 slice 3 stays): a copied plugin's specifier becomes a relative path; a plugin the app installs as a
  package (T011: desktop shell, instance) keeps its `@acryldev/...` specifier.
- **Row ids do not change.** The Loader rule ties a row id to the package name for NEW rows; existing ids (`acryl-web-service`,
  `acryl-blends-frame`, `acryl-app-save`, ...) are persisted in people's overrides, so only the rows' `name:` fields change. The overlays
  stay valid at every step because T036 already changed `name:` and T038 changes no id.

## Order and proof

One worker (DS2) on a branch off main after T036, T031 and T021 have landed; nobody else edits during it. Folder moves with `git mv`
(history kept), one commit for moves, one for names and imports, one for the upgrade migration. Proof: the full fresh-clone gate (it runs
every template's scaffold, upgrade from every legacy layout, the packed app and the frame publish dry run), a real Desktop boot, and
`acrylblends upgrade` on a copy of an app made with create-acrylblends 1.5.21 that then boots.
