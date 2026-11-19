/**
 * `acrylblends/node-server`: the Node adapter (`serve`, `createAdaptorServer`, ...), with `serveStatic` and `getConnInfo`, which upstream ships as
 * subpaths too, and `clientModules` / `buildClientModules`, which serve client components to the browser without a bundler.
 * `UpgradeHub` is the WebSocket upgrade hub (needs the optional `ws` peer): `new UpgradeHub()`, `hub.attach(server, router)` and `hub.upgradeWebSocketFor(owner)`.
 */

export * from 'acryl-node-server/adapter'
export { serveStatic, type ServeStaticOptions } from 'acryl-node-server/serve-static'
export { testWebSocket, type TestSocket, type TestWebSocketOptions, type TestWebSocketResult } from 'acryl-node-server/test-websocket'
export { UpgradeEmitter, UpgradeHub, type Owner, type UpgradeHubOptions, type UpgradeRouter } from 'acryl-node-server/upgrade-hub'
export { buildClientModules, clientModules, type BuildClientModulesOptions, type ClientModulesOptions } from 'acryl-node-server/client-modules'
export { getConnInfo } from 'acryl-node-server/conninfo'
