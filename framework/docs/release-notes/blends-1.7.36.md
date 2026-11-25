# @acryldev/blends 1.7.36

Released 2026-11-25.

- **`acrylblends release-workflow`** writes `.github/workflows/release.yml` into an app (spec 052 T061, Share with team): a tag `v<version>` pushed to
  GitHub builds the app's installers (macOS arm64 and x64, Windows x64, Linux x64, with `acrylblends pack`) and publishes them as the repository's
  Latest release, the page to send to someone without git or Node. It is ACRYL Control Center's own release workflow without its Windows signing; the
  product name (from `blend.yaml`, or `--product`) reaches the shell only as `$PRODUCT`; an existing workflow is kept unless `--force`. Control
  Center's Share with team runs it for an app that has none.
