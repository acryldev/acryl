# @acryldev/blends 1.7.28

Released 2026-11-22.

- **An installed app's top bar shows the version the OS shows**, and the app opens saved. The packer writes the product version (the one
  About and Installed apps show) into the packed blend.yaml and into the app's first commit, so ACRYL Control Center v0.2.13 reads
  "Blend 0.2.13 · ACRYL Blends 1.7.28" next to "v2 · saved" (0c2b3e53, 2ad82d3c).
- **An app in a WebBox carries the box's name.** `ACRYLBLENDS_NAME` names a folder app too (@acryldev/instance 0.1.3, 798ede84, 27d39709).
- **One copy of each @acryldev package in an app.** Packages published with an exact pin of an older sibling put a second copy beside the
  new one (instance 0.1.2 and 0.1.3, app-persistence 0.1.4 and 0.1.6, loopback-http 0.2.0 and 0.2.1). Republished on the current ones:
  agent-panel 0.1.2, app-settings 0.1.2, blends-frame 0.2.15, builder 0.1.3, coding-capabilities 0.1.1, desktop-shell 0.1.10,
  desktop-web 0.1.2, driver-acp 0.1.1, driver-pty 0.1.2, extensions 0.1.3, feedback 0.1.2, harness-runtime 0.2.13, plugin-context 0.1.2,
  plugin-hub 0.1.1, plugin-hub-core 0.2.4, plugin-share 0.1.7, showcase 0.1.2, tasks 0.1.2, versions 0.2.1.
- **The release gate refuses a second copy.** verify-scaffolder installs each template from npm and fails when `npm ls --all` shows an
  @acryldev package at two versions (scripts/lib/one-copy.mjs).

1.7.26 and 1.7.27 were staged under `next` only; this release carries both.
