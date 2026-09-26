import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as adminPlugin from '../src/index.ts'
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

    root.provide('webServer', server)
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
    root.provide('webServer', server)
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
