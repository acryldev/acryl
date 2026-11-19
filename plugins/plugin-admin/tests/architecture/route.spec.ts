import { describe, expect, it, vi } from 'vitest'
import { PLUGIN_ARCHITECTURE_PATH, type CordisPlaneSnapshot } from '../../src/architecture/contract.ts'
import { architectureRoutes, type PluginArchitectureRouteController } from '../../src/architecture/route.ts'
import { call } from '../call.ts'

const SNAPSHOT: CordisPlaneSnapshot = { plane: 'host', fibers: [], services: [] }

describe('Cordis architecture private route', () => {
  it('serves only the own page, and only GET', async () => {
    const app = architectureRoutes({ snapshot: () => SNAPSHOT })
    const ok = await call(app, PLUGIN_ARCHITECTURE_PATH)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual(SNAPSHOT)
    expect(ok.headers.get('cache-control')).toBe('no-store')

    expect((await call(app, PLUGIN_ARCHITECTURE_PATH, { headers: { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' } })).status).toBe(403)
    expect((await call(app, PLUGIN_ARCHITECTURE_PATH, { remoteAddress: '10.0.0.2' })).status).toBe(403)
    const method = await call(app, PLUGIN_ARCHITECTURE_PATH, { method: 'POST' })
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('GET, HEAD')
  })

  it('contains projection failures and reports them to the Host logger', async () => {
    const report = vi.fn()
    const controller: PluginArchitectureRouteController = {
      snapshot: () => { throw new Error('/private/path') },
    }
    const res = await call(architectureRoutes(controller, report), PLUGIN_ARCHITECTURE_PATH)
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('/private/path')
    expect(report).toHaveBeenCalledWith('read Cordis architecture', expect.any(Error))
  })
})
