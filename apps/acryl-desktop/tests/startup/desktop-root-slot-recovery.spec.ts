import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_ROOT_SLOT_RETRY_SCRIPT,
  desktopRootSlotRecoveryInjections,
  ROOT_SLOT_RETRY_INTERVAL_MS,
} from '../../src/startup/desktop-root-slot-recovery.ts'

const BOOT_ORDER_MESSAGE = "renderSlot('root') before any 'root' registration (boot order)"

/**
 * Evaluate the retry script in a fresh sandbox sharing `store`/`reload` with
 * any earlier evaluation, mirroring a real page reload: a new script
 * instance, the same `sessionStorage` (survives a same-tab reload) and a
 * spy standing in for `location.reload`, at the clock time `now`.
 */
function evaluateOnce(store: Map<string, string>, reload: ReturnType<typeof vi.fn>, now = 1_000_000) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const sandbox = {
    window: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        (listeners[type] ??= []).push(handler)
      },
    },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    },
    location: { reload },
    Date: { now: () => now },
  }
  vm.createContext(sandbox)
  vm.runInContext(DESKTOP_ROOT_SLOT_RETRY_SCRIPT, sandbox)
  return listeners
}

describe('Desktop root-slot boot-order retry injection', () => {
  it('reloads once on the SlotAssemblyError boot-order message, via a synchronous window error event', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    const listeners = evaluateOnce(store, reload)
    listeners.error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('also catches the message delivered as an unhandledrejection', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    const listeners = evaluateOnce(store, reload)
    listeners.unhandledrejection?.[0]?.({ reason: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('ignores errors that are not the boot-order race', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    const listeners = evaluateOnce(store, reload)
    listeners.error?.[0]?.({ error: new Error('unrelated render failure') })
    listeners.error?.[0]?.({ error: undefined })
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload again when the failure returns right after its reload, so a persistent failure still fails loud', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    const first = evaluateOnce(store, reload, 1_000_000)
    first.error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
    // The reloaded page re-evaluates the script fresh, sharing sessionStorage.
    const second = evaluateOnce(store, reload, 1_000_000 + 2_000)
    second.error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again when the window loses its root long after the last reload (a plugin rebuilt under a running app)', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    evaluateOnce(store, reload, 1_000_000).error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    evaluateOnce(store, reload, 1_000_000 + ROOT_SLOT_RETRY_INTERVAL_MS).error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    evaluateOnce(store, reload, 1_000_000 + 8 * 3_600_000).error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('injects exactly one head-placed script row', () => {
    expect(desktopRootSlotRecoveryInjections()).toEqual([
      { kind: 'script', placement: 'head', text: DESKTOP_ROOT_SLOT_RETRY_SCRIPT },
    ])
  })

  it('is valid standalone script syntax', () => {
    expect(() => Function(DESKTOP_ROOT_SLOT_RETRY_SCRIPT)).not.toThrow()
  })
})
