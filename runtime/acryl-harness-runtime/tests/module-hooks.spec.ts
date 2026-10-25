import Module from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { installProfilePackageResolver } from '../src/module-resolution.ts'
import { ModuleHooksUnavailableError, registerModuleHooks } from '../src/module-hooks.ts'
import { installRuntimeInterception } from '../src/profile-resolution/resolver.ts'

const nodeModule = Module as { registerHooks?: unknown }
const original = nodeModule.registerHooks

describe('a runtime without module.registerHooks', () => {
  afterEach(() => {
    nodeModule.registerHooks = original
  })

  it('registers hooks through the public API when it exists', () => {
    const hooks = registerModuleHooks({ resolve: (specifier, context, next) => next(specifier, context) })
    hooks.deregister()
  })

  it('fails profile package routing with a message that names the runtime', () => {
    delete nodeModule.registerHooks
    const message = /^DSH provider unavailable on Node \d+\.\d+\.\d+: profile packages load through module\.registerHooks/
    expect(() => registerModuleHooks({})).toThrow(ModuleHooksUnavailableError)
    expect(() => installRuntimeInterception({ entries: [], profileDir: '/profile' } as never)).toThrow(message)
    const resolveFilename = (Module as unknown as { _resolveFilename: unknown })._resolveFilename
    expect(() => installProfilePackageResolver('file:///profile/package.json', {
      installEntryUrl: 'file:///install/main.js',
      installPackageUrl: 'file:///install/package.json',
      loaderEntryUrl: 'file:///install/node_modules/loader/index.js',
      binName: 'acryl',
    })).toThrow(message)
    // Nothing was patched on the way to the failure.
    expect((Module as unknown as { _resolveFilename: unknown })._resolveFilename).toBe(resolveFilename)
  })
})
