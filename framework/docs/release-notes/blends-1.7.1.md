# @acryldev/blends 1.7.1

- An app whose own scripts load the TypeScript hook from a differently named server plugin folder keeps it: the generated `dev` script now uses the
  same `--import .../src/register.ts` as the app's `start`. ACRYL Control Center and ACRYL ADE carry `plugins/acryl-node-server`, and their first
  start failed with `ERR_MODULE_NOT_FOUND` for `plugins/node-server/src/register.ts`.
