import { describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import { WEB_PORT_ATTEMPTS, findFreeWebPort, loopbackPortIsFree, webPortPatch } from '../src/web-port.ts'

describe('finding a free port', () => {
  it('moves the server on the loopback address only', () => {
    expect(webPortPatch(3081)).toEqual({ id: 'webserver', config: { host: '127.0.0.1', port: 3081 } })
  })

  it('starts at the preferred port and moves up one at a time', async () => {
    expect(await findFreeWebPort(3081, async () => true)).toBe(3081)
    const taken = new Set([3081, 3082])
    expect(await findFreeWebPort(3081, async port => !taken.has(port))).toBe(3083)
  })

  it('gives up with a message that says what to change, and never passes 65535', async () => {
    await expect(findFreeWebPort(3081, async () => false)).rejects.toThrow(/ACRYL_WEB_PORT/)
    expect(WEB_PORT_ATTEMPTS).toBeGreaterThan(1)
    await expect(findFreeWebPort(65_535, async () => false)).rejects.toThrow(/65535/)
  })

  it('sees a real listener on the loopback port', async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen({ host: '127.0.0.1', port: 0 }, resolve))
    const { port } = server.address() as { port: number }
    try {
      expect(await loopbackPortIsFree(port)).toBe(false)
      expect(await findFreeWebPort(port)).toBeGreaterThan(port)
    } finally { await new Promise(resolve => server.close(resolve)) }
    expect(await loopbackPortIsFree(port)).toBe(true)
  })
})
