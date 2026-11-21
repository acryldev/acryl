# @acryldev/blends 1.7.12

Released 2026-11-21.

## Added

- `acrylblends pack --from <dir> [--product "Name"] [--arch arm64|x64] [--out d]`: the app in a folder as an installer for this machine's OS (a DMG on
  macOS, an NSIS installer on Windows, a Debian package on Linux), made with the published packages. A Blend's own repository releases its product
  with it, without ACRYL's source; the installed app takes its updates from that repository's Latest release (the folder's GitHub `origin`).
  It is the packer ACRYL's own releases use (framework/scripts/pack-blank-mac.mjs), shipped in the package's `pack/` folder.
