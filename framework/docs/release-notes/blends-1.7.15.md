# @acryldev/blends 1.7.15

Released 2026-11-21.

## Fixed

- The manifest accepts `metadata.from`, which create-blends 1.7.13 and newer write. Before, an app made from a Blend or a repository
  with those versions failed its own tests with "metadata.from: unknown field". (@acryldev/manifest 0.1.2, @acryldev/blends-core 0.6.1)
  An app made with 1.7.13 or 1.7.14 gets the fix with `npx acrylblends upgrade`.
