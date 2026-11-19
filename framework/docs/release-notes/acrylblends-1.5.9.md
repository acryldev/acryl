# acrylblends 1.5.9

The workbench can open on a folder it is given: `acryl ade` started in a project shows that project.
Released with [create-acrylblends 1.5.9](create-1.5.9.md) and @acryldev/workspace 0.1.1 (frame/packages.json).

- **@acryldev/workspace takes `openFolder` in its row config.** The folder is added to the projects shown at start, and on a first start
  it is the first project instead of the app's own folder. ACRYL ADE sets it from `ACRYL_OPEN_FOLDER`, which `acryl ade` passes.

An app made with an earlier release gets these with `npx acrylblends upgrade`, then `npm install`.
