import { describe, expect, it, vi } from 'vitest'
import {
  createPluginLifecycleApi,
  parsePluginLifecycleSnapshot,
  type PluginLifecycleClientLoader,
} from '../src/client/plugin-lifecycle-api.ts'

const ENTRY = {
  entryId: 'include:desktop-development-canvas',
  moduleName: 'acryl-development-canvas',
  enabled: true,
  hostPhase: 'active',
  clientPackage: 'acryl-development-canvas',
  clientInBootGraph: true,
  mutable: true,
  protectedReason: null,
  dependents: [],
} as const

function loader(state = 2): PluginLifecycleClientLoader {
  return {
    * entries() {
      yield { options: { name: 'acryl-development-canvas' }, fiber: { state } }
    },
  }
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function receipt(action: 'enable' | 'disable' | 'reload') {
  return {
    accepted: true,
    action,
    entryIds: [ENTRY.entryId],
    rendererReloadRequired: true,
    snapshot: { entries: [ENTRY] },
  }
}

describe('plugin lifecycle client API', () => {
  it('strictly parses snapshots and rejects inconsistent policy', () => {
    expect(parsePluginLifecycleSnapshot({ entries: [ENTRY] })).toEqual({ entries: [ENTRY] })
    expect(() => parsePluginLifecycleSnapshot({
      entries: [{ ...ENTRY, mutable: true, protectedReason: 'protected' }],
    })).toThrow('inconsistent')
    expect(() => parsePluginLifecycleSnapshot({ entries: [{ ...ENTRY, extra: true }] }))
      .toThrow('invalid plugin lifecycle entry')
    expect(() => parsePluginLifecycleSnapshot({ entries: [ENTRY], extra: true }))
      .toThrow('invalid plugin lifecycle snapshot')
    expect(() => parsePluginLifecycleSnapshot({ entries: [ENTRY, ENTRY] })).toThrow('duplicate')
  })

  it('merges the current Client Loader phase into the Host snapshot', async () => {
    const fetcher = vi.fn(async () => response({ entries: [ENTRY] }))
    const api = createPluginLifecycleApi(loader(), fetcher)

    await expect(api.read()).resolves.toEqual({
      entries: [{ ...ENTRY, clientPhase: 'active', clientMounted: true }],
    })
    expect(fetcher).toHaveBeenCalledWith('/api/desktop/plugins/lifecycle', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
    }))
  })

  it.each([
    ['enable', 'include:desktop-development-canvas', '/api/desktop/plugins/lifecycle/enable'],
    ['disable', 'include:desktop-development-canvas', '/api/desktop/plugins/lifecycle/disable'],
    ['reload', 'include:desktop-development-canvas', '/api/desktop/plugins/lifecycle/reload'],
  ] as const)('posts %s and reloads only after a valid receipt', async (action, entryId, path) => {
    const reloadPage = vi.fn()
    const fetcher = vi.fn(async () => response(receipt(action)))
    const api = createPluginLifecycleApi(loader(), fetcher, reloadPage)

    await api[action](entryId)

    expect(fetcher).toHaveBeenCalledWith(path, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entryId }),
    }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('supports reload-all with an exact empty request', async () => {
    const reloadPage = vi.fn()
    const fetcher = vi.fn(async () => response(receipt('reload')))
    const api = createPluginLifecycleApi(loader(), fetcher, reloadPage)
    await api.reload()
    expect(fetcher).toHaveBeenCalledWith('/api/desktop/plugins/lifecycle/reload', expect.objectContaining({
      body: '{}',
    }))
  })

  it('reconciles the client Loader in place instead of reloading the page', async () => {
    const update = vi.fn(async () => {})
    const restart = vi.fn(async () => {})
    const softLoader: PluginLifecycleClientLoader = {
      * entries() {
        yield {
          options: { name: 'acryl-development-canvas' },
          fiber: { state: 2, restart },
          disabled: false,
          update,
        }
      },
    }
    for (const action of ['enable', 'disable', 'reload'] as const) {
      update.mockClear(); restart.mockClear()
      const reloadPage = vi.fn()
      const api = createPluginLifecycleApi(softLoader, vi.fn(async () => response(receipt(action))), reloadPage)
      await api[action]('include:desktop-development-canvas')
      expect(reloadPage).not.toHaveBeenCalled()
      if (action === 'reload') expect(restart).toHaveBeenCalledOnce()
      else expect(update).toHaveBeenCalledWith({ disabled: action === 'disable' })
    }
  })

  it('falls back to a page reload when the browser bundle is not yet in the graph', async () => {
    const reloadPage = vi.fn()
    const emptyLoader: PluginLifecycleClientLoader = { * entries() {} }
    const api = createPluginLifecycleApi(emptyLoader, vi.fn(async () => response(receipt('enable'))), reloadPage)
    await api.enable('include:desktop-development-canvas')
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('does not reload after a rejected or malformed response', async () => {
    const reloadPage = vi.fn()
    const rejected = createPluginLifecycleApi(
      loader(),
      vi.fn(async () => response({ error: 'protected' }, 409)),
      reloadPage,
    )
    await expect(rejected.reload()).rejects.toThrow('protected')

    const malformed = createPluginLifecycleApi(
      loader(),
      vi.fn(async () => response({ accepted: true })),
      reloadPage,
    )
    await expect(malformed.reload()).rejects.toThrow('invalid plugin lifecycle receipt')
    expect(reloadPage).not.toHaveBeenCalled()
  })
})
