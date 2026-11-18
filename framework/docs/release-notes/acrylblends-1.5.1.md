# acrylblends 1.5.1

Two fixes to 1.5.0. Released with [create-acrylblends 1.5.1](create-1.5.1.md); the frame packages are unchanged (`@acrylblends/blends-frame` 0.1.2,
`@acrylblends/brand-client` 0.1.1, `@acrylblends/versions` 0.1.1).

- **pnpm installs and runs an app in the frame.** With pnpm 11 or later, `pnpm install` stopped with `ERR_PNPM_IGNORED_BUILDS`, and once builds were
  allowed the host could not find its rows in pnpm's isolated `node_modules`. `init` and `upgrade` now write the two settings the frame needs into the
  app's `pnpm-workspace.yaml`: `nodeLinker: hoisted` and `allowBuilds` for the frame packages whose install scripts npm runs too. A key you already set
  is never changed, and npm ignores the file.
- **An app made with 1.4 starts on Linux with Node 22 or later.** Moving the app's data into `~/.acryl/apps/<id>/data` failed there with
  `ERR_FS_CP_EEXIST`; the move now copies entry by entry.
- When the host cannot start, it lists each row that failed by id and module. Before, the report itself crashed.

## Upgrade

```sh
npx acrylblends@latest upgrade      # in the app folder: writes pnpm-workspace.yaml when it lacks the settings
```
