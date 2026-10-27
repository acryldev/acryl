import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DESKTOP_WEB_PORT_RETRY_LIMIT } from '../../src/runtime/desktop-port.ts'
import DesktopWebServer from '../../src/runtime/webserver.ts'

const occupied: Server[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.fiber.dispose()))
  await Promise.all(occupied.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

function listen(port: number): Promise<Server> {
  const server = createServer()
  return new Promise<Server>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

const close = (server: Server): Promise<void> => new Promise(resolve => server.close(() => resolve()))

/**
 * Two neighbouring loopback ports, both held by this test until it ends. The OS picks the first; the second is bound by the test
 * itself, and another pair is tried when it is taken. Holding both, the test needs nothing else on the machine to stay free.
 */
async function occupyPair(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const first = await listen(0)
    const address = first.address()
    if (address === null || typeof address === 'string') throw new Error('test server did not expose an address')
    const second = await listen(address.port + 1).catch(() => undefined)
    if (second === undefined) {
      await close(first)
      continue
    }
    occupied.push(first, second)
    return address.port
  }
  throw new Error('no two neighbouring loopback ports free in 20 attempts')
}

describe('Desktop WebServer port policy', () => {
  it('rejects a non-loopback bind even when invoked outside profile composition', async () => {
    const context = new Context()
    contexts.push(context)

    await expect(context.plugin(DesktopWebServer, { host: '0.0.0.0', port: 43_120 }))
      .rejects.toThrow('requires a loopback host')
  })

  it('moves past ports in use on a real socket and serves on a free one within the retry range', async () => {
    // Which free port it lands on depends on the rest of the machine; the exact rule is pinned in desktop-port.spec.ts.
    const busy = await occupyPair()
    const context = new Context()
    contexts.push(context)

    await context.plugin(DesktopWebServer, { host: '127.0.0.1', port: busy })

    const port = context.get('webServer')?.port ?? 0
    expect(port).toBeGreaterThan(busy + 1)
    expect(port).toBeLessThanOrEqual(busy + DESKTOP_WEB_PORT_RETRY_LIMIT)
    // The server answers on the port it reports: the bind really happened there.
    expect((await fetch(`http://127.0.0.1:${String(port)}/`)).status).toBeGreaterThan(0)
  })

  it('preserves an OS-assigned port when the explicit value is zero', async () => {
    const context = new Context()
    contexts.push(context)

    await context.plugin(DesktopWebServer, { host: '127.0.0.1', port: 0 })

    expect(context.get('webServer')?.port).toBeGreaterThan(0)
  })
})
