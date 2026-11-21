# @acryldev/blends 1.7.24

Released 2026-11-21.

- **A Linux app's .deb is named after the product** (`acryl-control-center`, `acryl-ade`, `acryl-sde`, or your app's own name), not `blend`, so
  `apt install` and `dpkg -l` show what was installed and two apps no longer replace each other.
- **The .deb depends on the sound library** (`libasound2t64 | libasound2`): on Ubuntu 24.04 the app starts after `apt install` without a manual
  install of the library.
- `pack` ships `lib/deb.mjs` in the published package, which the two fixes need.

Proven: ACRYL Control Center packed with these files, `apt install` in an ubuntu:24.04 container, `dpkg -l acryl-control-center`, app started.

Also released: **@acryldev/plugin-share 0.1.6**. When GitHub refuses an anonymous pull for its rate limit (60 an hour per address, as in a workshop
room), the pull retries with the person's own `gh` login, and a refusal says to run `gh auth login` (0ac50ede; apps made with 1.7.23 already carry
this in their library copy).
