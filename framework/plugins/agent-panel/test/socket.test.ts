// The panel's runs over a WebSocket: the Origin is the boundary, the first frame carries the token, the events are the stream's, and Stop works on the same socket.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as nodeServer from '../../acryl-node-server/src/index.ts'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../../agent/index.ts'
import { builder } from '../../builder/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as panel from '../index.ts'

const require = createRequire(import.meta.url)
const WebSocket = require('ws') as typeof import('ws').WebSocket
type Socket = InstanceType<typeof WebSocket>

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step()
})

/** The agent family and the panel on a real server. */
async function boot() {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = 'test'
  delete process.env.ACRYL_DOOR
  const root = mkdtempSync(join(tmpdir(), 'panel-socket-'))
  const app = new Context()
  const fibers: Array<ReturnType<Context['plugin']>> = []
  for (const start of [
    () => app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })),
    () => app.plugin(router),
    () => app.plugin(state),
    () => app.plugin(nodeServer, { hostname: '127.0.0.1', port: 0 }),
    () => app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
    () => app.plugin(model),
    () => app.plugin(tools),
    () => app.plugin(memory),
    () => app.plugin(agent),
    () => app.plugin(builder, {}),
    () => app.plugin(panel, { drivers: [] }),
  ]) {
    const fiber = start()
    fibers.push(fiber)
    await fiber.await()
  }
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
    rmSync(root, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const origin = (app as unknown as { nodeServer: { url: string } }).nodeServer.url.replace(
    /\/$/u,
    '',
  )
  const session = (await (
    await fetch(`${origin}/api/agent-panel/session`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
  ).json()) as { token: string }
  return { origin, token: session.token, app }
}

const wsUrl = (origin: string): string => `${origin.replace('http', 'ws')}/api/agent-panel/run/ws`
const refusal = (url: string, headers: Record<string, string>): Promise<string> =>
  new Promise((resolve) => {
    const socket = new WebSocket(url, { headers })
    socket.once('open', () => {
      socket.close()
      resolve('opened')
    })
    socket.once('unexpected-response', (_request, response) =>
      resolve(`refused ${String(response.statusCode)}`),
    )
    socket.once('error', () => resolve('error'))
  })
const open = (origin: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl(origin), { headers: { origin } })
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
/** Every frame until the socket closes, and the close code. */
const drain = (
  socket: Socket,
): Promise<{
  frames: Array<{ e: string; d: Record<string, unknown> }>
  code: number
  accepted: boolean
}> =>
  new Promise((resolve) => {
    const frames: Array<{ e: string; d: Record<string, unknown> }> = []
    socket.on('message', (data) =>
      frames.push(JSON.parse(data.toString()) as { e: string; d: Record<string, unknown> }),
    )
    socket.once('close', (code) => {
      // The first frame of an accepted socket says so, before anything the run sends; it is not an event of the run.
      const accepted = frames[0]?.e === 'accepted'
      resolve({ frames: accepted ? frames.slice(1) : frames, code, accepted })
    })
  })

test("only this app's own Origin may open it: another port, a web site, no Origin, a cross-site request", async () => {
  const { origin } = await boot()
  const port = Number(new URL(origin).port)
  assert.equal(
    await refusal(wsUrl(origin), { origin: `http://127.0.0.1:${String(port + 1)}` }),
    'refused 403',
  )
  assert.equal(await refusal(wsUrl(origin), { origin: 'https://evil.example' }), 'refused 403')
  assert.equal(await refusal(wsUrl(origin), {}), 'refused 403')
  assert.equal(
    await refusal(wsUrl(origin), { origin, 'sec-fetch-site': 'cross-site' }),
    'refused 403',
  )
  assert.equal(await refusal(wsUrl(origin), { origin }), 'opened')
})

test('the first frame must carry the token: a wrong one, a missing one and a frame of another kind close the socket with 4401 and run nothing', async () => {
  const { origin } = await boot()
  for (const first of [
    { t: 'hello', token: 'wrong' },
    { t: 'ask', message: 'add 2 3' },
    { t: 'hello' },
  ]) {
    const socket = await open(origin)
    const done = drain(socket)
    socket.send(JSON.stringify(first))
    const { frames, code, accepted } = await done
    assert.equal(code, 4401)
    assert.deepEqual(frames, [])
    // A token this start of the app does not know is told apart from a socket that opened: the page asks for a new session and tries again.
    assert.equal(accepted, false)
  }
})

test('an ask over the socket runs the agent and sends the events the stream sends, ending with done, then closes', async () => {
  const { origin, token } = await boot()
  const socket = await open(origin)
  const done = drain(socket)
  socket.send(JSON.stringify({ t: 'hello', token }))
  socket.send(JSON.stringify({ t: 'ask', message: 'create route hello /hello Hello' }))
  const { frames, code, accepted } = await done
  assert.equal(accepted, true)
  const names = frames.map((frame) => frame.e)
  assert.ok(names.includes('tool'), names.join())
  assert.deepEqual(frames.find((frame) => frame.e === 'change')?.d, {
    extension: 'hello',
    action: 'installed',
  })
  assert.equal(names.at(-1), 'done')
  assert.equal(code, 1000)
  // The page that loads next follows the latest run: its question, then every event, over a socket too.
  const again = await open(origin)
  const replay = drain(again)
  again.send(JSON.stringify({ t: 'hello', token }))
  again.send(JSON.stringify({ t: 'follow' }))
  const followed = await replay
  assert.equal(followed.frames[0]?.e, 'run')
  assert.equal(followed.frames[0]?.d.message, 'create route hello /hello Hello')
  assert.equal(followed.frames[0]?.d.ended, true)
  assert.equal(followed.frames.at(-1)?.e, 'done')
})

test('a refused ask says why in an error frame; with nothing to follow it says idle', async () => {
  const { origin, token } = await boot()
  const refused = await open(origin)
  const closed = drain(refused)
  refused.send(JSON.stringify({ t: 'hello', token }))
  refused.send(JSON.stringify({ t: 'ask', message: 'hi', driver: 'claude' }))
  const { frames } = await closed
  assert.equal(frames[0]?.e, 'error')
  assert.match(String(frames[0]?.d.message), /the driver "claude" is not available here/)
  const idle = await open(origin)
  const idleDone = drain(idle)
  idle.send(JSON.stringify({ t: 'hello', token }))
  idle.send(JSON.stringify({ t: 'follow' }))
  assert.deepEqual(
    (await idleDone).frames.map((frame) => frame.e),
    ['idle'],
  )
})

test('an ask that names the page it came from has the door drive that page while the run goes, and let go when it ends; a page name that is not an id is ignored', async () => {
  const { origin, token, app } = await boot()
  const seen: string[] = []
  app.provide('door', {
    driveFor(page: string) {
      seen.push(`for ${page}`)
      return () => seen.push(`end ${page}`)
    },
  })
  for (const page of ['4f1c-window', 'not an id!', undefined]) {
    const socket = await open(origin)
    const done = drain(socket)
    socket.send(JSON.stringify({ t: 'hello', token }))
    socket.send(JSON.stringify({ t: 'ask', message: 'add 2 3', page }))
    assert.equal((await done).frames.at(-1)?.e, 'done')
  }
  assert.deepEqual(seen, ['for 4f1c-window', 'end 4f1c-window'])
})
