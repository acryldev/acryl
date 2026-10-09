// Run with Bun (not part of the Node vitest suite): `bun test bun-tests` from this package folder (macOS, Linux).
// The whole path a terminal tab takes on a Bun host, with nothing faked: the real registry and stream, a real shell behind Bun.spawn({ terminal }),
// a node:http server (as the Harness web server is) and the bare `ws` import (which Bun answers with its own implementation). specs/042, Bun experiment.
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { createServer, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket } from 'ws'
import { parsePtyServerMessage, type PtyServerMessage } from '../src/pty/contract.ts'
import { spawnBunTerminal } from '../src/pty/bun-terminal-spawn.ts'
import { WorkspacePtyRegistry } from '../src/pty/service.ts'
import { createWorkspacePtyStream, type WorkspacePtyStream } from '../src/pty/stream.ts'

let server: Server
let port = 0
let origin = ''
let registry: WorkspacePtyRegistry
let stream: WorkspacePtyStream
const upgraded = new Set<Duplex>()

beforeAll(async () => {
  server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  origin = `http://127.0.0.1:${String(port)}`
  registry = new WorkspacePtyRegistry({ spawn: spawnBunTerminal, env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin', HOME: '/tmp' }, cwd: '/tmp' })
  stream = createWorkspacePtyStream(registry, origin, () => {})
  server.on('upgrade', (req, socket, head) => { upgraded.add(socket); stream.handleUpgrade(req, socket, head) })
})
afterAll(async () => {
  stream.close()
  await registry.disposeAll()
  // As the Harness web server does on stop: Node's closeAllConnections() skips upgraded sockets, so it destroys the ones it tracked.
  server.closeAllConnections()
  for (const socket of upgraded) socket.destroy()
  await new Promise<void>(resolve => server.close(() => { resolve() }))
})

function open(query: string, headers: Record<string, string> = { origin }): Promise<{ ws: WebSocket; messages: PtyServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/stream?${query}`, { headers })
    const messages: PtyServerMessage[] = []
    ws.on('message', raw => { messages.push(parsePtyServerMessage(raw.toString('utf8'))) })
    ws.once('open', () => { resolve({ ws, messages }) })
    ws.on('error', reject)
    ws.once('unexpected-response', (_req, res) => { reject(new Error(`HTTP ${String(res.statusCode)}`)) })
    setTimeout(() => { reject(new Error('timeout opening the stream')) }, 5000)
  })
}
async function until(check: () => boolean, ms = 5000): Promise<void> {
  for (let i = 0; i < ms / 10; i += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting')
}
const outputOf = (messages: readonly PtyServerMessage[]): string => messages.map(m => (m.t === 'out' ? m.data : '')).join('')

test('a real shell: keystrokes in, output back, resize applied, exit reported - over the real stream', async () => {
  const view = registry.start('shell')
  const { ws, messages } = await open(`id=${view.id}&since=0`)
  ws.send(JSON.stringify({ t: 'in', data: 'echo from-$((20+22))\r' }))
  await until(() => outputOf(messages).includes('from-42'))
  ws.send(JSON.stringify({ t: 'resize', cols: 101, rows: 33 }))
  ws.send(JSON.stringify({ t: 'in', data: 'stty size\r' }))
  await until(() => outputOf(messages).includes('33 101'))
  ws.send(JSON.stringify({ t: 'in', data: 'exit 5\r' }))
  await until(() => messages.some(m => m.t === 'exit'))
  expect(messages.find(m => m.t === 'exit')).toEqual({ t: 'exit', exitCode: 5, error: null })
  ws.close()
})

test('a client that attaches after output resumes from its cursor, and one after the exit is told of it', async () => {
  const view = registry.start('shell')
  const first = await open(`id=${view.id}&since=0`)
  first.ws.send(JSON.stringify({ t: 'in', data: 'echo one\r' }))
  await until(() => outputOf(first.messages).includes('one'))
  const cursor = Math.max(...first.messages.flatMap(m => (m.t === 'out' ? [m.cursor] : [])))
  first.ws.send(JSON.stringify({ t: 'in', data: 'echo two\r' }))
  await until(() => outputOf(first.messages).includes('two'))
  const second = await open(`id=${view.id}&since=${String(cursor)}`)
  await until(() => outputOf(second.messages).includes('two'))
  expect(outputOf(second.messages)).not.toContain('one')
  first.ws.send(JSON.stringify({ t: 'in', data: 'exit 0\r' }))
  await until(() => first.messages.some(m => m.t === 'exit'))
  const late = await open(`id=${view.id}&since=0`)
  await until(() => late.messages.some(m => m.t === 'exit'))
  first.ws.close(); second.ws.close(); late.ws.close()
})

test('refuses another origin and a malformed request, closes a client that sends nonsense or names an unknown session', async () => {
  const view = registry.start('shell')
  // Measured: on Bun a write to a node:http upgrade socket never reaches the client (only the built-in ws handshake does), so a refusal is a closed connection and
  // not the 403/400 status line the stream writes; on Node the status arrives. The page is refused either way and is never upgraded.
  await expect(open(`id=${view.id}&since=0`, { origin: 'http://evil.example' })).rejects.toThrow(/HTTP 403|Connection ended/)
  await expect(open(`id=${view.id}&since=abc`)).rejects.toThrow(/HTTP 400|Connection ended/)
  await expect(open('since=0')).rejects.toThrow(/HTTP 400|Connection ended/)
  const { ws } = await open(`id=${view.id}&since=0`)
  const closed = new Promise<number>(resolve => ws.once('close', code => { resolve(code) }))
  ws.send('{"t":"in","data":1}')
  expect(await closed).toBe(1008)
  const unknown = await open('id=nope&since=0')
  expect(await new Promise<number>(resolve => unknown.ws.once('close', code => { resolve(code) }))).toBe(4404)
})
