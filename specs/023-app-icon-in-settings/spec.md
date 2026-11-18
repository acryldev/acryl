# 023 App icon in Settings

Status: ticket, not started. Requested by the owner 2026-11-18: "upload/update icon via Acryl Blends settings to set new icon that goes to source of the blends app".

## What the person can do

In a running Blends app, Settings > App > Icon shows the app's icon. They can:

- upload a new image (PNG, JPEG, SVG or WebP), see it previewed, and keep it;
- go back to the default ACRYL Blends logo.

The new icon is part of the app's source, so it travels with the app: a save point, a share to GitHub, a clone, the next packed installer (Dock, Finder, the Windows installer, About) and the Control Center card all show it.

## Where it lives today

- The icon is the app's own `assets/icon.png`, else the ACRYL Blends logo (`plugins/desktop/brand.ts`, `iconFile`).
- The packer uses the same file for the installed app (`scripts/pack-blank-mac.mjs`, around line 413).
- There is no screen to change it: a person replaces the file by hand.

## Acceptance

1. Upload in Settings writes `assets/icon.png` (converted and squared to 1024x1024; transparent padding, never stretched) and the change shows up as an unsaved change of the app, like any edit.
2. A running desktop window and the Dock pick up the new icon without a restart; the web page favicon follows it.
3. "Use the default" removes `assets/icon.png`.
4. A file that is not an image, or larger than 5 MB, is refused with a plain message; nothing is written.
5. Packing the app after the change gives an installer with the new icon on macOS, Windows and Linux.
6. The Control Center card for the app shows the icon instead of the letter tile.

## Open questions

- Which settings section: Settings > App (where the app's name is) or Settings > General.
- Whether the conversion happens on the Host (sharp, or the platform's own tool) or the page sends an already squared PNG from a canvas. The canvas route needs no new dependency.
