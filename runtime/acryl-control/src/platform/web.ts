/**
 * The web port of the ACRYL platform: what ACRYL's own Host plugins need from "the thing that serves the page", in plain `node:http` terms and
 * nothing else. Plugins inject `acrylWeb`, never a DeepSeek Harness service, so the carrier behind it can change (DSH's web server today, an
 * ACRYL-owned one later) without touching them. The provider is an adapter in the engine seam (`acryl-harness-runtime`).
 *
 * @module acryl-control/platform/web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

/** One HTTP route. `exact` matches the pathname verbatim; `prefix` matches the path and everything below it. */
export interface AcrylWebRoute {
  readonly kind: 'exact' | 'prefix'
  /** Absolute pathname, no trailing slash. */
  readonly path: string
  /** Owns the whole response (it may hold it open). */
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** One exact-path HTTP upgrade (a WebSocket route). */
export interface AcrylWebUpgrade {
  readonly path: string
  /** Owns the protocol negotiation and the upgraded socket. */
  readonly handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
}

export interface AcrylWeb {
  /** The address the carrier is bound to. ACRYL's plugins refuse anything but loopback. */
  readonly host: string
  /** The listening port (the OS-assigned one when it was configured as zero). */
  readonly port: number
  /** @returns the disposer that removes exactly this route. A duplicate route is an error. */
  register(route: AcrylWebRoute): () => void
  /** @returns the disposer that removes exactly this upgrade. A duplicate path is an error. */
  registerUpgrade(route: AcrylWebUpgrade): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrylWeb: AcrylWeb
  }
}
