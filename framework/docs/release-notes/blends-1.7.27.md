# @acryldev/blends 1.7.27

Staged under `next` on 2026-11-22 and never made latest: an installed app opened with the version change as "1 unsaved". Use 1.7.28.

- **An installed app's top bar shows the version the OS shows.** The packer writes the product version (the one About and Installed apps
  show) into the packed blend.yaml, so ACRYL Control Center v0.2.13 reads "Blend 0.2.13 · ACRYL Blends 1.7.27" instead of the template's
  0.1.0 (0c2b3e53).
- **An app in a WebBox carries the box's name.** `ACRYLBLENDS_NAME` now names a folder app too (@acryldev/instance 0.1.3, 798ede84,
  27d39709). First staged as 1.7.26.
