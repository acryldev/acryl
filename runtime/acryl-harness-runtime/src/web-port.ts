/**
 * The one boundary that decides which port the Web surface listens on, so several ACRYL instances (the main-branch app on 3080, a
 * feature branch from 3081) run side by side. Unset means the harness default. `ACRYL_WEB_PORT` is the port to start from: if it is
 * taken, the next ones are tried in turn, so a second instance just works. A set-but-invalid value fails loudly: silently falling
 * back to 3080 would collide with the very app the value was set to avoid.
 *
 * @module acryl-harness-runtime/web-port
 */

import { createServer } from 'node:net'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const HOST = '127.0.0.1'

export function webPortFromEnvironment(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.ACRYL_WEB_PORT?.trim()
  if (raw === undefined || raw === '') return undefined
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`ACRYL_WEB_PORT must be a port number from 1024 to 65535, got ${JSON.stringify(raw)}`)
  return port
}

/** The Loader patch that moves the web server to `port`, on the loopback address only. */
export function webPortPatch(port: number): PatchOptions {
  return { id: 'webserver', config: { host: HOST, port } }
}

/** How many consecutive ports are tried before giving up. */
export const WEB_PORT_ATTEMPTS = 32

/** Can something listen on this loopback port right now? A probe, so a race with another process is possible but narrow. */
export function loopbackPortIsFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen({ host: HOST, port, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

/** The first free port at or after `start`. `probe` is injectable so the scan is testable without sockets. */
export async function findFreeWebPort(start: number, probe: (port: number) => Promise<boolean> = loopbackPortIsFree, attempts = WEB_PORT_ATTEMPTS): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = start + offset
    if (port > 65_535) break
    if (await probe(port)) return port
  }
  throw new Error(`no free web port from ${String(start)} to ${String(Math.min(start + attempts - 1, 65_535))}; set ACRYL_WEB_PORT to another starting port`)
}
