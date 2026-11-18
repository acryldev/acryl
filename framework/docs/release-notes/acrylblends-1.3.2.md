# acrylblends 1.3.2

`npx acrylblends@latest upgrade` works again on an app made by acrylblends 1.2.0, 1.3.0 or 1.3.1 that nobody edited. `create-acrylblends` is unchanged (1.4.1).

## Fixed

- **Upgrade recognises the apps every published release made.** On an untouched app made by 1.2.0 or 1.3.0 it stopped with "src/app.ts ... is not the previous release's scaffold and acrylblends did not write it; nothing was changed", because its record of released scaffolds ended at 1.1.0. It now has every release up to 1.3.1. The project's own check fails when a published release is missing from that record, so a later release cannot leave it behind again.
- **An app whose `src/routes.ts` is its own and whose `src/app.ts` is untouched is upgraded**, and its `src/routes.ts` is kept. Before, such a blank app was left standalone as "not the scaffold of any published acrylblends release".

## Upgrading

`npx acrylblends@latest upgrade` in the app, then `npm install`.
