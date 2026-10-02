import { describe, expect, it, vi } from 'vitest'
import type { DesktopSettingsApi } from '../../../src/client/settings/desktop-settings-api.ts'
import { createPreferenceScopes } from '../../../src/client/settings/desktop-preferences.ts'

function fakeApi(initial: Record<string, unknown>): DesktopSettingsApi & { setPreference: ReturnType<typeof vi.fn> } {
  let sections = initial
  return {
    read: vi.fn(),
    createProfile: vi.fn(),
    selectProfile: vi.fn(),
    deleteProfile: vi.fn(),
    selectMarket: vi.fn(),
    openTerminal: vi.fn(),
    readPreferences: vi.fn(async () => sections),
    setPreference: vi.fn(async (namespace: string, patch: Readonly<Record<string, string | number | boolean>>) => {
      sections = { ...sections, [namespace]: { ...(sections[namespace] as object), ...patch } }
      return sections
    }),
  }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

describe('desktop preference scopes', () => {
  it('start loading, then expose the Host values as ready and writable', async () => {
    const scopeFor = createPreferenceScopes(fakeApi({ ns: { enabled: true } }))
    const scope = scopeFor<{ enabled: boolean }>('ns')
    expect(scope.getSnapshot()).toMatchObject({ status: 'loading', writable: false })
    await settle()
    expect(scope.getSnapshot()).toEqual({ status: 'ready', writable: true, value: { enabled: true } })
    expect(scope.getSnapshot()).toBe(scope.getSnapshot())
  })

  it('writes through the Host, notifies subscribers, and shares the result across scopes', async () => {
    const api = fakeApi({ a: { enabled: true }, b: { mode: 'advanced' } })
    const scopeFor = createPreferenceScopes(api)
    const a = scopeFor<{ enabled: boolean }>('a')
    const b = scopeFor<{ mode: string }>('b')
    await settle()
    const seen = vi.fn()
    b.subscribe(seen)
    await a.set('enabled', false)
    expect(api.setPreference).toHaveBeenCalledWith('a', { enabled: false })
    expect(a.getSnapshot().value).toEqual({ enabled: false })
    expect(seen).toHaveBeenCalled()
  })

  it('reports unavailable for an unknown namespace and when the Host cannot be reached', async () => {
    const scopeFor = createPreferenceScopes(fakeApi({ a: {} }))
    const missing = scopeFor('nope')
    await settle()
    expect(missing.getSnapshot()).toMatchObject({ status: 'unavailable', writable: false })

    const broken = fakeApi({})
    broken.readPreferences = vi.fn(async () => { throw new Error('down') })
    const down = createPreferenceScopes(broken)('a')
    await settle()
    expect(down.getSnapshot().status).toBe('unavailable')
  })

  it('rejects a write the Host refuses and leaves the value alone', async () => {
    const api = fakeApi({ a: { n: 1 } })
    api.setPreference.mockRejectedValueOnce(new Error('refused'))
    const scope = createPreferenceScopes(api)<{ n: number }>('a')
    await settle()
    await expect(scope.set('n', 2)).rejects.toThrow('refused')
    expect(scope.getSnapshot().value).toEqual({ n: 1 })
  })
})
