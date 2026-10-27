/** Desktop-owned loopback WebServer wrapper with bounded bind-conflict retry. */

import { Service } from '@deepseek-ai/cordis'
import WebServer, { type Config } from '@deepseek-ai/dsh-host-webserver'
import { bindDesktopPort } from './desktop-port.ts'

/** Close an unbound server left behind by a failed listen attempt. */
function closeFailedServer(instance: unknown): void {
  const server = (instance as { server?: { close?: (callback?: (error?: Error) => void) => void } } | null)?.server
  if (typeof server?.close !== 'function') return
  try {
    server.close(() => {})
  } catch {
    // The failed server is already unbound; preserve the original bind error.
  }
}

/** Reuse the upstream WebServer while retrying only real bind collisions. */
export class DesktopWebServer extends WebServer {
  static override Config = WebServer.Config

  private readonly desktopConfig: Config

  constructor(ctx: ConstructorParameters<typeof WebServer>[0], config: Config) {
    if (config.host !== '127.0.0.1') {
      throw new Error('acryl-desktop: Desktop WebServer requires a loopback host')
    }
    super(ctx, config)
    this.desktopConfig = config
  }

  override async [Service.init](): Promise<void> {
    const requestedPort = this.desktopConfig.port
    if (requestedPort === 0) {
      await super[Service.init]()
      return
    }
    await bindDesktopPort(requestedPort, async (port) => {
      this.desktopConfig.port = port
      try {
        await super[Service.init]()
      } catch (cause) {
        closeFailedServer(this)
        throw cause
      }
    })
  }
}

export default DesktopWebServer
