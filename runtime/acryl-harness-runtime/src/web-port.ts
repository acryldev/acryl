/**
 * Finding and applying the Web port of an app. Which port an app starts from is part of its instance family (`instance/`, which also reads
 * `ACRYL_WEB_PORT`); this module only scans for a free loopback port from there and turns it into the web server's Loader patch.
 *
 * @module acryl-harness-runtime/web-port
 */

import { createServer } from 'node:net'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const HOST = '127.0.0.1'

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
