# @acryldev/blends 1.7.24

Released 2026-11-21.

- **A Linux app's .deb is named after the product** (`acryl-control-center`, `acryl-ade`, `acryl-sde`, or your app's own name), not `blend`, so
  `apt install` and `dpkg -l` show what was installed and two apps no longer replace each other.
- **The .deb depends on the sound library** (`libasound2t64 | libasound2`): on Ubuntu 24.04 the app starts after `apt install` without a manual
  install of the library.
- `pack` ships `lib/deb.mjs` in the published package, which the two fixes need.

Proven: ACRYL Control Center packed with these files, `apt install` in an ubuntu:24.04 container, `dpkg -l acryl-control-center`, app started.
