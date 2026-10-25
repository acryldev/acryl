import { createServer as createServerHTTP } from 'node:http'
import type { Server } from 'node:http'
import type { Http2SecureServer, Http2Server } from 'node:http2'
import type { Server as HttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { getRequestListener } from './listener.ts'
import type {
  HttpOptions,
  HttpsOptions,
  Http2Options,
  Options,
  SecureHttp2Options,
  ServerType,
} from './types.ts'
import { setupWebSocket } from './websocket.ts'

/** The interface `serve` listens on when `hostname` is not given: this machine only. Pass `hostname: '0.0.0.0'` to accept other machines. */
export const DEFAULT_HOSTNAME = '127.0.0.1'

export function createAdaptorServer(options: SecureHttp2Options): Http2SecureServer
export function createAdaptorServer(options: Http2Options): Http2Server
export function createAdaptorServer(options: HttpsOptions): HttpsServer
export function createAdaptorServer(options: HttpOptions): Server
export function createAdaptorServer(options: Options): ServerType
export function createAdaptorServer(options: Options): ServerType {
  const fetchCallback = options.fetch
  const requestListener = getRequestListener(fetchCallback, {
    hostname: options.hostname,
    overrideGlobalObjects: options.overrideGlobalObjects,
    autoCleanupIncoming: options.autoCleanupIncoming,
  })
  // ts will complain about createServerHTTP and createServerHTTP2 not being callable, which works just fine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createServer: any = options.createServer || createServerHTTP
  const server: ServerType = createServer(options.serverOptions || {}, requestListener)
  if (options.websocket && options.websocket.server) {
    if (options.websocket.server.options.noServer !== true)
      throw new Error('WebSocket server must be created with { noServer: true } option')
    setupWebSocket({ server, fetchCallback, wss: options.websocket.server })
  }
  return server
}

export function serve(options: SecureHttp2Options, listeningListener?: (info: AddressInfo) => void): Http2SecureServer
export function serve(options: Http2Options, listeningListener?: (info: AddressInfo) => void): Http2Server
export function serve(options: HttpsOptions, listeningListener?: (info: AddressInfo) => void): HttpsServer
export function serve(options: HttpOptions, listeningListener?: (info: AddressInfo) => void): Server
export function serve(options: Options, listeningListener?: (info: AddressInfo) => void): ServerType
export function serve(
  options: Options,
  listeningListener?: (info: AddressInfo) => void
): ServerType {
  const server = createAdaptorServer(options)
  server.listen(options?.port ?? 3000, options.hostname ?? DEFAULT_HOSTNAME, () => {
    const serverInfo = server.address() as AddressInfo
    listeningListener && listeningListener(serverInfo)
  })
  return server
}
