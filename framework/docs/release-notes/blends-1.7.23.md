# @acryldev/blends 1.7.23

Released 2026-11-21. Everything in 1.7.22 (which was staged only), and:

## Fixed

- An installed app's Host finds its server plugin again: the generated `scripts/ide-host.mjs` uses `plugins/acryl-<id>` only when that old
  folder exists and `plugins/<id>` otherwise. The old fallback started installed products with no node server and a blank window
  (ACRYL Control Center v0.2.8).

## Added (from 1.7.22)

- Every app shows its versions: the Blend's own (`metadata.version` in blend.yaml) and the ACRYL Blends framework's, small at the end of the
  frame's top bar, and in Help > About and the macOS About panel after a packed app's own version; Electron's version is no longer shown as
  the app's. (@acryldev/blends-core 0.6.2, @acryldev/blends-frame 0.2.13, @acryldev/desktop-shell 0.1.9)
- `acrylblends pack` gives the packed app the higher of package.json's version and the Blend's, so the installer, Info.plist and the
  system's list of installed apps show it.
- A failed chat turn shows the provider's own sentence and a known fix, and a Claude sign-in authenticates the route it activates.
  (@acryldev/control 0.3.1, @acryldev/sign-in 0.2.3)
- One copy of @acryldev/control in an app: @acryldev/workspace 0.2.4, @acryldev/plugin-admin 0.2.2 and @acryldev/support 0.2.2 are built on
  control 0.3.1 (their earlier releases pinned 0.3.0, so an app carried both and the chat missed the plain failed-turn row), and
  @acryldev/blends-frame 0.2.14 on that workspace. An app made with 1.7.23 gets them through its `^` ranges.
