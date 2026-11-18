/**
 * `acrylblends/node-server`: the Node adapter (`serve`, `createAdaptorServer`, ...), with `serveStatic` and `getConnInfo`, which upstream ships as
 * subpaths too, and `clientModules` / `buildClientModules`, which serve client components to the browser without a bundler.
 * `UpgradeHub` is the WebSocket upgrade hub (needs the optional `ws` peer): `new UpgradeHub()`, `hub.attach(server, router)` and `hub.upgradeWebSocketFor(owner)`.
 */

export * from '../../../plugins/acryl-node-server/src/adapter/index.ts'
export { serveStatic, type ServeStaticOptions } from '../../../plugins/acryl-node-server/src/adapter/serve-static.ts'
export { getConnInfo } from '../../../plugins/acryl-node-server/src/adapter/conninfo.ts'
export { buildClientModules, clientModules, type BuildClientModulesOptions, type ClientModulesOptions } from '../../../plugins/acryl-node-server/src/client-modules.ts'
export { UpgradeEmitter, UpgradeHub, type Owner, type UpgradeHubOptions, type UpgradeRouter } from '../../../plugins/acryl-node-server/src/upgrade-hub.ts'
export { testWebSocket, type TestSocket, type TestWebSocketOptions, type TestWebSocketResult } from '../../../plugins/acryl-node-server/src/test-websocket.ts'
