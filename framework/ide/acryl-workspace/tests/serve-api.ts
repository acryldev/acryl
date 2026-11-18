/**
 * Serve workspace routes on a real loopback socket through the real HTTP adapter (`serve` from acryl-router-http), composed as the plugin
 * composes them (`privateApi`), so a test sees the peer, the port, the guard and the 405s a browser does.
 */

import { createServer, type Server } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'
import { apply as applyRouter, name as routerName } from 'acrylblends/cordis/router'
import { serve, type FetchRouter } from 'acrylblends/cordis/router-http'
import { privateApi } from '../src/private-route.ts'

export interface ServedApi {
  readonly port: number
  /** This server's own origin, the `Origin` the app's page sends. */
  readonly origin: string
  close(): Promise<void>
}

async function listen(router: FetchRouter, closeRouter: () => Promise<void> = async () => {}): Promise<ServedApi> {
  const server: Server = createServer((req, res) => { void serve(router, req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    port,
    origin: `http://127.0.0.1:${String(port)}`,
    close: async () => {
      await closeRouter()
      await new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => { resolve() })
      })
    },
  }
}

/** The routes as one app, served directly. */
export function serveApi(...routes: readonly Acryl[]): Promise<ServedApi> {
  const app = privateApi(...routes)
  return listen({ fetch: (request, connection) => Promise.resolve(app.fetch(request, { connection: connection ?? {} })) })
}

/** The routes mounted on the real `router` service, as the plugin mounts them; `unmount` removes the mount, as the plugin's unload does. */
export async function serveMounted(...routes: readonly Acryl[]): Promise<ServedApi & { unmount(): void }> {
  const root = new Context()
  root.plugin({ name: routerName, apply: applyRouter })
  await new Promise(resolve => setTimeout(resolve, 0))
  const unmount = root.router.route('/', privateApi(...routes))
  const served = await listen(root.router, () => root.fiber.dispose().then(() => {}))
  return { ...served, unmount }
}
