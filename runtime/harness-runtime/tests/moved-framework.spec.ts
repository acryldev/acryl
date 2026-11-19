/** An import of a framework package from before it moved to acrylblends (spec 049 slice 17) fails with what replaces it, while the profile resolution is mounted. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { RuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { afterEach, describe, expect, it } from 'vitest'
import { MOVED_FRAMEWORK_IMPORTS } from '../src/profile-resolution/moved-framework.ts'
import { ProfilePluginPackages } from '../src/profile-resolution/service.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** An app plugin with no framework package of its own beside it, and a profile resolution that knows none. */
function setup(): { plugin: string, resolution: RuntimeResolution } {
  const root = mkdtempSync(join(tmpdir(), 'acryl-moved-framework-'))
  roots.push(root)
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  const plugin = join(root, 'plugins', 'todo', 'index.js')
  mkdirSync(join(root, 'plugins', 'todo'), { recursive: true })
  writeFileSync(plugin, '')
  return { plugin, resolution: { profilesDir: join(root, 'profiles'), profileDir, localPackageNames: [], linkedRoots: [], entries: [] } }
}

function failure(load: () => unknown): string {
  try {
    load()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected the import to fail')
}

describe('an import of a moved framework package', () => {
  it('fails naming its acrylblends replacement while the resolution is mounted, and plainly once it is gone', async () => {
    const { plugin, resolution } = setup()
    // ESM resolution, as a plugin's import runs; unlike require it ignores NODE_PATH, which pnpm's script shims point at the workspace.
    const resolve = (specifier: string): string => import.meta.resolve(specifier, pathToFileURL(plugin).href)
    const ctx = new Context()
    await ctx.plugin(ProfilePluginPackages, { resolution })

    const router = failure(() => resolve('acryl-router'))
    expect(router).toContain("'acryl-router' is part of acrylblends")
    expect(router).toContain("'acrylblends/cordis/router'")
    expect(failure(() => resolve('acryl-router/middleware'))).toContain("'acrylblends/body-limit'")
    // Any other missing package fails as before.
    expect(failure(() => resolve('not-a-framework-package'))).not.toContain('acrylblends')

    await ctx.fiber.dispose()
    expect(failure(() => resolve('acryl-router'))).not.toContain('acrylblends')
  })

  it('names a replacement for every package that moved', () => {
    for (const old of ['acryl-router', 'acryl-router-http', 'acryl-state', 'acryl-inspect', 'acryl-node-server', 'acryl-door', 'acryl-db', 'acryl-db-sqlite', 'acryl-kv', 'acryl-kv-json', 'acryl-kv-db']) {
      expect(MOVED_FRAMEWORK_IMPORTS[old], old).toMatch(/'acrylblends(\/[a-z/-]+)?'/u)
    }
  })
})
