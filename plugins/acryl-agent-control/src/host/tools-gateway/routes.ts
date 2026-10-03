/** The gateway's two faces: plain JSON and MCP over HTTP. Both are for an outside operator on this machine holding the instance secret. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isLoopbackAddress, readJsonBody } from 'acryl-loopback-http'
import { GatewayRequestError, parseGatewayCall, type GatewayCallResponse, type GatewayListResponse } from '../../tools-contract.ts'
import { tokenMatches } from '../online-route.ts'
import type { ToolsGateway } from './gateway.ts'

type ReportError = (operation: string, cause: unknown) => void

function authorized(req: IncomingMessage, secret: string): boolean {
  return isLoopbackAddress(req.socket.remoteAddress) && tokenMatches(req.headers.authorization, secret)
}

/** GET lists the tools; POST `{ name, arguments }` calls one. */
export async function handleToolsRequest(req: IncomingMessage, res: ServerResponse, secret: string, gateway: ToolsGateway, reportError: ReportError): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); return finishJson(res, 405, error('method not allowed')) }
  if (!authorized(req, secret)) return finishJson(res, 403, error('forbidden'))
  if (req.method === 'GET') return finishJson(res, 200, { ok: true, tools: gateway.list() } satisfies GatewayListResponse, 'GET')
  let call: ReturnType<typeof parseGatewayCall>
  try {
    call = parseGatewayCall(await readJsonBody(req))
  } catch (cause) {
    return finishJson(res, 400, { ok: false, code: 'invalid', message: cause instanceof GatewayRequestError ? cause.message : 'invalid request body' } satisfies GatewayCallResponse)
  }
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    return finishJson(res, 200, await gateway.call(call.name, call.arguments, controller.signal))
  } catch (cause) {
    reportError('run a gateway tool call', cause)
    return finishJson(res, 500, error('the call could not be run'))
  }
}

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const
const SERVER_INFO = { name: 'acryl', version: '1' } as const

interface JsonRpcRequest { readonly jsonrpc: '2.0'; readonly id?: string | number | null; readonly method: string; readonly params?: unknown }

function isRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === 'object' && value !== null && (value as { jsonrpc?: unknown }).jsonrpc === '2.0' && typeof (value as { method?: unknown }).method === 'string'
}

const rpcError = (id: JsonRpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/** One JSON-RPC message against the gateway; `undefined` for a notification (no answer owed). */
async function answer(message: JsonRpcRequest, gateway: ToolsGateway, signal: AbortSignal): Promise<Record<string, unknown> | undefined> {
  const isNotification = message.id === undefined
  switch (message.method) {
    case 'initialize': {
      const asked = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly unknown[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0]
      return { jsonrpc: '2.0', id: message.id ?? null, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO } }
    }
    case 'ping':
      return isNotification ? undefined : { jsonrpc: '2.0', id: message.id ?? null, result: {} }
    case 'tools/list':
      return { jsonrpc: '2.0', id: message.id ?? null, result: { tools: gateway.list() } }
    case 'tools/call': {
      let call: ReturnType<typeof parseGatewayCall>
      try {
        // MCP allows extra fields on params (`_meta`, a progress token); only `name` and `arguments` mean anything here.
        const params = typeof message.params === 'object' && message.params !== null ? message.params as Record<string, unknown> : {}
        call = parseGatewayCall({ name: params.name, ...(params.arguments === undefined ? {} : { arguments: params.arguments }) })
      } catch (cause) {
        return rpcError(message.id, -32602, cause instanceof GatewayRequestError ? cause.message : 'invalid params')
      }
      const outcome = await gateway.call(call.name, call.arguments, signal)
      if (!outcome.ok) return rpcError(message.id, -32602, outcome.message)
      return { jsonrpc: '2.0', id: message.id ?? null, result: { content: [{ type: 'text', text: outcome.text }], isError: outcome.isError } }
    }
    default:
      return isNotification ? undefined : rpcError(message.id, -32601, `method not found: ${message.method}`)
  }
}

/** MCP over streamable HTTP, request/response only: POST a JSON-RPC message, get its JSON answer (202 for a notification). No SSE stream is offered. */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, secret: string, gateway: ToolsGateway, reportError: ReportError): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  if (!authorized(req, secret)) return finishJson(res, 403, error('forbidden'))
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return finishJson(res, 400, rpcError(null, -32700, 'parse error'))
  }
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const messages = Array.isArray(body) ? body : [body]
    const answers: Record<string, unknown>[] = []
    for (const message of messages) {
      if (!isRequest(message)) { answers.push(rpcError(null, -32600, 'invalid request')); continue }
      const response = await answer(message, gateway, controller.signal)
      if (response !== undefined) answers.push(response)
    }
    if (answers.length === 0) { res.statusCode = 202; res.end(); return }
    return finishJson(res, 200, Array.isArray(body) ? answers : (answers[0] as object))
  } catch (cause) {
    reportError('answer an MCP request', cause)
    return finishJson(res, 500, rpcError(null, -32603, 'internal error'))
  }
}
