/** `acrylblends/node-server`: the Node adapter (`serve`, `createAdaptorServer`, ...), with `serveStatic` and `getConnInfo`, which upstream ships as subpaths too. */

export * from '../../../plugins/acryl-node-server/src/adapter/index.ts'
export { serveStatic, type ServeStaticOptions } from '../../../plugins/acryl-node-server/src/adapter/serve-static.ts'
export { getConnInfo } from '../../../plugins/acryl-node-server/src/adapter/conninfo.ts'
