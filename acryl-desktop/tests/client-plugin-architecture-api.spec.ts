import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { CordisPlaneSnapshot } from '../src/plugin-architecture-contract.ts'
import {
  createPluginArchitectureApi,
  parseCordisPlaneSnapshot,
} from '../src/client/plugin-architecture-api.ts'

const HOST: CordisPlaneSnapshot = {
  plane: 'host',
  fibers: [{
    uid: 0,
    name: 'root',
    phase: 'active',
    parentUid: null,
    loaderEntryId: null,
    moduleName: null,
    dependencies: [],
    providedServices: [],
    effects: [],
  }],
  services: [],
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Cordis architecture client boundary', () => {
  it('keeps fetched Host and live renderer Client contexts separate', async () => {
    const ctx = new Context()
    await ctx.plugin({ name: 'renderer-only', apply() {} })
    const fetcher = vi.fn(async () => json(HOST))
    const snapshot = await createPluginArchitectureApi(ctx, fetcher).read()

    expect(snapshot.host).toEqual(HOST)
    expect(snapshot.client.plane).toBe('client')
    expect(snapshot.client.fibers.some(fiber => fiber.name === 'renderer-only')).toBe(true)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/desktop/plugins/architecture',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
  })

  it('accepts native empty effect labels without relaxing structural validation', () => {
    expect(parseCordisPlaneSnapshot({
      ...HOST,
      fibers: [{ ...HOST.fibers[0], effects: [{ label: '', children: [] }] }],
    }, 'host').fibers[0]?.effects[0]?.label).toBe('')
  })

  it('rejects unknown fields, duplicate UIDs, inconsistent dependencies, and wrong planes', () => {
    expect(() => parseCordisPlaneSnapshot({ ...HOST, extra: true }, 'host')).toThrow('snapshot')
    expect(() => parseCordisPlaneSnapshot({
      ...HOST,
      fibers: [...HOST.fibers, HOST.fibers[0]],
    }, 'host')).toThrow('duplicate')
    expect(() => parseCordisPlaneSnapshot({
      ...HOST,
      fibers: [{
        ...HOST.fibers[0],
        dependencies: [{ name: 'clock', status: 'resolved', providerFiberUid: null }],
      }],
    }, 'host')).toThrow('inconsistent')
    expect(() => parseCordisPlaneSnapshot(HOST, 'client')).toThrow('snapshot')
  })

  it('does not expose a raw failed response body as architecture state', async () => {
    const ctx = new Context()
    const api = createPluginArchitectureApi(ctx, vi.fn(async () => json({ error: 'unavailable' }, 500)))
    await expect(api.read()).rejects.toThrow('unavailable')
  })
})
