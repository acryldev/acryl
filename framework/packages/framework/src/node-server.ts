/**
 * `acrylblends/node-server`: the Node adapter (`serve`, `createAdaptorServer`, ...), with `serveStatic` and `getConnInfo`, which upstream ships as
 * subpaths too, and `clientModules` / `buildClientModules`, which serve client components to the browser without a bundler.
 * `UpgradeHub` is the WebSocket upgrade hub (needs the optional `ws` peer): `new UpgradeHub()`, `hub.attach(server, router)` and `hub.upgradeWebSocketFor(owner)`.
 */

export * from '@acryldev/node-server/adapter'
export { serveStatic, type ServeStaticOptions } from '@acryldev/node-server/serve-static'
export { testWebSocket, type TestSocket, type TestWebSocketOptions, type TestWebSocketResult } from '@acryldev/node-server/test-websocket'
export { UpgradeEmitter, UpgradeHub, type Owner, type UpgradeHubOptions, type UpgradeRouter } from '@acryldev/node-server/upgrade-hub'
export { buildClientModules, clientModules, type BuildClientModulesOptions, type ClientModulesOptions } from '@acryldev/node-server/client-modules'
export { getConnInfo } from '@acryldev/node-server/conninfo'
