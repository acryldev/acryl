/**
 * The page channel over a WebSocket, on a real server with a real `ws` client: the Origin is the boundary (a WebSocket has no CORS), the calls and answers travel as JSON frames, and a
 * socket that closes is gone from the door at once, so a call for it fails at once instead of waiting.
 */

import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { appFolder, operator, removeFolders, startApp, until, type Running } from '../harness.ts'

const apps: Running[] = []
afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

async function app(): Promise<Running> {
  const running = await startApp({ root: appFolder() })
  apps.push(running)
  return running
}

const url = (running: Running, query = 'window=w-1&focused=1'): string => `${running.origin.replace('http', 'ws')}/api/acryl-door/channel/ws?${query}`
const refusal = (address: string, headers: Record<string, string>): Promise<string> =>
  new Promise((resolve) => {
    const socket = new WebSocket(address, { headers })
    socket.once('open', () => { socket.close(); resolve('opened') })
    socket.once('unexpected-response', (_request, response) => { resolve(`refused ${String(response.statusCode)}`) })
    socket.once('error', () => { resolve('error') })
  })
const frames = (socket: WebSocket): Array<{ e: string; d?: string }> => {
  const seen: Array<{ e: string; d?: string }> = []
  socket.on('message', (data) => { seen.push(JSON.parse(data.toString()) as { e: string; d?: string }) })
  return seen
}
const connect = async (running: Running, query?: string): Promise<{ socket: WebSocket; seen: Array<{ e: string; d?: string }> }> => {
  const socket = new WebSocket(url(running, query), { headers: { origin: running.origin } })
  const seen = frames(socket)
  await new Promise<void>((resolve, reject) => { socket.once('open', () => { resolve() }); socket.once('error', reject) })
  await until(() => seen.some(frame => frame.e === 'ready'), 'the ready frame')
  return { socket, seen }
}

describe('the page channel over a WebSocket', () => {
  it('opens for this app\'s own origin, says ready, and the page shows up as the open page', async () => {
    const running = await app()
    const { socket, seen } = await connect(running)
    expect(seen[0]).toEqual({ e: 'ready' })
    const brief = await operator(running.root, ['brief'])
    expect(brief.out).toContain('Page: open')
    socket.close()
  })

  it('tells the page, as a frame, when a run asked for from its panel starts and ends', async () => {
    const running = await app()
    const { socket, seen } = await connect(running)
    const door = running.ctx.get('door') as unknown as { driveFor(windowId: string): () => void }
    const end = door.driveFor('w-1')
    await until(() => seen.some(frame => frame.e === 'run'), 'the run frame')
    end()
    await until(() => seen.filter(frame => frame.e === 'run').length === 2, 'the run frame when it ends')
    expect(seen.filter(frame => frame.e === 'run')).toEqual([{ e: 'run', d: '1' }, { e: 'run', d: '0' }])
    socket.close()
  })

  it('refuses a page of another loopback port, a web site, a program that sends no Origin, and a request that says it is cross-site: the Origin must be this app\'s own, exactly', async () => {
    const running = await app()
    const port = Number(new URL(running.origin).port)
    const address = url(running)
    expect(await refusal(address, { origin: `http://127.0.0.1:${String(port + 1)}` })).toBe('refused 403')
    expect(await refusal(address, { origin: `http://localhost:${String(port)}` })).toBe('refused 403')
    expect(await refusal(address, { origin: 'https://evil.example' })).toBe('refused 403')
    expect(await refusal(address, { origin: 'null' })).toBe('refused 403')
    expect(await refusal(address, {})).toBe('refused 403')
    // No Origin, but a forged same-origin hint and a Referer: not proof, because only the browser decides an Origin.
    expect(await refusal(address, { 'sec-fetch-site': 'same-origin', referer: `${running.origin}/` })).toBe('refused 403')
    expect(await refusal(address, { origin: running.origin, 'sec-fetch-site': 'cross-site' })).toBe('refused 403')
    expect(await refusal(url(running, 'focused=1'), { origin: running.origin })).toBe('refused 400')
    expect(await refusal(url(running, 'window=has%20space'), { origin: running.origin })).toBe('refused 400')
    // Nothing connected through any of them.
    expect((await operator(running.root, ['brief'])).out).toContain('Page: not open')
  })

  it('carries a call down as a frame and the acknowledgement and the answer up as frames', async () => {
    const running = await app()
    const { socket, seen } = await connect(running)
    const looking = operator(running.root, ['look'])
    await until(() => seen.some(frame => frame.e === 'call'), 'the call frame')
    const call = JSON.parse(seen.find(frame => frame.e === 'call')?.d ?? '{}') as { t: string; id: number; request: { op: string } }
    expect([call.t, call.request.op]).toEqual(['call', 'snapshot'])
    socket.send(JSON.stringify({ t: 'ack', id: call.id }))
    socket.send(JSON.stringify({ t: 'result', id: call.id, value: { generation: 1, title: 'Socket page', nodes: [], total: 0 } }))
    const answer = await looking
    expect(answer.code, answer.err).toBe(0)
    expect(answer.out).toContain('Page: Socket page')
    socket.close()
  })

  it('ignores a frame that is not a message of the protocol, and a binary frame', async () => {
    const running = await app()
    const { socket } = await connect(running)
    socket.send('not json')
    socket.send(JSON.stringify({ t: 'result', id: 999, value: 'nonsense' }))
    socket.send(Buffer.from([1, 2, 3]))
    socket.send(JSON.stringify({ t: 'focus', focused: true }))
    await new Promise(resolve => setTimeout(resolve, 80))
    expect((await operator(running.root, ['brief'])).out).toContain('Page: open')
    socket.close()
  })

  it('drops a socket that closes: the page is gone from the door at once, and a call for it fails with no-window instead of waiting', async () => {
    const running = await app()
    const { socket } = await connect(running)
    socket.close()
    for (let at = 0; at < 100; at += 1) {
      if ((await operator(running.root, ['brief'])).out.includes('Page: not open')) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const started = Date.now()
    const looked = await operator(running.root, ['look'])
    expect(looked.code).toBe(1)
    expect(looked.err).toContain('no-window')
    // It waits the moment a page needs to register after a navigation (two seconds), and no longer.
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('replaces a socket that opens again for the same window, and a call in flight on the old one fails as disconnected', async () => {
    const running = await app()
    const first = await connect(running)
    const looking = operator(running.root, ['look'])
    await until(() => first.seen.some(frame => frame.e === 'call'), 'the call frame')
    const second = await connect(running)
    const answer = await looking
    expect(answer.code).toBe(1)
    expect(answer.err).toMatch(/disconnected|went away/u)
    first.socket.close()
    second.socket.close()
  })
})
