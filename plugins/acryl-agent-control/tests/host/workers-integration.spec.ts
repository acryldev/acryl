/**
 * Agent workers wired through the real, built plugin: the endpoint authorizes like the rest of Agent Control, runs attach, send, cancel and stop
 * against the real `acrAgentControl` service and the real Claude transport (the process on the other end is a small fake that speaks Claude Code's
 * stream-json protocol), and everything ends when the plugin unloads. Mounts the built `lib/index.js` (see online-integration.spec.ts for why).
 */
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/host/config.ts'
import { WORKERS_PATH, parseWorkerRequest } from '../../src/workers-contract.ts'

const BUILT_ENTRY = new URL('../../lib/index.js', import.meta.url).href

const FAKE = String.raw`
const readline = require('node:readline')
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.type !== 'user') return
  const text = message.message.content[0].text
  emit({ type: 'system', subtype: 'init', session_id: 'fake-session' })
  emit({ type: 'assistant', session_id: 'fake-session', message: { content: [{ type: 'text', text: 'echo: ' + text }] } })
  emit({ type: 'result', subtype: 'success', is_error: false, result: 'echo: ' + text, session_id: 'fake-session', stop_reason: 'end_turn' })
})
`

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
    register: (route: { path: string; handler: (req: unknown, res: unknown) => void }) => {
      routes.set(route.path, route.handler as never)
      return () => { routes.delete(route.path) }
    },
    registerUpgrade: () => () => {},
  }
}

// The stand-in below is a POSIX shell wrapper, and Node cannot spawn a Windows `.cmd` without a shell, so the two tests that run it are POSIX-only.
const posixOnly = process.platform === 'win32' ? it.skip : it

/** A `claude` stand-in: a shell wrapper, because the transport puts its protocol flags before any configured arguments. */
function fakeClaudeCommand(): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-fake-claude-'))
  roots.push(dir)
  writeFileSync(join(dir, 'fake.cjs'), FAKE)
  const wrapper = join(dir, 'claude')
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'fake.cjs')}"\n`)
  chmodSync(wrapper, 0o755)
  return wrapper
}

async function mount(config: unknown): Promise<{ fiber: { dispose(): Promise<void> }; home: string }> {
  server = createServer()
  await new Promise<void>(resolve => { server?.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  const home = mkdtempSync(join(tmpdir(), 'acryl-agent-control-workers-'))
  roots.push(home)
  const ctx = new Context()
  ctx.provide('appInstance' as never, { home, dshHome: join(home, '.dsh') } as never)
  ctx.provide('acrylWeb' as never, fakeWebServer() as never)
  ctx.provide('acrylTools' as never, { get: () => undefined, register: () => () => {}, policy: () => () => {} } as never)
  const module = await import(BUILT_ENTRY) as { apply(ctx: Context, config?: unknown): void }
  const fiber = ctx.plugin({ name: 'acryl-agent-control', inject: ['acrylWeb', 'acrylTools', 'appInstance'], apply: module.apply }, config)
  await new Promise(resolve => { setTimeout(resolve, 50) })
  return { fiber: fiber as unknown as { dispose(): Promise<void> }, home }
}

function call(body: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const text = JSON.stringify(body)
  const headers: Record<string, string | number> = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) }
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: WORKERS_PATH, method: 'POST', headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

describe('agent workers on the real plugin', () => {
  posixOnly('attaches a Claude worker, sends, and stops it, authorized by the instance secret', async () => {
    const { fiber, home } = await mount({ online: true, workers: { claude: { command: fakeClaudeCommand() } } })
    const secret = readFileSync(join(home, 'agent-control-secret'), 'utf8').trim()
    expect((await call({ op: 'list' }, secret)).json).toEqual({ ok: true, result: [] })

    const attached = await call({ op: 'attach', provider: 'claude', cwd: tmpdir(), workerId: 'w1' }, secret)
    expect(attached.json).toMatchObject({ ok: true, result: { workerId: 'w1', providerId: 'claude', fidelity: 'structured' } })
    expect((attached.json.result as { runtimeId: string }).runtimeId).toMatch(/^claude-\d+$/u)

    const sent = await call({ op: 'send', workerId: 'w1', text: 'hello' }, secret)
    expect(sent.json).toMatchObject({ ok: true, result: { text: 'echo: hello', isError: false, sessionId: 'fake-session' } })
    expect((await call({ op: 'list' }, secret)).json.result).toHaveLength(1)

    expect((await call({ op: 'stop', workerId: 'w1' }, secret)).json).toMatchObject({ ok: true, result: { stopped: true } })
    expect((await call({ op: 'send', workerId: 'w1', text: 'late' }, secret)).json).toMatchObject({ ok: false, code: 'transport-unavailable' })
    await fiber.dispose()
  })

  it('refuses a caller without the secret or the page origin, and a malformed or unreasonable request', async () => {
    const { fiber, home } = await mount({ online: true, workers: { claude: { command: fakeClaudeCommand() } } })
    const secret = readFileSync(join(home, 'agent-control-secret'), 'utf8').trim()
    expect((await call({ op: 'list' })).status).toBe(403)
    expect((await call({ op: 'list' }, 'not-the-secret')).status).toBe(403)
    expect((await call({ op: 'frobnicate' }, secret)).status).toBe(400)
    expect((await call({ op: 'send', workerId: 'w1', text: '' }, secret)).status).toBe(400)
    expect((await call({ op: 'attach', provider: 'claude', cwd: '/definitely/not/a/folder' }, secret)).json).toMatchObject({ ok: false, code: 'invalid' })
    expect((await call({ op: 'attach', provider: 'claude', cwd: 'relative/path' }, secret)).json).toMatchObject({ ok: false, code: 'invalid' })
    expect((await call({ op: 'send', workerId: 'ghost', text: 'hi' }, secret)).json).toMatchObject({ ok: false, code: 'unknown-worker' })
    await fiber.dispose()
  })

  it('has no endpoint when workers are switched off', async () => {
    const off = await mount({ online: true, workers: false })
    expect((await call({ op: 'list' }, readFileSync(join(off.home, 'agent-control-secret'), 'utf8').trim())).status).toBe(404)
    await off.fiber.dispose()
  })

  posixOnly('ends the worker process when the plugin unloads', async () => {
    const { fiber, home } = await mount({ online: true, workers: { claude: { command: fakeClaudeCommand() } } })
    const secret = readFileSync(join(home, 'agent-control-secret'), 'utf8').trim()
    const attached = await call({ op: 'attach', provider: 'claude', cwd: tmpdir(), workerId: 'w9' }, secret)
    const pid = Number((attached.json.result as { runtimeId: string }).runtimeId.replace('claude-', ''))
    expect(() => process.kill(pid, 0)).not.toThrow()
    await fiber.dispose()
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

describe('workers configuration and requests', () => {
  it('defaults to on, accepts a command and arguments, and refuses anything else by name', () => {
    expect(parseConfig(undefined).workers).toEqual({ enabled: true, claude: {} })
    expect(parseConfig({ workers: false }).workers.enabled).toBe(false)
    expect(parseConfig({ workers: { claude: { command: '/usr/local/bin/claude', args: ['--permission-mode', 'plan'] } } }).workers).toEqual({ enabled: true, claude: { command: '/usr/local/bin/claude', args: ['--permission-mode', 'plan'] } })
    expect(() => parseConfig({ workers: 'yes' })).toThrow(/workers must be/u)
    expect(() => parseConfig({ workers: { codex: {} } })).toThrow(/unknown workers field "codex"/u)
    expect(() => parseConfig({ workers: { claude: { cmd: 'x' } } })).toThrow(/unknown workers.claude field "cmd"/u)
    expect(() => parseConfig({ workers: { claude: { args: [1] } } })).toThrow(/list of strings/u)
  })

  it('parses only the closed set of operations and fields', () => {
    expect(parseWorkerRequest({ op: 'attach', provider: 'claude', cwd: '/p', resume: 'abc' })).toEqual({ op: 'attach', provider: 'claude', cwd: '/p', resume: 'abc' })
    expect(() => parseWorkerRequest({ op: 'attach', provider: 'codex', cwd: '/p' })).toThrow(/provider must be/u)
    expect(() => parseWorkerRequest({ op: 'send', workerId: 'w', text: 'x', extra: 1 })).toThrow(/unknown field "extra"/u)
    expect(() => parseWorkerRequest({ op: 'stop', workerId: '../etc' })).toThrow(/workerId/u)
  })
})
