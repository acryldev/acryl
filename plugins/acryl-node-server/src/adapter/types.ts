import type {
  createServer,
  IncomingMessage,
  Server,
  ServerOptions as HttpServerOptions,
  ServerResponse as HttpServerResponse,
} from 'node:http'
import type {
  createSecureServer as createSecureHttp2Server,
  createServer as createHttp2Server,
  Http2ServerRequest,
  Http2Server,
  Http2ServerResponse,
  Http2SecureServer,
  SecureServerOptions as SecureHttp2ServerOptions,
  ServerOptions as Http2ServerOptions,
} from 'node:http2'
import type {
  createServer as createHttpsServer,
  ServerOptions as HttpsServerOptions,
} from 'node:https'
import type { WebSocketServerLike } from './websocket-types.ts'

export type HttpBindings = {
  incoming: IncomingMessage
  outgoing: HttpServerResponse
}

export type Http2Bindings = {
  incoming: Http2ServerRequest
  outgoing: Http2ServerResponse
}

export type FetchCallback = (
  request: Request,
  env: HttpBindings | Http2Bindings
) => Promise<unknown> | unknown

export type NextHandlerOption = {
  fetch: FetchCallback
}

export type ServerType = Server | Http2Server | Http2SecureServer

type createHttpOptions = {
  serverOptions?: HttpServerOptions
  createServer?: typeof createServer
}

type createHttpsOptions = {
  serverOptions?: HttpsServerOptions
  createServer?: typeof createHttpsServer
}

type createHttp2Options = {
  serverOptions?: Http2ServerOptions
  createServer?: typeof createHttp2Server
}

type createSecureHttp2Options = {
  serverOptions?: SecureHttp2ServerOptions
  createServer?: typeof createSecureHttp2Server
}

export type ServerOptions =
  | createHttpOptions
  | createHttpsOptions
  | createHttp2Options
  | createSecureHttp2Options

type BaseOptions = {
  fetch: FetchCallback
  overrideGlobalObjects?: boolean
  autoCleanupIncoming?: boolean
  port?: number
  /** The interface to listen on; `serve` uses `127.0.0.1` when it is not given. */
  hostname?: string
  websocket?: {
    server: WebSocketServerLike
  }
}

export type Options = BaseOptions & ServerOptions

/** Options for the default HTTP/1 server: `serve` and `createAdaptorServer` return an `http.Server`. */
export type HttpOptions = BaseOptions & createHttpOptions
/** Options naming `https.createServer`: an `https.Server`. */
export type HttpsOptions = BaseOptions & { serverOptions?: HttpsServerOptions, createServer: typeof createHttpsServer }
/** Options naming `http2.createServer`: an `Http2Server`. */
export type Http2Options = BaseOptions & { serverOptions?: Http2ServerOptions, createServer: typeof createHttp2Server }
/** Options naming `http2.createSecureServer`: an `Http2SecureServer`. */
export type SecureHttp2Options = BaseOptions & { serverOptions?: SecureHttp2ServerOptions, createServer: typeof createSecureHttp2Server }

export type CustomErrorHandler = (err: unknown) => void | Response | Promise<void | Response>
