# Scaffold: a plugin built from copied @acryl/ui source

For a plugin that owns its UI source outright (the shadcn-style model), not one that depends
on `@acryl/ui` at runtime. Spec 038-ui-component-library, tasks.md T039.

## Use it

1. Copy this folder to your plugin's location and rename it (`package.json`'s `name`,
   `tsdown.config.ts`'s `PACKAGE_NAME`, `cordis.patch.yml`'s `id`/`name`, `index.js`'s
   `name` - they must all match).
2. `pnpm install` (or your package manager) to fetch the devDependencies.
3. From inside your renamed copy, add the components you want:
   ```
   acryl ui add acryl.ui.card . --registry <path-to-a-cloned-acryl-ui-registry>
   ```
   Each one lands in `ui/<name>/` as your own source, recorded in `ui.lock.json`.
4. Import the added component(s) in `src/client/index.ts` and build a real screen with them,
   replacing the `Placeholder` starter.
5. `pnpm run build` (tsdown, the same CSS Modules chain `@acryl/ui` itself uses) and
   `pnpm run typecheck`.
6. Install the plugin (`acryl_install_plugin`, or copy it into a profile's extensions and
   `/reload new`).

## Why copied source, not a dependency

`require('@acryl/ui')` pulls the whole prebuilt library into one bundle - simple for a small,
build-less `client.js` plugin, but you get every component whether you use one or all of them,
and you can't edit what you got. This scaffold is the other path: pay for a real build step,
and in exchange, own exactly the components you chose, free to restyle or extend.
