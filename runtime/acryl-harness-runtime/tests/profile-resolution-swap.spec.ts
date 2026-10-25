/**
 * The profile resolution the DSH engine installs on Node's loaders (module hooks and a `Module._resolveFilename` wrapper) belongs to the
 * engine's activation: swapping the engine away removes both, and swapping it back installs exactly one layer again. Counted through
 * `Module.registerHooks`, which src/module-hooks.ts reads at call time, and checked by identity on `_resolveFilename`.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import Module from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDshEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

type Register = (options: unknown) => { deregister(): void }
const nodeModule = Module as unknown as { registerHooks: Register, _resolveFilename: unknown }
const originalRegister = nodeModule.registerHooks
const initialDshHome = process.env.DSH_HOME
const homes: string[] = []

afterEach(async () => {
  nodeModule.registerHooks = originalRegister
  if (initialDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = initialDshHome
  await Promise.all(homes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('profile resolution across engine swaps', () => {
  it('removes its module hooks and resolver wrapper when the DSH engine is swapped away, and installs one layer when it comes back', async () => {
    let live = 0
    nodeModule.registerHooks = options => {
      const hooks = originalRegister(options)
      live += 1
      let deregistered = false
      return {
        deregister() {
          if (!deregistered) { deregistered = true; live -= 1 }
          hooks.deregister()
        },
      }
    }
    const home = await mkdtemp(join(tmpdir(), 'acryl-resolution-swap-'))
    homes.push(home)
    process.env.DSH_HOME = home
    const nativeResolveFilename = nodeModule._resolveFilename

    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinition('acryl-swap'), { id: 'other', plugin: () => {} }],
      initialEngine: 'dsh',
    })
    try {
      const mounted = live
      expect(mounted).toBeGreaterThan(0)
      expect(nodeModule._resolveFilename).not.toBe(nativeResolveFilename)
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await host.select('other')
        expect(live, `hooks left after swap ${String(cycle + 1)}`).toBe(0)
        expect(nodeModule._resolveFilename).toBe(nativeResolveFilename)
        await host.select('dsh')
        expect(live, `hooks after remount ${String(cycle + 1)}`).toBe(mounted)
        expect(host.ctx.get('sessions')).toBeDefined()
      }
    } finally {
      await host.dispose()
    }
    expect(live).toBe(0)
    expect(nodeModule._resolveFilename).toBe(nativeResolveFilename)
  }, 120_000)
})
