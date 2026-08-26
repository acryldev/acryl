/** Host-neutral local control endpoint with generation and capability negotiation. */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import { createServer as createNetServer, type Server as NetServer, type Socket } from 'node:net'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { unlink } from 'node:fs/promises'
import {
  ACRYL_CONTROL_PROTOCOL_VERSION,
  type ControlCapability,
  type ControlEndpoint,
} from '../contracts/control-protocol.ts'

const DEFAULT_MAX_BODY_BYTES = 64 * 1024

export interface ControlRequest {
  readonly generationId: string
  readonly operation: string
  readonly payload: unknown
}

export interface ControlRequestHandler {
  (operation: string, payload: unknown): Promise<unknown>
}

export interface AcrControlProtocolBootstrap {
  readonly endpoint: ControlEndpoint
  readonly generationId: string
  readonly capabilities: readonly ControlCapability[]
  readonly handle: ControlRequestHandler
  readonly maxBodyBytes?: number
}

export interface AcrControlProtocol {
  readonly generationId: string
  readonly capabilities: readonly ControlCapability[]
  readonly endpoint: ControlEndpoint
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acrControlProtocol: AcrControlProtocol
  }
}

export type ControlProtocolErrorCode =
  | 'invalid-request'
  | 'body-too-large'
  | 'generation-mismatch'
  | 'unknown-capability'
  | 'not-found'

interface HandleOutcome {
  readonly status: number
  readonly body: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializeSuccess(operation: string, result: unknown): string {
  return `${JSON.stringify({
    schemaVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
    ok: true,
    operation,
    result: result ?? null,
  })}\n`
}

function serializeFailure(code: ControlProtocolErrorCode | string, message: string): string {
  return `${JSON.stringify({
    schemaVersion: ACRYL_CONTROL_PROTOCOL_VERSION,
    ok: false,
    operation: '',
    error: { code, message, retryable: false },
  })}\n`
}

function statusOf(code: ControlProtocolErrorCode | string): number {
  switch (code) {
    case 'body-too-large': return 413
    case 'generation-mismatch': return 409
    case 'unknown-capability': return 404
    case 'invalid-request': return 400
    default: return 500
  }
}

export class AcrControlProtocolService extends Service implements AcrControlProtocol {
  readonly generationId: string
  readonly capabilities: readonly ControlCapability[]
  readonly endpoint: ControlEndpoint
  private readonly handle: ControlRequestHandler
  private readonly maxBodyBytes: number
  private readonly sockets = new Set<Socket>()
  private server: NetServer | HttpServer | undefined

  constructor(ctx: Context, bootstrap: AcrControlProtocolBootstrap) {
    super(ctx, 'acrControlProtocol')
    this.generationId = bootstrap.generationId
    this.capabilities = Object.freeze([...bootstrap.capabilities])
    this.endpoint = bootstrap.endpoint
    this.handle = bootstrap.handle
    this.maxBodyBytes = bootstrap.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES

    ctx.effect(() => {
      this.server = this.startServer()
      return async () => {
        await this.closeServer()
      }
    }, 'acryl-control: control protocol endpoint')
  }

  private async handleRequestLine(raw: string): Promise<HandleOutcome> {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      return { status: 400, body: serializeFailure('invalid-request', 'control request is not valid JSON') }
    }
    if (!isRecord(value) || typeof value.generationId !== 'string' || typeof value.operation !== 'string') {
      return { status: 400, body: serializeFailure('invalid-request', 'control request shape is invalid') }
    }
    if (value.generationId !== this.generationId) {
      return {
        status: 409,
        body: serializeFailure('generation-mismatch', 'control generation does not match the live host'),
      }
    }
    if (!this.capabilities.includes(value.operation as ControlCapability)) {
      return {
        status: 404,
        body: serializeFailure('unknown-capability', `unknown control capability ${value.operation}`),
      }
    }
    try {
      const result = await this.handle(value.operation, value.payload ?? null)
      return { status: 200, body: serializeSuccess(value.operation, result) }
    } catch (cause) {
      const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
        ? cause.code
        : 'not-found'
      return {
        status: statusOf(code),
        body: serializeFailure(code, cause instanceof Error ? cause.message : String(cause)),
      }
    }
  }

  private startServer(): NetServer | HttpServer {
    return this.endpoint.kind === 'loopback-http' ? this.startHttpServer() : this.startSocketServer()
  }

  private startSocketServer(): NetServer {
    const server = createNetServer((socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        if (buffer.length > this.maxBodyBytes) {
          socket.write(serializeFailure('body-too-large', 'control request exceeds the size limit'))
          socket.end()
          return
        }
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        void this.handleRequestLine(line).then((outcome) => {
          socket.write(outcome.body)
        })
      })
    })
    server.listen(this.endpoint.address)
    return server
  }

  private startHttpServer(): HttpServer {
    return createHttpServer((req, res) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size <= this.maxBodyBytes) chunks.push(chunk)
      })
      req.on('end', () => {
        if (size > this.maxBodyBytes) {
          const outcome: HandleOutcome = {
            status: 413,
            body: serializeFailure('body-too-large', 'control request exceeds the size limit'),
          }
          res.writeHead(outcome.status, { 'content-type': 'application/json' })
          res.end(outcome.body)
          return
        }
        const body = Buffer.concat(chunks).toString('utf8')
        void this.handleRequestLine(body).then((outcome) => {
          res.writeHead(outcome.status, { 'content-type': 'application/json' })
          res.end(outcome.body)
        })
      })
    }).listen(this.endpoint.address)
  }

  private async closeServer(): Promise<void> {
    const server = this.server
    this.server = undefined
    if (server === undefined) return
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
    if (this.endpoint.kind === 'unix') {
      await unlink(this.endpoint.address).catch(() => undefined)
    }
  }
}

export default AcrControlProtocolService
