/** The gateway's two faces: plain JSON and MCP over HTTP. Both are for an outside operator on this machine holding the instance secret. */

import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { GatewayRequestError, MCP_PATH, TOOLS_PATH, parseGatewayCall, type GatewayCallResponse, type GatewayListResponse } from '../../tools-contract.ts'
import { INVALID_JSON, jsonBody, operatorOnly, readJson, type ReportError } from '../http.ts'
import type { ToolsGateway } from './gateway.ts'

/** GET lists the tools; POST `{ name, arguments }` calls one. A caller that goes away aborts the call through the request's signal. */
export function toolsRoutes(secret: string, gateway: ToolsGateway, reportError: ReportError): Acryl {
  const operator = operatorOnly(secret)
  return new Acryl()
    .get(TOOLS_PATH, operator, c => c.json({ ok: true, tools: gateway.list() } satisfies GatewayListResponse))
    .post(TOOLS_PATH, operator, jsonBody(), async (c) => {
      const invalid = (message: string) => c.json({ ok: false, code: 'invalid', message } satisfies GatewayCallResponse, 400)
      const body = await readJson(c)
      if (body === INVALID_JSON) return invalid('invalid request body')
      let call: ReturnType<typeof parseGatewayCall>
      try {
        call = parseGatewayCall(body)
      } catch (cause) {
        return invalid(cause instanceof GatewayRequestError ? cause.message : 'invalid request body')
      }
      try {
        return c.json(await gateway.call(call.name, call.arguments, c.req.raw.signal))
      } catch (cause) {
        reportError('run a gateway tool call', cause)
        return c.json(error('the call could not be run'), 500)
      }
    })
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
export function mcpRoutes(secret: string, gateway: ToolsGateway, reportError: ReportError): Acryl {
  return new Acryl().post(MCP_PATH, operatorOnly(secret), jsonBody(), async (c) => {
    const body = await readJson(c)
    if (body === INVALID_JSON) return c.json(rpcError(null, -32700, 'parse error'), 400)
    try {
      const messages = Array.isArray(body) ? body : [body]
      const answers: Record<string, unknown>[] = []
      for (const message of messages) {
        if (!isRequest(message)) { answers.push(rpcError(null, -32600, 'invalid request')); continue }
        const response = await answer(message, gateway, c.req.raw.signal)
        if (response !== undefined) answers.push(response)
      }
      if (answers.length === 0) return c.body(null, 202)
      return c.json(Array.isArray(body) ? answers : (answers[0] as object))
    } catch (cause) {
      reportError('answer an MCP request', cause)
      return c.json(rpcError(null, -32603, 'internal error'), 500)
    }
  })
}
