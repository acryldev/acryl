# @acryldev/blends 1.7.18

Released 2026-11-21.

## Added

- Cordis plugins share to every target: `plugin publish <name> --to npm` (with your own npm login), `plugin pull npm:<pkg>@<version>` and
  `plugin pull registry:<id>`; a pulled plugin updates in place to a newer release, keeping your edits (three-way merge; overlapping
  changes are refused and named). The Registry panel shows "Update to vX", and Share... offers Publish to npm.
  (@acryldev/plugin-share 0.1.4, @acryldev/door 0.1.2, @acryldev/blends-frame 0.2.11)
- See framework/docs/framework/guides/share-plugins.md.

## Fixed

- `acrylblends pack`: a product without its own `assets/icon.png` gets ACRYL Blends' icon again. The packer looked for it where only the
  source checkout has it, so electron-builder silently used Electron's own icon, and the new Linux tarball step failed (ACRYL ADE v0.2.3,
  ACRYL SDE v0.1.2). A missing icon now stops the pack with its reason.
