import { describe, expect, it, vi } from 'vitest'
import { PluginLifecycleError } from 'acryl-control'
import {
  PLUGIN_LIFECYCLE_DISABLE_PATH,
  PLUGIN_LIFECYCLE_ENABLE_PATH,
  PLUGIN_LIFECYCLE_PATH,
  PLUGIN_LIFECYCLE_RELOAD_PATH,
  type PluginLifecycleReceipt,
  type PluginLifecycleSnapshot,
} from '../../src/lifecycle/contract.ts'
import { lifecycleRoutes, type PluginLifecycleRouteController } from '../../src/lifecycle/route.ts'
import { call, post } from '../call.ts'

const SNAPSHOT: PluginLifecycleSnapshot = { entries: [], blend: null }
const RECEIPT: PluginLifecycleReceipt = {
  accepted: true,
  action: 'reload',
  entryIds: ['include:acryl-development-canvas'],
  rendererReloadRequired: true,
  snapshot: SNAPSHOT,
}
const ENTRY = { entryId: 'include:acryl-development-canvas' }

function controller(): PluginLifecycleRouteController & {
  snapshot: ReturnType<typeof vi.fn>
  setEnabled: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
} {
  return {
    snapshot: vi.fn(() => SNAPSHOT),
    setEnabled: vi.fn(async (_entryId: string, enabled: boolean) => ({
      ...RECEIPT,
      action: enabled ? 'enable' as const : 'disable' as const,
    })),
    reload: vi.fn(async () => RECEIPT),
  }
}

describe('plugin lifecycle private routes', () => {
  it('serves the snapshot only to the own page', async () => {
    const app = lifecycleRoutes(controller())
    const ok = await call(app, PLUGIN_LIFECYCLE_PATH)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual(SNAPSHOT)
    expect((await call(app, PLUGIN_LIFECYCLE_PATH, { headers: { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
  })

  it('answers enable, disable and reload with the receipt, and does not restart anything itself', async () => {
    const control = controller()
    const app = lifecycleRoutes(control)
    const enabled = await post(app, PLUGIN_LIFECYCLE_ENABLE_PATH, ENTRY)
    expect(enabled.status).toBe(200)
    expect(await enabled.json()).toMatchObject({ action: 'enable' })
    expect(control.setEnabled).toHaveBeenLastCalledWith(ENTRY.entryId, true)
    expect(await (await post(app, PLUGIN_LIFECYCLE_DISABLE_PATH, ENTRY)).json()).toMatchObject({ action: 'disable' })
    expect(control.setEnabled).toHaveBeenLastCalledWith(ENTRY.entryId, false)
    expect((await post(app, PLUGIN_LIFECYCLE_RELOAD_PATH, ENTRY)).status).toBe(200)
    expect(control.reload).toHaveBeenLastCalledWith(ENTRY.entryId)
    // An empty body reloads every mounted managed entry.
    expect((await post(app, PLUGIN_LIFECYCLE_RELOAD_PATH, {})).status).toBe(200)
    expect(control.reload).toHaveBeenLastCalledWith(undefined)
  })

  it('rejects malformed, foreign and unsupported requests before dispatch', async () => {
    const control = controller()
    const app = lifecycleRoutes(control)
    const malformed = await post(app, PLUGIN_LIFECYCLE_ENABLE_PATH, { entryId: '', extra: true })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({ error: 'invalid plugin enable request' })
    expect((await call(app, PLUGIN_LIFECYCLE_RELOAD_PATH, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } })).status).toBe(400)
    expect((await call(app, PLUGIN_LIFECYCLE_RELOAD_PATH, { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })).status).toBe(415)
    expect((await post(app, PLUGIN_LIFECYCLE_RELOAD_PATH, { entryId: 'x'.repeat(20_000) })).status).toBe(413)
    expect((await post(app, PLUGIN_LIFECYCLE_RELOAD_PATH, {}, { remoteAddress: '10.0.0.2' })).status).toBe(403)
    // A change must carry the exact Origin; same-origin fetch metadata is enough only for a read.
    expect((await post(app, PLUGIN_LIFECYCLE_RELOAD_PATH, {}, { headers: { origin: undefined, referer: 'http://127.0.0.1:43120/' } })).status).toBe(403)
    const method = await call(app, PLUGIN_LIFECYCLE_RELOAD_PATH)
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('POST')
    expect(control.reload).not.toHaveBeenCalled()
    expect(control.setEnabled).not.toHaveBeenCalled()
  })

  it('maps controller rejection to a conflict without leaking a raw cause', async () => {
    const control = controller()
    const report = vi.fn()
    control.reload.mockRejectedValueOnce(new PluginLifecycleError(
      'protected-entry',
      'private failure at /Users/example/secret',
    ))
    const res = await post(lifecycleRoutes(control, report), PLUGIN_LIFECYCLE_RELOAD_PATH, {})
    expect(res.status).toBe(409)
    const body = await res.text()
    expect(JSON.parse(body)).toEqual({ error: 'The selected plugin is a core capability and cannot be toggled.' })
    expect(body).not.toContain('/Users/example')
    expect(report).toHaveBeenCalledWith('reload plugin', expect.any(PluginLifecycleError))
  })
})
