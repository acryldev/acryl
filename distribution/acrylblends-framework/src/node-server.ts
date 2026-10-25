/**
 * `acrylblends/node-server`: the Node adapter (`serve`, `createAdaptorServer`, ...), with `serveStatic` and `getConnInfo`, which upstream ships as
 * subpaths too, and `clientModules` / `buildClientModules`, which serve client components to the browser without a bundler.
 */

export * from '../../../plugins/acryl-node-server/src/adapter/index.ts'
export { serveStatic, type ServeStaticOptions } from '../../../plugins/acryl-node-server/src/adapter/serve-static.ts'
export { getConnInfo } from '../../../plugins/acryl-node-server/src/adapter/conninfo.ts'
export { buildClientModules, clientModules, type BuildClientModulesOptions, type ClientModulesOptions } from '../../../plugins/acryl-node-server/src/client-modules.ts'
