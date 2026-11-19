# acrylblends 1.6.0

The frame's packages have a new home on npm: `@acryldev/*`. Released with [create-acrylblends 1.6.0](create-1.6.0.md).

- **`@acryldev/*` instead of `@acryldev/*`.** Every frame package (web, control, system-prompt, settings, workspace, sign-in, app-shell, ui,
  blends-frame, ...) is published under `@acryldev`, at the same versions. A new app installs those names. What you type does not change:
  `npm create @acryldev/blends`, `npx acrylblends`, `acryl`.
- **An existing app moves with `npx acrylblends upgrade`, then `npm install`.** The upgrade writes the `@acryldev/*` names into package.json
  and the generated `cordis.patch.yml`, and drops the old `@acryldev/<name>` dependency of every package it moved, so nothing is installed
  twice. The old packages stay on npm, marked deprecated with a pointer to the new name.
- **A product says what roots its page.** `"acrylblends": { "root": "workspace" }` in an app's package.json keeps the IDE's workbench (ACRYL
  ADE) when the overlay is regenerated; without it the Blends frame roots the page, as before.

The framework's source now lives in the ACRYL repository (`acryldev/acryl`, folder `framework/`).
