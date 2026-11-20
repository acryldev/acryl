# @acryldev/blends 1.7.5

Released 2026-11-20.

## Added

- An app's own icon. Settings > App > Icon takes any image (PNG, JPEG, SVG, WebP); the app keeps it as `assets/icon.png`. The browser tab
  shows it when the app runs on the web, the desktop window shows it on Windows and Linux, and the Dock on macOS from the window's next start.
  An app without one keeps the ACRYL Blends logo. New apps get it with this release (@acryldev/page 0.1.2, @acryldev/desktop-shell 0.1.4,
  @acryldev/blends-frame 0.2.4); an existing app gets it with `npx @acryldev/blends upgrade`.
