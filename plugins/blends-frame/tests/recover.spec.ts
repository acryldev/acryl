import { describe, expect, it } from 'vitest'
import { installRecovery, installRecoveryOnce, isRecoverable, RELOAD_GAP_MS } from '../src/client/recover.ts'

function fakeWindow() {
  const listeners: Record<string, ((event: { error?: unknown; reason?: unknown }) => void)[]> = { error: [], unhandledrejection: [] }
  const store = new Map<string, string>()
  const w = {
    reloads: 0,
    addEventListener: (type: string, l: (event: { error?: unknown; reason?: unknown }) => void) => { listeners[type]!.push(l) },
    removeEventListener: (type: string, l: (event: { error?: unknown; reason?: unknown }) => void) => { listeners[type] = listeners[type]!.filter(x => x !== l) },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } },
    location: { reload: () => { w.reloads += 1 } },
    fire: (type: string, event: { error?: unknown; reason?: unknown }) => { for (const l of listeners[type]!) l(event) },
  }
  return w
}

describe('recovering a blank page', () => {
  it('reloads once for the known slot-assembly error, not again within the gap, and never for other errors', () => {
    const w = fakeWindow()
    let now = 1_000_000
    const stop = installRecovery(w, () => now)
    const known = Object.assign(new Error("scope 'session-maybe' rendered without an installed adapter"), { name: 'SlotAssemblyError' })
    w.fire('error', { error: new Error('something else') })
    expect(w.reloads).toBe(0)
    w.fire('error', { error: known })
    expect(w.reloads).toBe(1)
    now += 1000
    w.fire('unhandledrejection', { reason: known })
    expect(w.reloads).toBe(1)
    now += RELOAD_GAP_MS
    w.fire('error', { error: known })
    expect(w.reloads).toBe(2)
    stop()
    now += RELOAD_GAP_MS
    w.fire('error', { error: known })
    expect(w.reloads).toBe(2)
    expect(isRecoverable('nothing')).toBe(false)
  })

  it('installs once per page and stays installed: the race unloads the plugin that installed it', () => {
    const w = fakeWindow()
    installRecoveryOnce(w, () => 5_000_000)
    installRecoveryOnce(w, () => 5_000_000)
    w.fire('error', { error: new Error("scope 'session-maybe' rendered without an installed adapter") })
    expect(w.reloads).toBe(1)
  })
})
