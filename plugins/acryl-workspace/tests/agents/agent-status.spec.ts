import { createServer, request, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AgentStatusError, AgentStatusStore, parseStatusReport } from '../../src/agents/status/agent-status.ts'
import { claudeStatusSettings, STATUS_ENV, statusHookArgs } from '../../src/agents/status/claude-hooks.ts'
import { handleAgentStatusRequest } from '../../src/agents/status/route.ts'
import { AgentCatalog } from '../../src/agents/catalog.ts'
import { AgentSettings } from '../../src/agents/settings.ts'
import { WorkspacePtyRegistry, type WorkspacePtyProcess } from '../../src/pty/service.ts'

describe('status reports and the store', () => {
  it('reads a report strictly and names what is wrong', () => {
    expect(parseStatusReport({ terminal: 'pty_1', state: 'waiting' })).toEqual({ terminal: 'pty_1', state: 'waiting' })
    for (const bad of [null, [], { terminal: '', state: 'done' }, { terminal: 'x', state: 'sleeping' }, { terminal: 'x', state: 'done', extra: 1 }, { terminal: 'x'.repeat(81), state: 'done' }]) {
      expect(() => parseStatusReport(bad)).toThrow(AgentStatusError)
    }
  })

  it('keeps the latest state per live terminal and forgets terminals that are gone', () => {
    const live = new Set(['a', 'b'])
    let now = 100
    const store = new AgentStatusStore(id => live.has(id), () => now)
    expect(store.report('a', 'working')).toBe(true)
    now = 200
    expect(store.report('a', 'waiting')).toBe(true)
    expect(store.report('ghost', 'done')).toBe(false)
    store.report('b', 'done')
    expect(store.list()).toEqual([{ terminalId: 'a', state: 'waiting', at: 200 }, { terminalId: 'b', state: 'done', at: 200 }])
    live.delete('a')
    expect(store.list().map(entry => entry.terminalId)).toEqual(['b'])
  })
})

describe('the Claude hook settings', () => {
  it('is valid JSON with the four events, reads its credentials from the environment, and never blocks Claude', () => {
    const settings = JSON.parse(claudeStatusSettings()) as { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>> }
    expect(Object.keys(settings.hooks).sort()).toEqual(['Notification', 'PostToolUse', 'Stop', 'UserPromptSubmit'])
    const commands = Object.values(settings.hooks).flatMap(groups => groups.flatMap(group => group.hooks.map(hook => hook.command)))
    for (const command of commands) {
      expect(command).toContain(`$${STATUS_ENV.url}`)
      expect(command).toContain(`$${STATUS_ENV.token}`)
      expect(command).toContain(`$${STATUS_ENV.terminal}`)
      expect(command).toContain('-m 2')
      expect(command).toMatch(/\|\| true$/)
    }
    expect(settings.hooks.Notification?.[0]?.hooks[0]?.command).toContain('"state":"waiting"')
    expect(settings.hooks.Stop?.[0]?.hooks[0]?.command).toContain('"state":"done"')
    expect(settings.hooks.PostToolUse?.[0]?.matcher).toBe('*')
    expect(statusHookArgs('claude')).toEqual(['--settings', claudeStatusSettings()])
  })
})

describe('the status route', () => {
  const live = new Set(['pty_1'])
  const store = new AgentStatusStore(id => live.has(id))
  const reportError = vi.fn()
  let server: Server
  let port = 0
  let origin = ''
  beforeAll(async () => {
    server = createServer((req, res) => { void handleAgentStatusRequest(req, res, origin, 'secret-token', store, reportError) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
  })
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

  const call = (method: string, headers: Record<string, string>, body?: unknown) => new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body)
    const req = request({ host: '127.0.0.1', port, path: '/', method, headers: { ...headers, ...(text === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) }) } }, (res) => {
      let out = ''
      res.on('data', (chunk: Buffer) => { out += chunk.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(text)
  })
  const bearer = { authorization: 'Bearer secret-token' }

  it('accepts a report with the right token, ignores an unknown terminal, and lists statuses to the page only', async () => {
    expect((await call('POST', bearer, { terminal: 'pty_1', state: 'waiting' })).json).toEqual({ ok: true })
    expect((await call('POST', bearer, { terminal: 'ghost', state: 'done' })).json).toEqual({ ok: false })
    const list = await call('GET', { origin, 'sec-fetch-site': 'same-origin' })
    expect(list.status).toBe(200)
    expect(list.json.statuses).toEqual([expect.objectContaining({ terminalId: 'pty_1', state: 'waiting' })])
    expect((await call('GET', {})).status).toBe(403)
  })

  it('refuses a missing or wrong token, a bad body and a wrong method', async () => {
    expect((await call('POST', {}, { terminal: 'pty_1', state: 'done' })).status).toBe(403)
    expect((await call('POST', { authorization: 'Bearer nope' }, { terminal: 'pty_1', state: 'done' })).status).toBe(403)
    expect((await call('POST', { authorization: 'Bearer secret-token-longer' }, { terminal: 'pty_1', state: 'done' })).status).toBe(403)
    expect((await call('POST', bearer, { terminal: 'pty_1', state: 'sleeping' })).status).toBe(400)
    expect((await call('DELETE', bearer)).status).toBe(405)
  })
})

describe('starting a reporting agent', () => {
  const fakeProcess = (): WorkspacePtyProcess => ({ onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write() {}, resize() {}, kill() {} } as unknown as WorkspacePtyProcess)
  const memory = () => { const store = { text: null as string | null, read: async () => store.text, write: async (t: string) => { store.text = t } }; return store }

  it('adds the reporting settings and the terminal credentials only to an agent that reports, and only when a status target exists', async () => {
    const spawned: Array<{ file: string; args: readonly string[]; env: NodeJS.ProcessEnv }> = []
    const catalog = new AgentCatalog(memory(), () => true)
    const settings = new AgentSettings(memory(), catalog, () => true)
    await settings.load()
    const make = (agentStatus?: { url: string; token: string }) => new WorkspacePtyRegistry({
      spawn: (file, args, options) => { spawned.push({ file, args, env: options.env }); return fakeProcess() },
      agents: { resolve: id => settings.resolve(id) },
      ...(agentStatus === undefined ? {} : { agentStatus }),
      env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin' },
      platform: 'darwin',
      createId: () => 'pty_test',
    })
    await settings.apply({ agent: { id: 'claude', command: '/bin/echo' } })
    make({ url: 'http://127.0.0.1:1/api/status', token: 'tok' }).start('claude')
    expect(spawned[0]?.args[0]).toBe('--settings')
    expect(JSON.parse(spawned[0]?.args[1] ?? '{}').hooks.Stop).toBeDefined()
    expect(spawned[0]?.env).toMatchObject({ [STATUS_ENV.terminal]: 'pty_test', [STATUS_ENV.url]: 'http://127.0.0.1:1/api/status', [STATUS_ENV.token]: 'tok' })
    make({ url: 'http://x', token: 'tok' }).start('codex')
    expect(spawned[1]?.env[STATUS_ENV.token]).toBeUndefined()
    make().start('claude')
    expect(spawned[2]?.args).toEqual([])
    expect(spawned[2]?.env[STATUS_ENV.token]).toBeUndefined()
    await settings.apply({ statusHooks: false })
    make({ url: 'http://x', token: 'tok' }).start('claude')
    expect(spawned[3]?.args).toEqual([])
    expect(spawned[3]?.env[STATUS_ENV.token]).toBeUndefined()
    expect(settings.view().statusHooks).toBe(false)
  })
})
