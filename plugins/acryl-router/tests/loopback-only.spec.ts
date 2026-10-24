/**
 * `loopbackOnly`, the guard of a local app's own routes: the peer and port come from the transport, the `Host` names this app, and the
 * `callers` rule decides whether any local program or only the app's own page may call.
 */

import { describe, expect, it } from 'vitest'
import { Acryl, type ConnectionInfo } from '../src/index.ts'
import { loopbackOnly, type LoopbackOptions } from '../src/middleware/index.ts'

const PORT = 43_120
const SELF = `http://127.0.0.1:${String(PORT)}`
const LOCAL: ConnectionInfo = { remoteAddress: '127.0.0.1', localPort: PORT }

function guarded(options: LoopbackOptions = {}): Acryl {
  return new Acryl().use(loopbackOnly(options)).get('/x', c => c.text('read')).post('/x', c => c.text('changed'))
}

async function status(
  app: Acryl,
  method: string,
  headers: Record<string, string>,
  connection: ConnectionInfo = LOCAL,
): Promise<number> {
  const response = await app.fetch(new Request(`${SELF}/x`, { method, headers: { host: `127.0.0.1:${String(PORT)}`, ...headers } }), { connection })
  return response.status
}

describe('loopbackOnly, callers: local (the default)', () => {
  const app = guarded()

  it('lets a local program read and change, and a page of this app change', async () => {
    expect(await status(app, 'GET', {})).toBe(200)
    expect(await status(app, 'POST', {})).toBe(200)
    expect(await status(app, 'POST', { origin: SELF })).toBe(200)
  })

  it('refuses another origin\'s change, a foreign peer, a wrong port, a foreign Host and an in-process call', async () => {
    expect(await status(app, 'POST', { origin: 'http://evil.test' })).toBe(403)
    expect(await status(app, 'GET', {}, { remoteAddress: '192.168.1.5', localPort: PORT })).toBe(403)
    expect(await status(app, 'GET', {}, { remoteAddress: '127.0.0.1', localPort: PORT + 1 })).toBe(403)
    expect(await status(app, 'GET', { host: 'evil.test' })).toBe(403)
    expect(await status(app, 'GET', {}, {})).toBe(403)
  })

  it('lets an in-process call through only when the host says so', async () => {
    expect(await status(guarded({ inProcess: 'allow' }), 'GET', {}, {})).toBe(200)
  })
})

describe('loopbackOnly, callers: own-page', () => {
  const app = guarded({ callers: 'own-page', hostnames: ['127.0.0.1'] })

  it('lets this app\'s page read and change with its exact Origin', async () => {
    expect(await status(app, 'GET', { origin: SELF, 'sec-fetch-site': 'same-origin' })).toBe(200)
    expect(await status(app, 'POST', { origin: SELF, 'sec-fetch-site': 'same-origin' })).toBe(200)
    expect(await status(app, 'POST', { origin: SELF })).toBe(200)
  })

  it('lets a same-origin read without Origin through by its Referer, as browsers send it', async () => {
    expect(await status(app, 'GET', { 'sec-fetch-site': 'same-origin', referer: `${SELF}/page?tab=1` })).toBe(200)
  })

  it('refuses a local program (no Origin), even for a read', async () => {
    expect(await status(app, 'GET', {})).toBe(403)
    expect(await status(app, 'POST', {})).toBe(403)
  })

  it('refuses a change that only has the read evidence, and Origin forms that are not exact', async () => {
    expect(await status(app, 'POST', { 'sec-fetch-site': 'same-origin', referer: `${SELF}/` })).toBe(403)
    expect(await status(app, 'POST', { origin: `${SELF}/` })).toBe(403)
    expect(await status(app, 'POST', { origin: 'null' })).toBe(403)
    expect(await status(app, 'POST', { origin: SELF, 'sec-fetch-site': 'same-site' })).toBe(403)
  })

  it('refuses another page, a Referer from elsewhere and a Host this app does not answer to', async () => {
    expect(await status(app, 'GET', { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site' })).toBe(403)
    expect(await status(app, 'GET', { 'sec-fetch-site': 'same-origin', referer: 'http://evil.test/' })).toBe(403)
    expect(await status(app, 'GET', { host: `localhost:${String(PORT)}`, origin: `http://localhost:${String(PORT)}` })).toBe(403)
  })
})
