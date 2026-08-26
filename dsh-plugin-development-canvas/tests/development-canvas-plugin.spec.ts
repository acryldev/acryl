import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/index.ts'
import { canvasPtyRoutePaths } from '../src/canvas-pty-route.ts'

describe('Development Canvas Cordis plugin', () => {
  it('is a separate webServer capability with reversible routes', async () => {
    const routes = new Map<string, WebRoute>()
    const disposers: Array<() => void | Promise<void>> = []
    const ctx = {
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: WebRoute) => {
          routes.set(route.path, route)
          return () => { routes.delete(route.path) }
        },
      },
      logger: { error: vi.fn() },
      effect: (register: () => void | (() => void | Promise<void>)) => {
        const dispose = register()
        if (typeof dispose === 'function') disposers.push(dispose)
        return dispose
      },
    } as unknown as Context

    expect(name).toBe('development-canvas')
    expect(inject).toEqual(['webServer'])
    apply(ctx)

    expect([...routes.keys()].sort()).toEqual(Object.values(canvasPtyRoutePaths).sort())

    for (const dispose of disposers.reverse()) await dispose()
    expect(routes.size).toBe(0)
  })

  it('rolls back routes when activation fails partway through', () => {
    const routes = new Map<string, WebRoute>()
    let registrations = 0
    const ctx = {
      webServer: {
        host: '127.0.0.1',
        port: 43120,
        register: (route: WebRoute) => {
          registrations += 1
          if (registrations === 3) throw new Error('route collision')
          routes.set(route.path, route)
          return () => { routes.delete(route.path) }
        },
      },
      logger: { error: vi.fn() },
      effect: (register: () => void | (() => void | Promise<void>)) => register(),
    } as unknown as Context

    expect(() => apply(ctx)).toThrow('route collision')
    expect(routes.size).toBe(0)
  })

  it('refuses a non-loopback Host', () => {
    const ctx = {
      webServer: { host: '0.0.0.0', port: 43120 },
    } as unknown as Context
    expect(() => apply(ctx)).toThrow('development canvas requires a loopback Web server')
  })
})
