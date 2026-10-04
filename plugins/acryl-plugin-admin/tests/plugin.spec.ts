import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import * as adminPlugin from '../src/index.ts'
import { unlockedBlueprintSource } from '../src/index.ts'
import { PLUGIN_ARCHITECTURE_PATH } from '../src/architecture/contract.ts'
import { PLUGIN_LIFECYCLE_PATH, PLUGIN_LIFECYCLE_RELOAD_PATH } from '../src/lifecycle/contract.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

function webServer() {
  const paths: string[] = []
  return {
    port: 4321,
    paths,
    register(route: { path: string }) { paths.push(route.path); return () => { paths.splice(paths.indexOf(route.path), 1) } },
  }
}

const lifecycleService = {
  snapshot: () => ({ entries: [] }),
  setEnabled: async () => { throw new Error('unused') },
  reload: async () => { throw new Error('unused') },
}

describe('acryl-plugin-admin Host plugin (one plugin for every surface)', () => {
  it('serves the architecture route with only a web server, and the lifecycle routes once a surface publishes the shared lifecycle', async () => {
    const server = webServer()
    const root = new Context()
    const fiber = root.plugin(adminPlugin)
    await settle()
    expect(fiber.state).toBe(PENDING)

    root.provide('acrylWeb', server)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(server.paths).toEqual([PLUGIN_ARCHITECTURE_PATH])

    root.provide('acrPluginLifecycle', lifecycleService)
    await settle()
    expect(server.paths).toContain(PLUGIN_LIFECYCLE_PATH)
    expect(server.paths).toContain(PLUGIN_LIFECYCLE_RELOAD_PATH)
    expect(server.paths).toHaveLength(5)
    expect(fiber.state).toBe(ACTIVE)
    await fiber.dispose()
  })

  it('takes its lifecycle routes down when the lifecycle service goes away, keeps the architecture route, and restores them when it returns', async () => {
    const server = webServer()
    const root = new Context()
    root.provide('acrylWeb', server)
    const dispose = root.provide('acrPluginLifecycle', lifecycleService)
    const fiber = root.plugin(adminPlugin)
    await settle()
    expect(server.paths).toHaveLength(5)

    dispose()
    await settle()
    expect(server.paths).toEqual([PLUGIN_ARCHITECTURE_PATH])
    expect(fiber.state).toBe(ACTIVE)

    root.provide('acrPluginLifecycle', lifecycleService)
    await settle()
    expect(server.paths).toHaveLength(5)
    expect(new Set(server.paths).size).toBe(5)
    await fiber.dispose()
    expect(server.paths).toEqual([])
  })
})

describe('unlockedBlueprintSource (spec 040 T083: an honest identity for a surface with no locked Blend)', () => {
  const saved = { id: process.env.ACRYL_BLUEPRINT_ID, name: process.env.ACRYL_BLUEPRINT_NAME }
  afterEach(() => {
    for (const [key, value] of [['ACRYL_BLUEPRINT_ID', saved.id], ['ACRYL_BLUEPRINT_NAME', saved.name]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('reports a Blueprint by the display name the engine published, built-in or custom', () => {
    process.env.ACRYL_BLUEPRINT_ID = 'acryl.ide'
    process.env.ACRYL_BLUEPRINT_NAME = 'ACRYL'
    expect(unlockedBlueprintSource([{}, {}])).toEqual({ locked: false, id: 'acryl.ide', name: 'ACRYL', rows: [{}, {}] })
    process.env.ACRYL_BLUEPRINT_ID = '/a/custom-blueprint.yaml'
    process.env.ACRYL_BLUEPRINT_NAME = 'Acme Notes'
    expect(unlockedBlueprintSource([])).toEqual({ locked: false, id: '/a/custom-blueprint.yaml', name: 'Acme Notes', rows: [] })
  })

  it('falls back to the id itself when only the id is set', () => {
    process.env.ACRYL_BLUEPRINT_ID = '/a/custom-blueprint.yaml'
    delete process.env.ACRYL_BLUEPRINT_NAME
    expect(unlockedBlueprintSource([])).toEqual({ locked: false, id: '/a/custom-blueprint.yaml', name: '/a/custom-blueprint.yaml', rows: [] })
  })

  it('is undefined with no selection set (a surface with a locked Blend never falls back to this)', () => {
    delete process.env.ACRYL_BLUEPRINT_ID
    expect(unlockedBlueprintSource([])).toBeUndefined()
  })
})
