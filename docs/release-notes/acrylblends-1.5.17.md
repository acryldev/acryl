# acrylblends 1.5.17

A new app is 153 MB smaller: DSH's LibreOffice engine is no longer installed with every app. Office preview is a plugin you add when you want it.
Released with [create-acrylblends 1.5.17](create-1.5.17.md) and @acrylblends/blends-frame 0.1.5 (frame/packages.json).

- **The LibreOffice engine is left out.** DSH's web app depends on its Office-to-PDF converter, whose engine is 150 to 190 MB per OS (a third
  of an app's packages). Every app now gets an npm override that swaps the five engine packages for the empty `@acrylblends/absent`, and the
  converter's `office-to-pdf` row is off (`omit` in frame/packages.json). Every other document preview works; Office files wait for the plugin.
- **A pulled plugin can bring a native package** (`acrylblends.native` in its package.json, plugins/plugin-share/README.md). The pull
  downloads only this computer's entry from npm, checks its sha512, unpacks it into the app's home and links it into `node_modules` before the
  plugin starts. Removing the plugin removes it; the next start links it again after an `npm install`.
- **The Office preview plugin**: `npm run acryl -- plugin pull github:cordisplugins/office-preview`, or Settings > Plugins > Registry.
- **The Registry tab lists plugins made in Blends apps** (it skipped every one: they have only an `install` line in the index), and shows what
  a plugin downloads for this computer, on its row and in the question before the add.

An app made with an earlier release gets these with `npx acrylblends upgrade`, then `npm install`.
