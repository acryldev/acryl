/** `serve()` beyond upstream: it listens on this machine only unless told otherwise, and its return type follows the server it creates. */
import { createServer as createHttpServer, type Server } from 'node:http'
import { createSecureServer, createServer as createHttp2Server, type Http2SecureServer, type Http2Server } from 'node:http2'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { createAdaptorServer, serve } from '../src/adapter/server.ts'
import type { Options, ServerType } from '../src/adapter/types.ts'

const fetch = (): Response => new Response('ok')
const servers: ServerType[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => { server.close(() => { resolve() }) })
})

const listening = (server: ServerType): Promise<AddressInfo> => new Promise(resolve => {
  servers.push(server)
  server.once('listening', () => { resolve(server.address() as AddressInfo) })
})

describe('serve() hostname', () => {
  it('listens on 127.0.0.1 when no hostname is given, so a development server is not reachable from the network', async () => {
    const address = await listening(serve({ fetch, port: 0 }))
    expect(address.address).toBe('127.0.0.1')
    expect(await (await globalThis.fetch(`http://127.0.0.1:${String(address.port)}/`)).text()).toBe('ok')
  })

  it('listens on every interface when asked with hostname 0.0.0.0', async () => {
    const address = await listening(serve({ fetch, port: 0, hostname: '0.0.0.0' }))
    expect(address.address).toBe('0.0.0.0')
  })

  it('hands the listening listener the loopback address', async () => {
    const info = await new Promise<AddressInfo>(resolve => { servers.push(serve({ fetch, port: 0 }, resolve)) })
    expect(info.address).toBe('127.0.0.1')
  })
})

describe('serve() and createAdaptorServer() types', () => {
  it('returns an http.Server for the default HTTP/1 call, so its connection methods type-check', async () => {
    const server = serve({ fetch, port: 0 })
    expectTypeOf(server).toEqualTypeOf<Server>()
    await listening(server)
    server.closeIdleConnections()
    expectTypeOf(serve({ fetch, port: 0, createServer: createHttpServer, serverOptions: { keepAliveTimeout: 1000 } })).toEqualTypeOf<Server>()
    servers.push(createAdaptorServer({ fetch }))
    expectTypeOf(createAdaptorServer({ fetch })).toEqualTypeOf<Server>()
  })

  it('keeps the https and HTTP/2 server types, and the union for options typed as the union', () => {
    // Types only: these servers need certificates to listen, and are never created.
    const types = (options: Options): void => {
      expectTypeOf(serve({ fetch, createServer: createHttpsServer, serverOptions: { key: '', cert: '' } })).toEqualTypeOf<HttpsServer>()
      expectTypeOf(serve({ fetch, createServer: createHttp2Server })).toEqualTypeOf<Http2Server>()
      expectTypeOf(serve({ fetch, createServer: createSecureServer, serverOptions: { allowHTTP1: true } })).toEqualTypeOf<Http2SecureServer>()
      expectTypeOf(createAdaptorServer({ fetch, createServer: createSecureServer })).toEqualTypeOf<Http2SecureServer>()
      expectTypeOf(serve(options)).toEqualTypeOf<ServerType>()
    }
    expect(typeof types).toBe('function')
  })
})
