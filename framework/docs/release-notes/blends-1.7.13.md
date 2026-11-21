# @acryldev/blends 1.7.13

Released 2026-11-21.

## Changed

- `acrylblends update` brings in the newer release of what the app was made from, as recorded in `blend.yaml` `metadata.from` (written by
  @acryldev/create-blends 1.7.13): a Blend from the registry (its newer version) or a shared GitHub repository (its newest `vX.Y.Z` tag). Your own
  changes are kept (a git merge); when you and the release changed the same lines, nothing is changed and the files are named.
  Before, update looked up the app's own id, which create renames to `acrylblends.<name>`, so an app made from the store or from a repository
  never found its updates.
