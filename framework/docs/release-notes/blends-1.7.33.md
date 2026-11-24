# @acryldev/blends 1.7.33

Released 2026-11-24.

- **The Dock and Cmd+Tab name a desktop app as its window does** (`@acryldev/desktop-shell` 0.1.14, carried in the library). An app opened from
  Applications (macOS) ran the branded Electron under its package's name ("notes"), while the window said its Blend's name ("Notes"). The branded
  Electron is now named by the instance: the Blend's name in `blend.yaml`, else the package's, or `ACRYLBLENDS_NAME`. A new app gets desktop-shell
  0.1.14; an app made before runs `npm install @acryldev/desktop-shell@0.1.14`.
