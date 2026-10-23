import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import { marketRoutes } from '../src/host/routes.js'
import { callRoute, routerServices } from './router-harness.js'

interface Injection {
  readonly names: readonly string[]
  readonly factory: (ctx: { get(name: string): unknown; effect(factory: () => void | (() => void)): void }) => void
  cleanups: (() => void)[]
  active: boolean
}

function createHarness() {
  const values = new Map<string, unknown>()
  const injections: Injection[] = []
  const globalCleanups: (() => void)[] = []
  let activeInjection: Injection | undefined
  let settings: Record<string, unknown> = { sources: [], installReceipts: [] }

  const registerEffect = (factory: () => void | (() => void), owner = activeInjection): void => {
    const cleanup = factory()
    if (typeof cleanup !== 'function') return
    if (owner === undefined) globalCleanups.push(cleanup)
    else owner.cleanups.push(cleanup)
  }

  const activate = (injection: Injection): void => {
    if (injection.active || !injection.names.every(name => values.has(name))) return
    injection.active = true
    activeInjection = injection
    injection.factory({
      get: name => values.get(name),
      effect: factory => { registerEffect(factory, injection) },
    })
    activeInjection = undefined
  }

  const webServer = { register: vi.fn(() => () => undefined) }
  const services = routerServices(webServer as never)
  const context = {
    logger: { error: vi.fn() },
    acrylSettings: {
      register: vi.fn(() => ({
        get: () => settings,
        update: async (patch: Record<string, unknown>) => { settings = { ...settings, ...patch } },
      })),
    },
    webServer,
    ...services,
    effect: (factory: () => void | (() => void)) => { registerEffect(factory) },
    inject: (
      names: readonly string[],
      factory: (ctx: { get(name: string): unknown; effect(factory: () => void | (() => void)): void }) => void,
    ) => {
      const injection: Injection = { names, factory, cleanups: [], active: false }
      injections.push(injection)
      activate(injection)
    },
  }

  const request = async (path: string) => {
    const result = await callRoute(services.router, path)
    return { status: result.status, body: result.body }
  }

  return {
    context,
    request,
    provide(name: string, value: unknown) {
      values.set(name, value)
      for (const injection of injections) activate(injection)
    },
    remove(name: string) {
      values.delete(name)
      for (const injection of injections) {
        if (!injection.active || !injection.names.includes(name)) continue
        for (const cleanup of injection.cleanups.splice(0).reverse()) cleanup()
        injection.active = false
      }
    },
    dispose() {
      for (const injection of injections.toReversed()) {
        for (const cleanup of injection.cleanups.splice(0).reverse()) cleanup()
        injection.active = false
      }
      for (const cleanup of globalCleanups.splice(0).reverse()) cleanup()
    },
  }
}

describe('community market Host capability lifecycle', () => {
  it('keeps desktop routes fail-closed until capabilities are live and after they are disposed', async () => {
    const harness = createHarness()
    apply(harness.context as never)

    await expect(harness.request(marketRoutes.installable)).resolves.toMatchObject({ status: 503 })
    await expect(harness.request(marketRoutes.state)).resolves.toMatchObject({
      status: 200,
      body: { desktopActions: { openTerminal: false, requestRestart: false } },
    })

    harness.provide('desktopActions', {
      openTerminal: vi.fn(),
      requestRestart: vi.fn(async () => {}),
    })
    await expect(harness.request(marketRoutes.state)).resolves.toMatchObject({
      body: { desktopActions: { openTerminal: true, requestRestart: false } },
    })

    harness.provide('desktopProfiles', { current: { name: 'web', dir: 'C:/fixture-profile' } })
    harness.provide('desktopPnpm', {})
    await expect(harness.request(marketRoutes.installable)).resolves.toMatchObject({ status: 404 })

    harness.remove('desktopPnpm')
    await expect(harness.request(marketRoutes.installable)).resolves.toMatchObject({ status: 503 })

    harness.dispose()
  })
})
