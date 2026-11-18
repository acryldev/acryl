/**
 * The door over MCP: `POST <prefix>/mcp`, streamable HTTP in its request/response form (one JSON-RPC message or a batch in, its JSON
 * answer out, 202 for notifications only; no event stream is offered). Each verb is one tool, named as the verb, with the arguments the
 * operator client sends. The same guard as the operator's routes: loopback, this run's secret.
 */

import { Acryl } from 'acryl-router'
import { UiControlError } from '../page/protocol.ts'
import type { Door } from './door.ts'
import { DoorError } from './door.ts'
import { INVALID_JSON, jsonBody, operatorOnly, readJson, type ReportError } from './http.ts'
import { VERB_SPECS, VERBS, type Verb } from './verbs.ts'

const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const
const SERVER_INFO = { name: 'acryl-door', version: '1' } as const

interface JsonRpcRequest { readonly jsonrpc: '2.0'; readonly id?: string | number | null; readonly method: string; readonly params?: unknown }

function isRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === 'object' && value !== null && (value as { jsonrpc?: unknown }).jsonrpc === '2.0' && typeof (value as { method?: unknown }).method === 'string'
}

const rpcError = (id: JsonRpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const result = (id: JsonRpcRequest['id'], value: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result: value })

/** The verbs as MCP tools. */
export function mcpTools(): Array<{ name: Verb; description: string; inputSchema: unknown }> {
  return VERBS.map(verb => ({ name: verb, description: VERB_SPECS[verb].description, inputSchema: VERB_SPECS[verb].arguments }))
}

const isVerb = (name: unknown): name is Verb => typeof name === 'string' && (VERBS as readonly string[]).includes(name)

/** One JSON-RPC message; `undefined` for a notification (no answer owed). */
async function answer(message: JsonRpcRequest, door: Door, signal: AbortSignal): Promise<Record<string, unknown> | undefined> {
  const isNotification = message.id === undefined
  switch (message.method) {
    case 'initialize': {
      const asked = (message.params as { protocolVersion?: unknown } | undefined)?.protocolVersion
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly unknown[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0]
      return result(message.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO })
    }
    case 'ping':
      return isNotification ? undefined : result(message.id, {})
    case 'tools/list':
      return result(message.id, { tools: mcpTools() })
    case 'tools/call': {
      // MCP allows extra fields on params (`_meta`, a progress token); only `name` and `arguments` mean anything here.
      const params = typeof message.params === 'object' && message.params !== null ? message.params as Record<string, unknown> : {}
      if (!isVerb(params.name)) return rpcError(message.id, -32602, `unknown tool ${JSON.stringify(params.name)}; the tools are ${VERBS.join(', ')}`)
      try {
        const verbAnswer = await door.run(params.name, params.arguments ?? {}, signal)
        return result(message.id, { content: [{ type: 'text', text: verbAnswer.text }], structuredContent: { value: verbAnswer.value }, isError: false })
      } catch (cause) {
        // A verb that failed is a tool result the model reads, with the same code the operator client prints.
        if (cause instanceof DoorError || cause instanceof UiControlError) return result(message.id, { content: [{ type: 'text', text: `${cause.code}: ${cause.message}` }], isError: true })
        throw cause
      }
    }
    default:
      return isNotification ? undefined : rpcError(message.id, -32601, `method not found: ${message.method}`)
  }
}

export function mcpRoutes(prefix: string, secret: string, door: Door, reportError: ReportError): Acryl {
  return new Acryl().post(`${prefix}/mcp`, operatorOnly(secret), jsonBody, async (c) => {
    const body = await readJson(c)
    if (body === INVALID_JSON) return c.json(rpcError(null, -32700, 'parse error'), 400)
    try {
      const messages = Array.isArray(body) ? body : [body]
      const answers: Record<string, unknown>[] = []
      for (const message of messages) {
        if (!isRequest(message)) { answers.push(rpcError(null, -32600, 'invalid request')); continue }
        const response = await answer(message, door, c.req.raw.signal)
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
