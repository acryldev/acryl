// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// Vitest runs from the package directory.
const bundle = join(process.cwd(), 'lib', 'client.js')

/**
 * The shipped client is one file the Module Loader evaluates. A bundling mistake (a missing inlined
 * stylesheet, a stray import of a package the host does not provide) only shows in a real browser, so
 * this evaluates the built file the way the loader does and checks it registers itself.
 */
describe.skipIf(!existsSync(bundle))('the built client bundle', () => {
  it('evaluates under the Module Loader contract and exports a Cordis plugin', () => {
    const require = createRequire(join(process.cwd(), 'package.json'))
    let loaded: { id: string; factory: (req: (name: string) => unknown) => unknown } | undefined
    Object.defineProperty(window, '__ModuleLoader__', { configurable: true, value: { load: (entry: typeof loaded) => { loaded = entry } } })
    new Function(readFileSync(bundle, 'utf8'))()
    expect(loaded?.id).toBe('acryl-workspace')
    const exports = loaded?.factory((name) => {
      // The loader provides these; everything else must already be inside the bundle.
      if (name === 'react' || name === 'react/jsx-runtime') return require(name) as unknown
      return {}
    }) as { name?: string; apply?: unknown }
    expect(exports.name).toBe('acryl-workspace-client')
    expect(typeof exports.apply).toBe('function')
  })
})
