/**
 * The tool gateway through the real, built plugin: the extension tools offered to agents that are not the DSH chat, as plain JSON and as MCP over
 * HTTP, both behind the instance secret and an allowlist. The registry behind it is a small real-shaped one (definitions with JSON-Schema parameters,
 * `execute` returning the content a real tool returns); the real registry and real tools are exercised in the runtime's own tests.
 */
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/host/config.ts'
import { DEFAULT_EXPOSED_TOOLS, MCP_PATH, TOOLS_PATH, parseGatewayCall } from '../../src/tools-contract.ts'

const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

let server: Server | undefined
let port = 0
const roots: string[] = []
afterEach(async () => {
  if (server !== undefined) { await new Promise<void>(resolve => { server?.close(() => { resolve() }) }); server = undefined }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fakeWebServer() {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()
  server?.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const handler = req.url !== undefined ? routes.get(req.url.split('?')[0] ?? '') : undefined
    if (handler !== undefined) handler(req, res)
    else { res.statusCode = 404; res.end('{}') }
  })
  return {
    host: '127.0.0.1',
    port,
    register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => { routes.set(route.path, route.handler as never); return () => { routes.delete(route.path) } },
    registerUpgrade: () => () => {},
  }
}

const definitions = new Map<string, { name: string; description: string; parameters: object }>([
  ['acryl_list_plugins', { name: 'acryl_list_plugins', description: 'List plugins', parameters: { type: 'object', properties: {} } }],
  ['acryl_install_plugin', { name: 'acryl_install_plugin', description: 'Install a plugin', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }],
  ['bash', { name: 'bash', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } } } }],
])
const executed: Array<{ name: string; arguments: unknown }> = []
const fakeTools = {
  get: (name: string) => definitions.get(name),
  register: () => () => {},
  policy: () => () => {},
  async execute(input: { name: string; arguments: unknown }) {
    executed.push({ name: input.name, arguments: input.arguments })
    if (input.name === 'acryl_install_plugin') return { isError: true, content: [{ type: 'text', text: 'Error: nope' }] }
    return { content: [{ type: 'text', text: `${input.name} ran` }] }
  },
}

async function mount(config: unknown): Promise<{ fiber: { dispose(): Promise<void> }; home: string; secret: string | undefined }> {
  server = createServer()
  await new Promise<void>(resolve => { server?.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  const home = mkdtempSync(join(tmpdir(), 'acryl-agent-control-gateway-'))
  roots.push(home)
  executed.length = 0
  const ctx = new Context()
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('acrylWeb' as never, fakeWebServer() as never)
  ctx.provide('acrylTools' as never, fakeTools as never)
  const module = await import(BUILT_ENTRY) as { apply(ctx: Context, config?: unknown): void }
  const fiber = ctx.plugin({ name: 'acryl-agent-control', inject: ['acrylWeb', 'acrylTools', 'appInstance'], apply: module.apply }, config)
  await new Promise(resolve => { setTimeout(resolve, 50) })
  const secretPath = join(home, 'agent-control-secret')
  return { fiber: fiber as unknown as { dispose(): Promise<void> }, home, secret: existsSync(secretPath) ? readFileSync(secretPath, 'utf8').trim() : undefined }
}

function send(method: string, path: string, body: unknown, token?: string): Promise<{ status: number; text: string; json: unknown }> {
  const text = body === undefined ? undefined : JSON.stringify(body)
  const headers: Record<string, string | number> = {}
  if (text !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(text) }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, text: out, json: out === '' ? undefined : JSON.parse(out) }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

describe('the tool gateway, plain JSON', () => {
  it('lists only what is exposed and present, and calls through the registry', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('GET', TOOLS_PATH, undefined, secret)).json).toEqual({
      ok: true,
      tools: [
        { name: 'acryl_install_plugin', description: 'Install a plugin', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
        { name: 'acryl_list_plugins', description: 'List plugins', inputSchema: { type: 'object', properties: {} } },
      ].sort((a, b) => DEFAULT_EXPOSED_TOOLS.indexOf(a.name) - DEFAULT_EXPOSED_TOOLS.indexOf(b.name)),
    })
    expect((await send('POST', TOOLS_PATH, { name: 'acryl_list_plugins', arguments: {} }, secret)).json).toEqual({ ok: true, isError: false, text: 'acryl_list_plugins ran' })
    expect((await send('POST', TOOLS_PATH, { name: 'acryl_install_plugin', arguments: { path: '/p' } }, secret)).json).toEqual({ ok: true, isError: true, text: 'Error: nope' })
    expect(executed).toEqual([{ name: 'acryl_list_plugins', arguments: {} }, { name: 'acryl_install_plugin', arguments: { path: '/p' } }])
    await fiber.dispose()
  })

  it('never runs a tool outside the allowlist, even one that exists, and says so', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('POST', TOOLS_PATH, { name: 'bash', arguments: { command: 'id' } }, secret)).json).toMatchObject({ ok: false, code: 'not-exposed' })
    expect((await send('POST', TOOLS_PATH, { name: 'acryl_remove_plugin', arguments: {} }, secret)).json).toMatchObject({ ok: false, code: 'unknown-tool' })
    expect(executed).toEqual([])
    await fiber.dispose()
  })

  it('refuses a caller without the secret and a malformed request', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('GET', TOOLS_PATH, undefined)).status).toBe(403)
    expect((await send('POST', TOOLS_PATH, { name: 'acryl_list_plugins' }, 'wrong')).status).toBe(403)
    expect((await send('POST', TOOLS_PATH, { name: 'acryl_list_plugins', extra: 1 }, secret)).status).toBe(400)
    expect((await send('POST', TOOLS_PATH, { name: 'Bad Name' }, secret)).status).toBe(400)
    expect((await send('PUT', TOOLS_PATH, {}, secret)).status).toBe(405)
    await fiber.dispose()
  })
})

describe('the tool gateway, MCP over HTTP', () => {
  const rpc = (id: number | undefined, method: string, params?: unknown) => ({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params === undefined ? {} : { params }) })

  it('negotiates a protocol version, lists tools with their schemas, and calls one', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('POST', MCP_PATH, rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } }), secret)).json).toMatchObject({
      id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'acryl' } },
    })
    expect((await send('POST', MCP_PATH, rpc(2, 'initialize', { protocolVersion: '1999-01-01' }), secret)).json).toMatchObject({ result: { protocolVersion: '2025-06-18' } })
    const listed = (await send('POST', MCP_PATH, rpc(3, 'tools/list'), secret)).json as { result: { tools: Array<{ name: string; inputSchema: unknown }> } }
    expect(listed.result.tools.map(tool => tool.name)).toEqual(['acryl_install_plugin', 'acryl_list_plugins'])
    expect(listed.result.tools[0]?.inputSchema).toMatchObject({ required: ['path'] })
    expect((await send('POST', MCP_PATH, rpc(4, 'tools/call', { name: 'acryl_list_plugins', arguments: {} }), secret)).json).toEqual({ jsonrpc: '2.0', id: 4, result: { content: [{ type: 'text', text: 'acryl_list_plugins ran' }], isError: false } })
    expect((await send('POST', MCP_PATH, rpc(5, 'tools/call', { name: 'acryl_install_plugin', arguments: { path: '/p' } }), secret)).json).toMatchObject({ result: { isError: true, content: [{ text: 'Error: nope' }] } })
    await fiber.dispose()
  })

  it('accepts the extra fields MCP allows on a call (Claude Code sends _meta), and still refuses a bad name', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('POST', MCP_PATH, rpc(1, 'tools/call', { name: 'acryl_list_plugins', arguments: {}, _meta: { progressToken: 7 } }), secret)).json).toMatchObject({ result: { isError: false } })
    expect((await send('POST', MCP_PATH, rpc(2, 'tools/call', { name: 'acryl_list_plugins', _meta: {} }), secret)).json).toMatchObject({ result: { isError: false } })
    expect((await send('POST', MCP_PATH, rpc(3, 'tools/call', { name: 'Bad Name', _meta: {} }), secret)).json).toMatchObject({ error: { code: -32602 } })
    await fiber.dispose()
  })

  it('answers a notification with 202, refuses what it does not offer, and honours the allowlist', async () => {
    const { fiber, secret } = await mount({ online: true })
    expect((await send('POST', MCP_PATH, rpc(undefined, 'notifications/initialized'), secret)).status).toBe(202)
    expect((await send('POST', MCP_PATH, rpc(6, 'resources/list'), secret)).json).toMatchObject({ error: { code: -32601 } })
    expect((await send('POST', MCP_PATH, rpc(7, 'tools/call', { name: 'bash', arguments: { command: 'id' } }), secret)).json).toMatchObject({ error: { code: -32602 } })
    expect((await send('POST', MCP_PATH, rpc(8, 'ping'), secret)).json).toEqual({ jsonrpc: '2.0', id: 8, result: {} })
    expect((await send('POST', MCP_PATH, [rpc(9, 'ping'), rpc(10, 'tools/list')], secret)).json).toHaveLength(2)
    expect((await send('POST', MCP_PATH, rpc(1, 'tools/list'))).status).toBe(403)
    expect((await send('GET', MCP_PATH, undefined, secret)).status).toBe(405)
    expect(executed).toEqual([])
    await fiber.dispose()
  })
})

describe('the gateway and the workers it serves', () => {
  it('writes a private MCP config for Claude workers only while it is up, and removes it on unload', async () => {
    const { fiber, home, secret } = await mount({ online: true })
    const path = join(home, 'agent-workers', 'claude-mcp.json')
    expect(statSync(path).mode & 0o777).toBe(0o600)
    const config = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: { acryl: { type: string; url: string; headers: { Authorization: string } } } }
    expect(config.mcpServers.acryl).toEqual({ type: 'http', url: `http://127.0.0.1:${String(port)}${MCP_PATH}`, headers: { Authorization: `Bearer ${String(secret)}` } })
    await fiber.dispose()
    expect(existsSync(path)).toBe(false)
  })

  it('is absent when the online channel is off or the gateway is switched off', async () => {
    const offline = await mount({})
    expect(offline.secret).toBeUndefined()
    expect((await send('GET', TOOLS_PATH, undefined, 'anything')).status).toBe(404)
    expect(existsSync(join(offline.home, 'agent-workers', 'claude-mcp.json'))).toBe(false)
    await offline.fiber.dispose()
    const off = await mount({ online: true, tools: false })
    expect((await send('GET', TOOLS_PATH, undefined, off.secret)).status).toBe(404)
    expect((await send('POST', MCP_PATH, rpc0(), off.secret)).status).toBe(404)
    expect(existsSync(join(off.home, 'agent-workers', 'claude-mcp.json'))).toBe(false)
    await off.fiber.dispose()
  })
})

const rpc0 = () => ({ jsonrpc: '2.0', id: 1, method: 'ping' })

describe('gateway configuration and requests', () => {
  it('defaults to the extension tools, accepts a list, and refuses anything else by name', () => {
    expect(parseConfig(undefined).tools).toEqual({ enabled: true, expose: DEFAULT_EXPOSED_TOOLS })
    expect(parseConfig({ tools: false }).tools.enabled).toBe(false)
    expect(parseConfig({ tools: { expose: ['acryl_list_plugins', 'acryl_list_plugins'] } }).tools.expose).toEqual(['acryl_list_plugins'])
    expect(() => parseConfig({ tools: 'yes' })).toThrow(/tools must be/u)
    expect(() => parseConfig({ tools: { allow: [] } })).toThrow(/unknown tools field "allow"/u)
    expect(() => parseConfig({ tools: { expose: ['Bash -c'] } })).toThrow(/list of tool names/u)
    expect(() => parseGatewayCall({ name: 'acryl_list_plugins', arguments: [] })).toThrow(/arguments/u)
    expect(parseGatewayCall({ name: 'acryl_list_plugins' })).toEqual({ name: 'acryl_list_plugins', arguments: {} })
  })

  it('never offers the shell or the file system by default', () => {
    expect(DEFAULT_EXPOSED_TOOLS.every(name => name.startsWith('acryl_'))).toBe(true)
  })
})

describe('docs access for workers', () => {
  it('finds the extension package folder from a lookup answer, and says nothing when the answer has no usable path', async () => {
    const { docsRootFromLookup } = await import('../../src/host/tools-gateway/worker-config.ts')
    expect(docsRootFromLookup(JSON.stringify({ ok: true, docs: [{ path: '/a/b/plugins/acryl-extension-context/docs/extending/tool-plugin.md' }] }))).toBe('/a/b/plugins/acryl-extension-context')
    expect(docsRootFromLookup(JSON.stringify({ ok: true, docs: [] }))).toBeUndefined()
    expect(docsRootFromLookup(JSON.stringify({ docs: [{ path: 'relative.md' }] }))).toBeUndefined()
    expect(docsRootFromLookup('not json')).toBeUndefined()
  })
})
