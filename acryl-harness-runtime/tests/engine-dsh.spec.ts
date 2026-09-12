/**
 * Real Loader activation of the extracted `dsh` engine (spec 028): the
 * pinned Harness `acryl` profile, mounted through `createAcrylEngineHost`
 * instead of `bootAcrylHarnessProfile`'s own Cordis root. Mirrors
 * `tests/profile.spec.ts`'s fixture pattern (the working, now-fixed
 * real-profile-boot path) rather than a synthetic noop plugin, so this
 * proves the real extraction, not just the mounting primitive.
 */
import { existsSync, realpathSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire, findPackageJSON } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
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
  it('boots the pinned web profile in the host tree, with shared authorization and a token-authenticated connection', async () => {
    await freshDshHome()
    // web-startup's own plugin (@deepseek-ai/dsh-web-app) throws on activation
    // without ctx.cmdlineArgs/ctx.appExit - provideCmdline is not optional
    // plumbing for a real boot, matching how acryl-web/src/serve.ts always
    // supplies it via createAcrylEngineHost's prepare hook.
    const installPackageUrl = new URL('../package.json', import.meta.url).href
    const host = await createAcrylEngineHost({
      engines: [createWebEngineDefinition(installPackageUrl)],
      initialEngine: 'dsh',
      prepare: hostCtx => {
        provideCmdline(hostCtx, { args: ['--no-open', '--port', '0'], exit: () => {} })
      },
    })
    try {
      expect(host.currentEngine()).toBe('dsh')
      expect(host.ctx.get('authorization')).toBeDefined()
      // Proves the brand swap and the profile-template fix together: a
      // fresh profile now actually mounts dsh-client-connection, and its
      // authenticatedUrl carries a real token.
      const url = host.ctx.get('connection')?.authenticatedUrl('http://127.0.0.1:3080')
      expect(new URL(url ?? '').searchParams.get('token')).toBeTruthy()

      // materializeProfilePackage's actual effect: a real symlink from the
      // fresh profile's own node_modules to the acryl-web installation's
      // resolved copy of dsh-client-ui-brand-acryl - not just "no error was
      // thrown while resolving it".
      const profile = loadProfile('web', 'web', dshInstallAnchor)
      const linkPath = join(profile.dir, 'node_modules', 'dsh-client-ui-brand-acryl')
      expect(existsSync(linkPath)).toBe(true)
      const installManifest = findPackageJSON('dsh-client-ui-brand-acryl', installPackageUrl)
      expect(installManifest).toBeDefined()
      expect(realpathSync.native(linkPath)).toBe(realpathSync.native(dirname(installManifest as string)))

      // The composed Loader tree actually carries the swap, not just a
      // resolvable package sitting unused on disk: the stock DeepSeek row is
      // disabled and the ACRYL row is enabled.
      const entries = [...host.ctx.loader.entries()]
      const officialBrand = entries.find(candidate => candidate.options.id === 'ui-brand-official')
      const acrylBrand = entries.find(candidate => candidate.options.id === 'ui-acryl')
      expect(officialBrand?.options.disabled).toBe(true)
      expect(acrylBrand?.options.name).toBe('dsh-client-ui-brand-acryl')
      expect(acrylBrand?.options.disabled).toBeFalsy()

      // The served shell HTML's <title> is a pinned dsh-web-frontend build
      // artifact, outside the Cordis Client slot system the brand-swap patch
      // above covers - reproduced directly: a real served index still read
      // "DeepSeek Harness" after that patch landed. mountDshEngine registers
      // a webServer.tapIndex() rewrite for the web surface specifically;
      // exercise the real service's real renderIndex(), not a mocked string
      // replace, so a future WebServer change that renames/removes tapIndex
      // fails loud here.
      const rendered = host.ctx.get('webServer')?.renderIndex(
        '<!doctype html><html><head><title>DeepSeek Harness</title></head><body></body></html>',
      )
      expect(rendered).toContain('<title>ACRYL</title>')
      expect(rendered).not.toContain('DeepSeek Harness')
    } finally {
      await host.dispose()
    }
  }, 30000)
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
