# create-acrylblends 1.5.7

Asks for [acrylblends 1.5.7](acrylblends-1.5.7.md).

- **`npm create @acryldev/blends@latest my-app -- --from <registry id>` finishes for every registry Blend.** `acrylblends.chat`,
  `acrylblends.agent` and `acrylblends.notes-desktop` were made but not put in the frame ("src/app.ts ... is not the previous release's
  scaffold"): create mounted sharing into `src/app.ts` before the upgrade, which then no longer recognized the file. The upgrade now runs
  first, and sharing is mounted after it.
