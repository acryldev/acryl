import { createServer, request, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AgentCatalog } from '../../src/agents/catalog.ts'
import { handleWorkspaceAgentsRemoveRequest, handleWorkspaceAgentsRequest } from '../../src/agents/route.ts'
import { WorkspacePtyRegistry, type WorkspacePtyProcess } from '../../src/pty/service.ts'

const stored: { text: string | null } = { text: null }
const catalog = new AgentCatalog({ read: async () => stored.text, write: async (t) => { stored.text = t } }, command => command !== 'ghost')
let server: Server
let origin = ''
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    const handler = req.url?.startsWith('/remove') ? handleWorkspaceAgentsRemoveRequest : handleWorkspaceAgentsRequest
    void handler(req, res, origin, catalog, () => {})
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  origin = `http://127.0.0.1:${String(port)}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

function call(path: string, method: string, body?: unknown, sameOrigin = true): Promise<{ status: number; json: Record<string, unknown> }> {
  const text = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {}
    if (text !== undefined) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(text) }
    if (sameOrigin) Object.assign(headers, { origin, 'sec-fetch-site': 'same-origin' })
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(text)
  })
}

const mine = { id: 'my-agent', label: 'Mine', command: 'my-agent', args: ['--fast'], badge: { letter: 'M', color: '#10a37f' } }

describe('agents routes', () => {
  it('lists, adds, refuses with a message, and removes', async () => {
    expect((await call('/', 'GET')).json).toEqual({ agents: [] })
    const added = await call('/', 'POST', { agent: mine })
    expect(added.status).toBe(200)
    expect((added.json.agents as unknown[]).length).toBe(1)
    const bad = await call('/', 'POST', { agent: { ...mine, id: 'other', command: 'sh -c "x"' } })
    expect(bad.status).toBe(400)
    expect(String(bad.json.error)).toContain('command')
    expect((await call('/', 'POST', { agent: { ...mine, id: 'ghosty', command: 'ghost' } })).status).toBe(400)
    expect((await call('/remove', 'POST', { id: 'my-agent' })).json).toEqual({ agents: [] })
    expect((await call('/remove', 'POST', { id: 'my-agent' })).status).toBe(200)
  })

  it('refuses a foreign origin, a wrong method and malformed bodies', async () => {
    expect((await call('/', 'GET', undefined, false)).status).toBe(403)
    expect((await call('/', 'POST', { agent: mine }, false)).status).toBe(403)
    expect((await call('/', 'DELETE')).status).toBe(405)
    expect((await call('/', 'POST', { agent: mine, extra: 1 })).status).toBe(400)
    expect((await call('/', 'POST', {})).status).toBe(400)
    expect((await call('/remove', 'POST', { id: 3 })).status).toBe(400)
  })
})

describe('starting a custom agent', () => {
  function fakeProcess(): WorkspacePtyProcess {
    return { onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write() {}, resize() {}, kill() {} } as unknown as WorkspacePtyProcess
  }

  it('runs the catalog entry as an argument array, and never an id the catalog does not know', async () => {
    await catalog.add({ ...mine, id: 'runner', command: '/bin/echo', args: ['a b', '$(id)'] })
    const spawned: Array<{ file: string; args: readonly string[] }> = []
    const registry = new WorkspacePtyRegistry({
      spawn: (file, args) => { spawned.push({ file, args }); return fakeProcess() },
      agents: catalog,
      env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin' },
      platform: 'darwin',
    })
    registry.start('runner')
    expect(spawned).toEqual([{ file: '/bin/echo', args: ['a b', '$(id)'] }])
    expect(() => registry.start('not-in-catalog')).toThrow('unknown workspace PTY command')
    expect(() => registry.start('sh -c "x"')).toThrow('unknown workspace PTY command')
    expect(registry.canRun('/bin/echo')).toBe(true)
    expect(registry.canRun('/nonexistent/tool')).toBe(false)
    expect(registry.canRun('definitely-not-installed-xyz')).toBe(false)
  })
})
