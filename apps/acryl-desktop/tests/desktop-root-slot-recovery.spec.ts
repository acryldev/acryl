import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_ROOT_SLOT_RETRY_SCRIPT,
  desktopRootSlotRecoveryInjections,
} from '../src/desktop-root-slot-recovery.ts'

const BOOT_ORDER_MESSAGE = "renderSlot('root') before any 'root' registration (boot order)"

/**
 * Evaluate the retry script in a fresh sandbox sharing `store`/`reload` with
 * any earlier evaluation, mirroring a real page reload: a new script
 * instance, the same `sessionStorage` (survives a same-tab reload) and a
 * spy standing in for `location.reload`.
 */
function evaluateOnce(store: Map<string, string>, reload: ReturnType<typeof vi.fn>) {
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

  it('does not reload a second time across a real reload if the race recurs, so a persistent failure still fails loud', () => {
    const store = new Map<string, string>()
    const reload = vi.fn()
    // First page load: the race fires, the script reloads once.
    const first = evaluateOnce(store, reload)
    first.error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
    // The reloaded page re-evaluates the script fresh, sharing sessionStorage.
    // If the race recurs (a genuinely persistent failure, not a transient
    // one), the guard must block a second reload.
    const second = evaluateOnce(store, reload)
    second.error?.[0]?.({ error: new Error(BOOT_ORDER_MESSAGE) })
    expect(reload).toHaveBeenCalledTimes(1)
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
