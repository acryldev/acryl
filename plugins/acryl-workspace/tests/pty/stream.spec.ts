import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { parsePtyServerMessage, type PtyServerMessage } from '../../src/pty/contract.ts'
import { WorkspacePtyRegistry, type WorkspacePtyProcess } from '../../src/pty/service.ts'
import { createWorkspacePtyStream, type WorkspacePtyStream } from '../../src/pty/stream.ts'

interface FakeProcess extends WorkspacePtyProcess {
  emit(data: string): void
  finish(code: number): void
  readonly written: string[]
  readonly sizes: Array<[number, number]>
}

function fakeProcess(): FakeProcess {
  let data: ((chunk: string) => void) | undefined
  let exit: ((event: { exitCode: number }) => void) | undefined
  const written: string[] = []
  const sizes: Array<[number, number]> = []
  return {
    written,
    sizes,
    onData: (listener) => { data = listener; return { dispose() {} } },
    onExit: (listener) => { exit = listener; return { dispose() {} } },
    write: (chunk) => { written.push(chunk) },
    resize: (cols, rows) => { sizes.push([cols, rows]) },
    kill: () => { exit?.({ exitCode: 0 }) },
    emit: (chunk) => { data?.(chunk) },
    finish: (code) => { exit?.({ exitCode: code }) },
  }
}

let server: Server
let port = 0
let origin = ''
let stream: WorkspacePtyStream
let registry: WorkspacePtyRegistry
let process: FakeProcess

beforeAll(async () => {
  server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  origin = `http://127.0.0.1:${String(port)}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

beforeEach(() => {
  server.removeAllListeners('upgrade')
  process = fakeProcess()
  registry = new WorkspacePtyRegistry({
    spawn: () => process,
    env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin' },
    platform: 'darwin',
    createId: () => 'pty_test',
  })
  registry.start('shell')
  stream = createWorkspacePtyStream(registry, origin, () => {})
  server.on('upgrade', (req, socket, head) => { stream.handleUpgrade(req, socket, head) })
})

function open(query: string, headers: Record<string, string> = { origin }): Promise<{ ws: WebSocket; messages: PtyServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/stream?${query}`, { headers })
    const messages: PtyServerMessage[] = []
    ws.on('message', (raw) => { messages.push(parsePtyServerMessage(raw.toString('utf8'))) })
    ws.once('open', () => { resolve({ ws, messages }) })
    ws.once('error', reject)
    ws.once('unexpected-response', (_req, res) => { reject(new Error(`HTTP ${String(res.statusCode)}`)) })
  })
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting')
}

const outputOf = (messages: readonly PtyServerMessage[]): string => messages.map(m => (m.t === 'out' ? m.data : '')).join('')

describe('terminal stream', () => {
  it('replays what already happened, then streams new output batched and in order', async () => {
    process.emit('early ')
    const { ws, messages } = await open('id=pty_test&since=0')
    await until(() => outputOf(messages).includes('early '))
    // A fresh attach starts the client's terminal from the Host's picture of the screen.
    expect(messages[0]).toMatchObject({ t: 'out', replace: true })
    for (const part of ['a', 'b', 'c', 'd']) process.emit(part)
    await until(() => outputOf(messages).endsWith('abcd'))
    const last = messages[messages.length - 1]
    expect(last).toMatchObject({ t: 'out', cursor: 10, replace: false })
    ws.close()
  })

  it('resumes from a cursor without repeating or losing output', async () => {
    process.emit('12345')
    const { ws, messages } = await open('id=pty_test&since=3')
    await until(() => outputOf(messages) === '45')
    process.emit('67')
    await until(() => outputOf(messages) === '4567')
    expect(messages.every(m => m.t !== 'out' || !m.replace)).toBe(true)
    ws.close()
  })

  it('writes keystrokes in the order they were sent and applies resizes', async () => {
    const { ws } = await open('id=pty_test&since=0')
    for (const key of ['l', 's', '\r']) ws.send(JSON.stringify({ t: 'in', data: key }))
    ws.send(JSON.stringify({ t: 'resize', cols: 100, rows: 30 }))
    await until(() => process.written.length === 3 && process.sizes.length === 1)
    expect(process.written).toEqual(['l', 's', '\r'])
    expect(process.sizes).toEqual([[100, 30]])
    ws.close()
  })

  it('reports the exit, also to a client that attaches after it', async () => {
    const first = await open('id=pty_test&since=0')
    process.finish(3)
    await until(() => first.messages.some(m => m.t === 'exit'))
    expect(first.messages.find(m => m.t === 'exit')).toEqual({ t: 'exit', exitCode: 3, error: null })
    const late = await open('id=pty_test&since=0')
    await until(() => late.messages.some(m => m.t === 'exit'))
    first.ws.close()
    late.ws.close()
  })

  it('closes a client that sends nonsense and one that names an unknown session', async () => {
    const { ws } = await open('id=pty_test&since=0')
    const closed = new Promise<number>(resolve => ws.once('close', code => { resolve(code) }))
    ws.send('{"t":"in","data":1}')
    expect(await closed).toBe(1008)
    const unknown = await open('id=nope&since=0')
    expect(await new Promise<number>(resolve => unknown.ws.once('close', code => { resolve(code) }))).toBe(4404)
  })

  it('refuses a page from another origin and a malformed request', async () => {
    await expect(open('id=pty_test&since=0', { origin: 'http://evil.example' })).rejects.toThrow('HTTP 403')
    await expect(open('id=pty_test&since=abc')).rejects.toThrow('HTTP 400')
    await expect(open('since=0')).rejects.toThrow('HTTP 400')
  })
})
