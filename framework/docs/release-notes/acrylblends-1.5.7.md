# acrylblends 1.5.7

Every app in the registry can be made in the frame again, and a finished app packed as its own product no longer asks for a name.
Released with [create-acrylblends 1.5.7](create-1.5.7.md); no frame package changes.

- **`acrylblends add plugin-share` mounts a plugin whose folder is already there.** An app whose upgrade brought `plugins/plugin-share`
  without its row in `blend.yaml` was refused ("the app already has plugins/plugin-share"); now the row is added and the folder is left
  as it is. A plugin that is already mounted is still refused.
- **`acrylblends upgrade` no longer copies a plugin twice.** When a plugin of the app and the frame both needed `plugin-share`, the
  frame step failed with "plugins/plugin-share already exists" (the registry's `acrylblends.agent`).
- **A desktop product made from one Blend starts under its own name.** ACRYL Control Center and ACRYL ADE asked "Name your app" on
  their first start; only the Blank product, whose first app is yours to name, still asks.
- **The packer works without git's background maintenance**, which wrote into `.git` while the packer copied it (ENOENT on
  `objects/maintenance.lock`, macOS).

An app made with an earlier release gets these with `npx acrylblends upgrade`, then `npm install`.
