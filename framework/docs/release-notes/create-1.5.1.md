# create-acrylblends 1.5.1

Asks for [acrylblends 1.5.1](acrylblends-1.5.1.md).

- `pnpm create acrylblends my-app` installs and starts the app in the ACRYL frame: the new app's `pnpm-workspace.yaml` carries the flat layout and the
  builds the frame needs. Before, pnpm 11 and later stopped the install with `ERR_PNPM_IGNORED_BUILDS`.
