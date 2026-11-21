# @acryldev/blends 1.7.22

Released 2026-11-21.

## Added

- Every app shows its versions: the Blend's own (`metadata.version` in blend.yaml, which you raise as you change the app) and the ACRYL Blends
  framework's, small at the end of the frame's top bar. Help > About (Windows, Linux) and the macOS About panel show the same, after a packed
  app's own version; Electron's version is no longer shown as the app's. (@acryldev/blends-core 0.6.2, @acryldev/blends-frame 0.2.13,
  @acryldev/desktop-shell 0.1.9)
- `acrylblends pack` gives the packed app the higher of package.json's version and the Blend's, so the installer, Info.plist and the
  system's list of installed apps show it.

## Fixed

- A failed chat turn shows the provider's own sentence and a known fix in a plain row, and a Claude sign-in authenticates the route it
  activates. (@acryldev/control 0.3.1, @acryldev/sign-in 0.2.3)
