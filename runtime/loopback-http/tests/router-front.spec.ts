import { describe, expect, it, vi } from 'vitest'
import { Acryl } from '@acryldev/blends'
import { testWebSocket, upgradeWebSocket } from '@acryldev/blends/node-server'

// A hosted app's trusted front is read from the environment once per process, so this file sets it before the router loads.
vi.hoisted(() => {
  process.env.ACRYL_PUBLIC_ORIGIN = 'https://box.example.com'
  process.env.ACRYL_TRUSTED_PROXY = '10.200.0.94'
})
const { ownPageSocket } = await import('../src/router.ts')

describe('ownPageSocket in a hosted app', () => {
  const PORT = 8000
  const PUBLIC = 'https://box.example.com'
  const app = new Acryl().get('/socket', ownPageSocket, upgradeWebSocket(() => ({ onOpen(_event, ws) { ws.send('hello') } }), { onError: () => {} }))
  const upgrade = (headers: Record<string, string>, remoteAddress: string) => testWebSocket(
    (request, env) => Promise.resolve(app.fetch(request, Object.assign(env, { connection: { remoteAddress, localPort: PORT } }))),
    '/socket',
    { headers, base: `http://127.0.0.1:${String(PORT)}` },
  )

  it('upgrades the public page that the front passed on, which shows its exact Origin', async () => {
    const accepted = await upgrade({ host: 'box.example.com', origin: PUBLIC }, '10.200.0.94')
    expect(accepted.status).toBe(101)
    expect(accepted.socket?.received).toEqual(['hello'])
  })

  it('still upgrades the page on loopback', async () => {
    const origin = `http://127.0.0.1:${String(PORT)}`
    expect((await upgrade({ host: `127.0.0.1:${String(PORT)}`, origin }, '127.0.0.1')).status).toBe(101)
  })

  it('refuses the public host from any peer but the front, and the front with another host or Origin', async () => {
    expect((await upgrade({ host: 'box.example.com', origin: PUBLIC }, '10.200.0.7')).status).toBe(403)
    expect((await upgrade({ host: 'other.example.com', origin: 'https://other.example.com' }, '10.200.0.94')).status).toBe(403)
    expect((await upgrade({ host: 'box.example.com', origin: 'https://evil.example' }, '10.200.0.94')).status).toBe(403)
    expect((await upgrade({ host: 'box.example.com' }, '10.200.0.94')).status).toBe(403)
  })
})
