import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_PREFERENCES_PATH, desktopPreferencesRoutes, type DesktopPreferencesStore } from '../../src/settings/desktop-preferences-route.ts'
import { call, postJson } from '../api/call.ts'

function store(): DesktopPreferencesStore & { update: ReturnType<typeof vi.fn> } {
  const values: Record<string, unknown> = {
    'dsh-desktop': { mode: 'advanced', port: 3080 },
    'dsh-desktop-notifications': { enabled: true },
  }
  return {
    get: (namespace: string) => values[namespace],
    update: vi.fn(async (namespace: string, patch: Readonly<Record<string, unknown>>) => {
      if (patch.port === 'bad') throw new Error('schema refused')
      values[namespace] = { ...(values[namespace] as object), ...patch }
    }),
  }
}

describe('desktop preferences route', () => {
  it('reads the two allowed namespaces', async () => {
    const res = await call(desktopPreferencesRoutes(store()), DESKTOP_PREFERENCES_PATH)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      'dsh-desktop': { mode: 'advanced', port: 3080 },
      'dsh-desktop-notifications': { enabled: true },
    })
  })

  it('applies a validated patch and answers the new values', async () => {
    const s = store()
    const res = await postJson(desktopPreferencesRoutes(s), DESKTOP_PREFERENCES_PATH, { namespace: 'dsh-desktop-notifications', patch: { enabled: false } })
    expect(res.status).toBe(200)
    expect(s.update).toHaveBeenCalledWith('dsh-desktop-notifications', { enabled: false })
    expect((await res.json() as Record<string, unknown>)['dsh-desktop-notifications']).toEqual({ enabled: false })
  })

  it.each([
    ['another namespace', { namespace: 'market', patch: { enabled: false } }],
    ['an empty patch', { namespace: 'dsh-desktop', patch: {} }],
    ['a nested value', { namespace: 'dsh-desktop', patch: { mode: { a: 1 } } }],
    ['an extra key', { namespace: 'dsh-desktop', patch: { mode: 'advanced' }, extra: 1 }],
  ])('refuses %s without touching the store', async (_label, body) => {
    const s = store()
    const res = await postJson(desktopPreferencesRoutes(s), DESKTOP_PREFERENCES_PATH, body)
    expect(res.status).toBe(400)
    expect(s.update).not.toHaveBeenCalled()
  })

  it('refuses a body over 4 KiB with 413 before the store is touched', async () => {
    const s = store()
    const res = await postJson(desktopPreferencesRoutes(s), DESKTOP_PREFERENCES_PATH, { namespace: 'dsh-desktop', patch: { mode: 'x'.repeat(5000) } })
    expect(res.status).toBe(413)
    expect(s.update).not.toHaveBeenCalled()
  })

  it('reports a schema refusal as 422 and reports the cause', async () => {
    const report = vi.fn()
    const res = await postJson(desktopPreferencesRoutes(store(), report), DESKTOP_PREFERENCES_PATH, { namespace: 'dsh-desktop', patch: { port: 'bad' } })
    expect(res.status).toBe(422)
    expect(report).toHaveBeenCalledWith('update preferences', expect.any(Error))
  })

  it('refuses a cross-origin write and other methods', async () => {
    const s = store()
    const cross = await postJson(desktopPreferencesRoutes(s), DESKTOP_PREFERENCES_PATH, { namespace: 'dsh-desktop', patch: { mode: 'advanced' } }, {
      headers: { origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' },
    })
    expect(cross.status).toBe(403)
    const put = await call(desktopPreferencesRoutes(s), DESKTOP_PREFERENCES_PATH, { method: 'PUT' })
    expect(put.status).toBe(405)
    expect(put.headers.get('allow')).toContain('POST')
    expect(s.update).not.toHaveBeenCalled()
  })
})
