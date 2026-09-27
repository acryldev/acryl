import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ChannelToPage } from '../../src/contract.ts'
import { UiChannel } from '../../src/host/channel.ts'
import { createUiControlStream, UI_CONTROL_CHANNEL_PATH, type UiControlStream } from '../../src/host/stream.ts'

let server: Server
let port = 0
let origin = ''
let channel: UiChannel
let stream: UiControlStream

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
  channel = new UiChannel()
  stream = createUiControlStream(channel, origin)
  server.on('upgrade', (req, socket, head) => { stream.handleUpgrade(req, socket, head) })
})

const open = (headers: Record<string, string> = { origin }): Promise<WebSocket> => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${String(port)}${UI_CONTROL_CHANNEL_PATH}`, { headers })
  ws.once('open', () => { resolve(ws) })
  ws.once('error', reject)
  ws.once('unexpected-response', (_req, res) => { reject(new Error(`HTTP ${String(res.statusCode)}`)) })
})
const until = async (check: () => boolean): Promise<void> => {
  for (let i = 0; i < 200; i += 1) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('timed out')
}

describe('page channel stream', () => {
  it('lets a same-origin page connect, receive a call and answer it', async () => {
    const ws = await open()
    ws.on('message', (raw) => {
      const call = JSON.parse(raw.toString('utf8')) as ChannelToPage
      ws.send(JSON.stringify({ t: 'result', id: call.id, value: { ok: true, target: { role: 'button', name: 'Go' } } }))
    })
    ws.send(JSON.stringify({ t: 'hello', windowId: 'w1', focused: true }))
    await until(() => channel.connected && channel.windows()[0]?.windowId === 'w1')
    expect(await channel.call({ op: 'click', ref: '1.1' })).toEqual({ ok: true, target: { role: 'button', name: 'Go' } })
    ws.close()
    await until(() => !channel.connected)
  })

  it('refuses a page from another origin, so a web page cannot drive the app', async () => {
    await expect(open({ origin: 'http://evil.example' })).rejects.toThrow('HTTP 403')
    await expect(open({})).rejects.toThrow('HTTP 403')
    expect(channel.connected).toBe(false)
  })

  it('closes a page that sends nonsense', async () => {
    const ws = await open()
    const closed = new Promise<number>(resolve => ws.once('close', code => { resolve(code) }))
    ws.send('{"t":"eval","code":"1"}')
    expect(await closed).toBe(1008)
  })

  it('closing the stream disconnects every page', async () => {
    const ws = await open()
    ws.send(JSON.stringify({ t: 'hello', windowId: 'w1', focused: true }))
    await until(() => channel.connected)
    const closed = new Promise<void>(resolve => ws.once('close', () => { resolve() }))
    stream.close()
    await closed
  })
})
