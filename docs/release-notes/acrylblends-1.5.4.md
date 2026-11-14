# acrylblends 1.5.4

An app made from a starter in the registry can pull, list and publish plugins. Released with [create-acrylblends 1.5.4](create-1.5.4.md); no
frame package changes.

- **`acrylblends add plugin-share` mounts it.** The command copied the plugin and left the app to wire it by hand; it now adds the `plugin-share`
  row to `blend.yaml` (after `extensions`) and the import and registry entry to `src/app.ts`, as it does for the agent panel. An app made from a
  starter older than sharing answered `plugin-share is not running in this app` to `npm run acryl -- plugin pull`; one command fixes it.
- **Sharing stays off in production by itself.** `plugin-share` does not start when `NODE_ENV=production`, also in an app whose `src/app.ts` is
  older than the line that left its row out.
- The door's message for an app without sharing names the one command, not a README.

`acrylblends upgrade` still does not add a plugin an app does not have; run `npx acrylblends add plugin-share` in an app made before this release.
