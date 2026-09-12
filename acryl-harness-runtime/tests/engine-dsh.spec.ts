/**
 * Real Loader activation of the extracted `dsh` engine (spec 028): the
 * pinned Harness `acryl` profile, mounted through `createAcrylEngineHost`
 * instead of `bootAcrylHarnessProfile`'s own Cordis root. Mirrors
 * `tests/profile.spec.ts`'s fixture pattern (the working, now-fixed
 * real-profile-boot path) rather than a synthetic noop plugin, so this
 * proves the real extraction, not just the mounting primitive.
 */
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createDshEngineDefinition,
  createDshEngineDefinitionFromComposition,
  createWebEngineDefinition,
} from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'

const dshInstallAnchor = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')

const temporaryHomes: string[] = []
const initialDshHome = process.env.DSH_HOME

afterEach(async () => {
  process.env.DSH_HOME = initialDshHome
  await Promise.all(temporaryHomes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

async function freshDshHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'acryl-engine-dsh-'))
  temporaryHomes.push(home)
  process.env.DSH_HOME = home
  return home
}

describe('the extracted dsh engine, mounted under createAcrylEngineHost', () => {
  it('boots the pinned profile in the host tree, not a second Cordis root', async () => {
    await freshDshHome()
    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinition('acryl-test')],
      initialEngine: 'dsh',
    })
    try {
      expect(host.currentEngine()).toBe('dsh')
      // Same shared tree the host itself created the Loader on - not a
      // second root the way bootAcrylHarnessProfile's boot() would create.
      expect(host.ctx.get('sessions')).toBeDefined()
      expect(host.ctx.get('agents')).toBeDefined()
      expect(host.ctx.get('authorization')).toBeDefined()
    } finally {
      await host.dispose()
    }
  })

  it('tears down the whole profile tree when the engine host disposes', async () => {
    await freshDshHome()
    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinition('acryl-test')],
      initialEngine: 'dsh',
    })
    expect(host.ctx.get('sessions')).toBeDefined()
    await host.dispose()
    // Disposal removed the whole Loader tree - the fork Cordis handed the
    // dsh engine plugin no longer resolves any of the profile's services.
    expect(host.ctx.get('sessions')).toBeUndefined()
  })

  it('rejects an empty profile name before any Loader activation', () => {
    expect(() => createDshEngineDefinition('')).toThrow('ACRYL dsh engine profile must not be empty')
    expect(() => createDshEngineDefinition('   ')).toThrow('ACRYL dsh engine profile must not be empty')
  })

  it('re-mounts cleanly after swapping away and back - no duplicate tool/log-exporter registration', async () => {
    await freshDshHome()
    const host = await createAcrylEngineHost({
      engines: [
        createDshEngineDefinition('acryl-test'),
        { id: 'other', plugin: () => {} },
      ],
      initialEngine: 'dsh',
    })
    try {
      expect(host.ctx.get('sessions')).toBeDefined()
      await host.select('other')
      expect(host.ctx.get('sessions')).toBeUndefined()
      // If installAcrylWorkspaceStatusTool's ctx.tools.register() call were
      // not disposed on the first unmount (the exact class of bug fixed in
      // engine-dsh.ts), this second mount's register() call would throw a
      // duplicate-registration error and this select() would reject.
      await expect(host.select('dsh')).resolves.toBeUndefined()
      expect(host.ctx.get('sessions')).toBeDefined()
    } finally {
      await host.dispose()
    }
  })
})

describe('the web engine entry point, mounted under createAcrylEngineHost', () => {
  it('boots the pinned web profile in the host tree, with shared authorization available', async () => {
    await freshDshHome()
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition()],
      initialEngine: 'dsh',
    })
    try {
      expect(host.currentEngine()).toBe('dsh')
      expect(host.ctx.get('authorization')).toBeDefined()
    } finally {
      await host.dispose()
    }
  })
})

describe('the composition-based dsh engine entry point (for a surface with its own profile pipeline)', () => {
  it('mounts an externally-resolved rootConfig/patches without doing its own profile resolution - the shape Desktop\'s prepareDesktopProfile() produces', async () => {
    await freshDshHome()
    const profileDirectory = resolveProfileDir('acryl-test')
    initProfile(profileDirectory, DEFAULT_PROFILE_BUNDLES)
    await healProfilesModuleFallback({ installAnchor: dshInstallAnchor })
    const profile = loadProfile('acryl', 'acryl-test', dshInstallAnchor)
    const rootConfig = join(profile.dir, 'cordis.yml')
    writeFileSync(rootConfig, '[]\n')
    const patches = structuredClone([...profile.layers.flatMap(layer => layer.patches), ...profile.patches])

    const host = await createAcrylEngineHost({
      engines: [createDshEngineDefinitionFromComposition({ rootConfig, patches, surface: 'desktop' })],
      initialEngine: 'dsh',
    })
    try {
      expect(host.ctx.get('sessions')).toBeDefined()
      expect(host.ctx.get('agents')).toBeDefined()
    } finally {
      await host.dispose()
    }
  })

  it('rejects an empty surface name before any Loader activation', () => {
    expect(() => createDshEngineDefinitionFromComposition({ rootConfig: '/x/cordis.yml', patches: [], surface: '' }))
      .toThrow('ACRYL dsh engine surface must not be empty')
  })
})
