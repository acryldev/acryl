# @acryldev/blends 1.7.15

Released 2026-11-21.

## Fixed

- The manifest accepts `metadata.from`, which create-blends 1.7.13 and newer write. Before, an app made from a Blend or a repository
  with those versions failed its own tests with "metadata.from: unknown field". (@acryldev/manifest 0.1.2, @acryldev/blends-core 0.6.1)
  An app made with 1.7.13 or 1.7.14 gets the fix with `npx acrylblends upgrade`.
- A product packed from a Blend's own repository starts saved: its `.github` (the repository's release workflow) is left out of the person's app,
  so a fresh install no longer shows "v2 · 1 unsaved" (7336fee4).

## Added

- Arch Linux and Omarchy. On Linux, `acrylblends pack` also writes a portable `<Product>-linux-<arch>.tar.gz`: the app under `lib/`, a launcher
  that lets Electron pick Wayland or X11 (`--ozone-platform-hint=auto`), a menu entry, the icon and the app's licence. The new
  `acrylblends pkgbuild --dir <d> --product "Name" --version x.y.z --repo owner/name` writes the `PKGBUILD` that installs a release's tarballs
  in /opt with `makepkg -si`. Proven in an Arch Linux container: makepkg, namcap, pacman -U with every dependency resolved, and the app started
  under Xvfb and served its page.
