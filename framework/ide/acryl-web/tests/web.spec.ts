/**
 * The seam: `acrylWeb` follows DSH's `webServer` while a plugin is loaded and is gone when it unloads. There is no ACRYL test to port for this file
 * (ACRYL adapts the same two reads inside its engine); this one pins the adapter's contract.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, inject, name } from '../src/index.ts'

function fakeWebServer(ctx: Context) {
  let address = { host: '127.0.0.1', port: 3100 }
  ;(ctx as unknown as { provide(name: string, value: unknown): unknown }).provide('webServer', {
    get host() {
      return address.host
    },
    get port() {
      return address.port
    },
  })
  return {
    listen(host: string, port: number) {
      address = { host, port }
    },
  }
}

describe('the acrylWeb service', () => {
  it('follows the web server it is bound to, and leaves when the plugin unloads', async () => {
    expect(name).toBe('acryl-web')
    expect(inject).toEqual(['webServer'])
    const ctx = new Context()
    const server = fakeWebServer(ctx)
    const fiber = ctx.plugin({ name, inject, apply })
    await expect(fiber).resolves.toBeDefined()
    expect((ctx as unknown as { acrylWeb?: { host: string; port: number } }).acrylWeb).toMatchObject({ host: '127.0.0.1', port: 3100 })
    server.listen('127.0.0.1', 4321)
    expect((ctx as unknown as { acrylWeb?: { host: string; port: number } }).acrylWeb?.port).toBe(4321)
    await (fiber as unknown as { dispose(): Promise<void> }).dispose()
    expect((ctx as unknown as { acrylWeb?: unknown }).acrylWeb).toBeUndefined()
  })
})
