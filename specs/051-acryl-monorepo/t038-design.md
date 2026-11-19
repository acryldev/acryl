# T038 - one name everywhere (`@acryldev/<short>`)

Owner decision 2026-11-19 ("one name everywhere tonight", Pi-style): a package has one name - its npm name, its workspace name and the
specifier code imports - and its folder is that name's short part. T036 already publishes the frame under `@acryldev/*` through a
publish-time map (`framework/frame/packages.json`); T038 removes the map's reason to exist.

## The rule

- Package name `@acryldev/<short>`, folder `plugins/<short>` (or `runtime/<short>`; the layer folders stay as they are).
- `<short>` = the current name without its `acryl-` prefix (`@acryldev/router` -> `router`, `@acryldev/drivers` -> `drivers`). Where the frame
  already published a short name, that name wins (`@acryldev/web` -> `web`, `@acryldev/brand-client` -> `brand-client`).
- Imports: `@acryldev/router`, `@acryldev/node-server/adapter`, in this repository, in app templates and in installed packages alike.

## Collisions (decided here)

| Today | Becomes | Why |
|---|---|---|
| `plugins/settings` (frame Settings) / `plugins/app-settings` (`@acryldev/app-settings`) | `@acryldev/settings` / `@acryldev/app-settings` | the frame's keeps its published name |
| `plugins/acryl-save` is `@acryldev/app-save`; `plugins/save` is `@acryldev/save` | `@acryldev/app-save` / `@acryldev/save` | each keeps its package name's short part |
| `plugins/brand` / `plugins/brand-client` | `@acryldev/brand` / `@acryldev/brand-client` | the latter's published name |
| `plugins/plugin-hub` / `runtime/plugin-hub-core` (`@acryldev/plugin-hub-core`) | `@acryldev/plugin-hub` / `@acryldev/plugin-hub-core` (folder `runtime/plugin-hub-core`) | owner 2026-11-19: all @acryldev |
| `runtime/web` / `apps/acryl-web` | `@acryldev/web` / app keeps `acryl-web` | apps keep their names (below) |

## Stays as it is

Owner 2026-11-19: every package in this repository is `@acryldev/*` (the `@acryldev/*` three included: `@acryldev/blends-core`,
`@acryldev/app-persistence`, `@acryldev/plugin-hub-core`), except:


- What people type and install as a product: `acryl` (root and `distribution/acryl-npm-launcher`), `acrylblends`, `create-acrylblends`,
  and the apps in `apps/` (`acryl-desktop`, `acryl-web`, `acryl-cli`, `acryl-launcher-tui`): product names, not libraries.
- Ecosystem-convention names: `@acryldev/cordis-plugin-market`, `@acryldev/dsh-community-fabric` (Cordis/DSH name their plugin kinds by prefix).
- Loader row ids: unchanged. They are persisted in people's composition overrides (cordis.yml keys); renaming them breaks installed apps.
  The CLAUDE.md row-id rule ("row id = package name") gets the note that a scoped package's row id is its existing id.
- `examples/*`, `framework` (`@acryldev/monorepo`), the private `@acryldev/framework`: internal, renamed only if trivial.

## What must change with it (the parts a sed misses)

1. `framework/packages/cli/src/rewrite.ts`: `SPECIFIER` matches `acryl-*` only - it must match `@acryldev/*`; `rewriteSpecifiers`'
   `installed` check and `toPackageSpecifiers` must take a scoped package's first two segments, not `split('/')[0]`.
2. `library.ts`: a library plugin's name (what `acrylblends add <name>` takes) is its folder, now the short name; `add @acryldev/router` keeps
   working as an alias for one release (people and docs say it).
3. Apps carry copies under `plugins/<folder>`: `acrylblends upgrade` moves `plugins/router` to `plugins/router` and rewrites the
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
- **App templates** keep their relative imports (`../plugins/router/...`): only a copied plugin's own sources name `@acryldev/<name>`,
  and `init`/`add` rewrite those to relative paths at copy time (today's mechanism, new names). DS2's correction, 2026-11-19.
- **Package-import keys stay** (`#acryl-jsx`, `#acryl-kv` in an app's package.json "imports"): they live in installed apps.
- **frame/packages.json** keys become the full package names (`@acryldev/web`) with `version` and `path`; `name` goes; `scope` stays as a
  checked constant every key must start with. **repository/homepage** of every published package -> `acryldev/acryl` with `directory`.
- **Delivery mode decides** (T011 slice 3 stays): a copied plugin's specifier becomes a relative path; a plugin the app installs as a
  package (T011: desktop shell, instance) keeps its `@acryldev/...` specifier.
- **Row ids do not change.** The Loader rule ties a row id to the package name for NEW rows; existing ids (`@acryldev/web`,
  `@acryldev/blends-frame`, `@acryldev/app-save`, ...) are persisted in people's overrides, so only the rows' `name:` fields change. The overlays
  stay valid at every step because T036 already changed `name:` and T038 changes no id.

## Order and proof

One worker (DS2) on a branch off main after T036, T031 and T021 have landed; nobody else edits during it. Folder moves with `git mv`
(history kept), one commit for moves, one for names and imports, one for the upgrade migration. Proof: the full fresh-clone gate (it runs
every template's scaffold, upgrade from every legacy layout, the packed app and the frame publish dry run), a real Desktop boot, and
`acrylblends upgrade` on a copy of an app made with create-acrylblends 1.5.21 that then boots.
