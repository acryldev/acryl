/**
 * The framework's standalone HTTP adapter (spec 046), the equivalent of Hono's `serve({ fetch })` from @hono/node-server. It owns one
 * `node:http` listener and hands every request to `ctx.router.fetch`, with the socket's peer address and local port as connection facts.
 * Use it in an app that runs without the ACRYL Host; inside the Host, `acryl-router-http` mounts prefixes on the Host's own web server.
 * One adapter per runtime: a plugin keeps asking `ctx.inject(['routerHttp'], ...)` for a mount, which simply never fires here, because this
 * adapter serves the whole router.
 *
 * A configured port that is taken is followed by the next free one, at most `scan` further ports; port 0 lets the system choose. Disposal ends
 * open streams, closes every connection and returns once the port is free.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { serve } from 'acryl-router-http'
import type {} from 'acryl-router'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-node-server'
export const inject = ['router']

export interface Config {
  hostname: string
  port: number
  scan: number
}

export const Config: z<Config> = z.object({
  hostname: z.string().default('127.0.0.1').description('Address to bind. Loopback by default; binding elsewhere exposes the app to the network.'),
  port: z.number().min(0).max(65535).default(0).description('Port to listen on; 0 lets the system choose. A taken port is followed by the next free one.'),
  scan: z.number().min(0).default(20).description('How many further ports to try when the configured one is taken.'),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    nodeServer: NodeServer
  }
}

export class NodeServer extends Service {
  readonly hostname: string
  private readonly server: Server
  private bound = 0

  constructor(ctx: Context, readonly config: Config) {
    super(ctx, 'nodeServer')
    this.hostname = config.hostname
    const router = ctx.router
    this.server = createServer((req, res) => { void serve(router, req, res) })
    ctx.effect(() => async () => {
      this.server.closeAllConnections()
      if (this.server.listening) await new Promise<void>(resolve => { this.server.close(() => { resolve() }) })
    }, 'acryl-node-server: close listener and open connections')
  }

  /** The port in use, 0 before the server listens. */
  get port(): number {
    return this.bound
  }

  /** The address clients use. */
  get url(): string {
    return `http://${this.hostname.includes(':') ? `[${this.hostname}]` : this.hostname}:${String(this.bound)}`
  }

  /** Bind, scanning past taken ports. */
  async listen(): Promise<void> {
    const { port, scan, hostname } = this.config
    const last = port === 0 ? 0 : Math.min(65535, port + scan)
    for (let candidate = port; candidate <= last; candidate += 1) {
      try {
        await new Promise<void>((resolve, reject) => {
          const onError = (error: Error): void => { reject(error) }
          this.server.once('error', onError)
          this.server.listen(candidate, hostname, () => { this.server.off('error', onError); resolve() })
        })
        this.bound = (this.server.address() as AddressInfo).port
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error(`acryl-node-server: no free port from ${String(port)} to ${String(last)} on ${hostname}`)
  }
}

/** Loads once the server listens, so a plugin that injects `nodeServer` can rely on `url`. A failure to bind fails the plugin. */
export async function apply(ctx: Context, config: Partial<Config> = {}): Promise<void> {
  const server = new NodeServer(ctx, { hostname: '127.0.0.1', port: 0, scan: 20, ...config })
  await server.listen()
}
