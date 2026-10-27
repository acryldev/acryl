/**
 * Desktop's port rule without real ports: which ports are busy is decided by the test, so nothing on the machine can change the
 * outcome. The one real-socket check is in `webserver.spec.ts`.
 */

import { describe, expect, it } from 'vitest'
import { DESKTOP_WEB_PORT_RETRY_LIMIT, bindDesktopPort } from '../../src/runtime/desktop-port.ts'

const inUse = (): Error => Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' })

/** A bind that fails with EADDRINUSE on `busy` ports and records every port it was asked for. */
function binder(busy: ReadonlySet<number>, other?: { port: number, error: Error }) {
  const tried: number[] = []
  const bind = async (port: number): Promise<void> => {
    tried.push(port)
    if (other?.port === port) throw other.error
    if (busy.has(port)) throw inUse()
  }
  return { tried, bind }
}

describe('Desktop port rule', () => {
  it('binds the requested port when it is free, trying nothing else', async () => {
    const { tried, bind } = binder(new Set())
    expect(await bindDesktopPort(43_120, bind)).toBe(43_120)
    expect(tried).toEqual([43_120])
  })

  it('moves one port on for each port in use, and stops at the first free one', async () => {
    const { tried, bind } = binder(new Set([43_120, 43_121, 43_122]))
    expect(await bindDesktopPort(43_120, bind)).toBe(43_123)
    expect(tried).toEqual([43_120, 43_121, 43_122, 43_123])
  })

  it('throws any other bind failure at once, without trying another port', async () => {
    const denied = Object.assign(new Error('listen EACCES'), { code: 'EACCES' })
    const { tried, bind } = binder(new Set(), { port: 43_120, error: denied })
    await expect(bindDesktopPort(43_120, bind)).rejects.toBe(denied)
    expect(tried).toEqual([43_120])
  })

  it(`gives up after ${String(DESKTOP_WEB_PORT_RETRY_LIMIT)} more ports, with the last EADDRINUSE`, async () => {
    const busy = new Set(Array.from({ length: DESKTOP_WEB_PORT_RETRY_LIMIT + 5 }, (_, index) => 43_120 + index))
    const { tried, bind } = binder(busy)
    await expect(bindDesktopPort(43_120, bind)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(tried).toHaveLength(DESKTOP_WEB_PORT_RETRY_LIMIT + 1)
    expect(tried.at(-1)).toBe(43_120 + DESKTOP_WEB_PORT_RETRY_LIMIT)
  })

  it('never tries a port above 65535', async () => {
    const { tried, bind } = binder(new Set([65_534, 65_535]))
    await expect(bindDesktopPort(65_534, bind)).rejects.toMatchObject({ code: 'EADDRINUSE' })
    expect(tried).toEqual([65_534, 65_535])
  })
})
