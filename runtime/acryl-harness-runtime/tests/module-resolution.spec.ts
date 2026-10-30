/**
 * Real behavior coverage for the Cordis Loader package-overlay resolution
 * hook, ported verbatim (mocks and all) from acryl-desktop's own original
 * module-resolution.spec.ts - the actual hook logic moved here when
 * acryl-desktop's module-resolution.ts became a thin wrapper supplying its
 * own anchors to this package's shared installProfilePackageResolver().
 * Desktop's own test now only checks that its wrapper passes the right
 * anchors through; this suite is the real, deep coverage of the hook itself.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const cjsOriginal = vi.fn((
    request: string,
    _parent?: { filename?: string } | null,
    _isMain?: boolean,
    _options?: unknown,
  ) => `ordinary:${request}`)
  return {
    resolve: undefined as undefined | ((
      specifier: string,
      context: { parentURL?: string },
      nextResolve: (specifier: string, context: { parentURL?: string }) => unknown,
    ) => unknown),
    deregister: vi.fn(),
    sources: new Map<string, 'install' | 'profile'>(),
    overlay: vi.fn((packageName: string) => {
      const source = harness.sources.get(packageName) ?? 'profile'
      return {
        packageName,
        selected: {
          source,
          manifestPath: `/${source}/${packageName}/package.json`,
        },
      }
    }),
    cjsOriginal,
    cjsModule: { _resolveFilename: cjsOriginal },
  }
})

vi.mock('node:module', () => {
  const registerHooks = vi.fn((definition: { resolve: typeof harness.resolve }) => {
    harness.resolve = definition.resolve
    return { deregister: harness.deregister }
  })
  // The runtime reads registerHooks from the default export (src/module-hooks.ts).
  Object.assign(harness.cjsModule, { registerHooks })
  return { default: harness.cjsModule, registerHooks }
})

vi.mock('../src/package-overlay.ts', () => ({
  findOverlayPackage: harness.overlay,
  packageNameFromSpecifier(specifier: string): string | undefined {
    if (specifier.length === 0 || specifier.startsWith('.') || specifier.startsWith('/')
      || specifier.startsWith('#') || URL.canParse(specifier)) return undefined
    const parts = specifier.split('/')
    return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  },
  resolveOverlayPackage: harness.overlay,
}))

const { installProfilePackageResolver } = await import('../src/module-resolution.ts')

const loaderEntryUrl = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')
// Built for the host, like the Profile paths below: a file URL without a drive letter is not a path on Windows.
const installManifest = resolve('/Applications/DSH.app/Contents/Resources/app.asar/package.json')
const installPackageUrl = pathToFileURL(installManifest).href
const installEntryUrl = pathToFileURL(resolve(installManifest, '..', 'lib', 'index.js')).href

function anchors(): Parameters<typeof installProfilePackageResolver>[1] {
  return { binName: 'test-app', installPackageUrl, installEntryUrl, loaderEntryUrl }
}

function missing(specifier: string, parentURL?: string): Error {
  return Object.assign(
    new Error(`Cannot find package '${specifier}' imported from ${parentURL ?? 'unknown'}`),
    { code: 'ERR_MODULE_NOT_FOUND' },
  )
}

describe('installProfilePackageResolver', () => {
  beforeEach(() => {
    harness.resolve = undefined
    harness.deregister.mockClear()
    harness.overlay.mockClear()
    harness.sources.clear()
    harness.cjsOriginal.mockClear()
    harness.cjsModule._resolveFilename = harness.cjsOriginal
  })

  it('uses the overlay-selected side for every Loader package and subpath', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    harness.sources.set('@deepseek-ai/dsh-web-app', 'install')
    harness.sources.set('test-app', 'profile')
    installProfilePackageResolver(profileBaseUrl, anchors())
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => ({ specifier, context }))

    const installed = harness.resolve?.(
      '@deepseek-ai/dsh-web-app',
      { parentURL: loaderEntryUrl },
      nextResolve,
    ) as { context: { parentURL?: string } }
    expect(installed.context.parentURL).not.toBe(profileBaseUrl)
    expect(installed.context.parentURL).toBe(installEntryUrl)

    expect(harness.resolve?.(
      'test-app/profile',
      { parentURL: loaderEntryUrl },
      nextResolve,
    )).toEqual({
      specifier: 'test-app/profile',
      context: { parentURL: profileBaseUrl },
    })
    expect(harness.overlay).toHaveBeenCalledWith('@deepseek-ai/dsh-web-app', expect.any(Object))
    expect(harness.overlay).toHaveBeenCalledWith('test-app', expect.any(Object))
  })

  it('keeps non-package Loader specifiers on ordinary Node resolution', () => {
    installProfilePackageResolver('file:///C:/Users/test/profile/package.json', anchors())
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => ({ specifier, context }))

    expect(harness.resolve?.('./relative.js', { parentURL: loaderEntryUrl }, nextResolve)).toEqual({
      specifier: './relative.js',
      context: { parentURL: loaderEntryUrl },
    })
    expect(harness.resolve?.('cordis:include', { parentURL: loaderEntryUrl }, nextResolve)).toEqual({
      specifier: 'cordis:include',
      context: { parentURL: loaderEntryUrl },
    })
    expect(harness.overlay).not.toHaveBeenCalled()
  })

  it('keeps package-local dependencies and Profile fallback across linked relative modules', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    const linkedPluginUrl = 'file:///D:/workspace/plugins/dsh-linked/lib/index.js'
    const linkedFeatureUrl = 'file:///D:/workspace/plugins/dsh-linked/lib/feature.js'
    const localDependencyUrl = 'file:///D:/workspace/plugins/dsh-linked/node_modules/local-dependency/index.js'
    const profilePeerUrl = 'file:///C:/Users/test/profile/node_modules/profile-peer/index.js'
    installProfilePackageResolver(profileBaseUrl, anchors())
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => {
      if (specifier === 'dsh-linked' && context.parentURL === profileBaseUrl) return { url: linkedPluginUrl }
      if (specifier === './feature.js' && context.parentURL === linkedPluginUrl) return { url: linkedFeatureUrl }
      if (specifier === 'local-dependency' && context.parentURL === linkedFeatureUrl) return { url: localDependencyUrl }
      if (specifier === 'profile-peer' && context.parentURL === profileBaseUrl) return { url: profilePeerUrl }
      throw missing(specifier, context.parentURL)
    })

    expect(harness.resolve?.('dsh-linked', { parentURL: loaderEntryUrl }, nextResolve)).toEqual({ url: linkedPluginUrl })
    expect(harness.resolve?.('./feature.js', { parentURL: linkedPluginUrl }, nextResolve)).toEqual({ url: linkedFeatureUrl })
    expect(harness.resolve?.('local-dependency', { parentURL: linkedFeatureUrl }, nextResolve)).toEqual({ url: localDependencyUrl })
    expect(harness.resolve?.('profile-peer', { parentURL: localDependencyUrl }, nextResolve)).toEqual({ url: profilePeerUrl })
  })

  it('allows an installation-selected package to use a missing dependency from the Profile overlay', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    const installedPluginUrl = installEntryUrl
    const profilePeerUrl = 'file:///C:/Users/test/profile/node_modules/profile-peer/index.js'
    harness.sources.set('plugin', 'install')
    installProfilePackageResolver(profileBaseUrl, anchors())
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => {
      if (specifier === 'plugin' && context.parentURL === installEntryUrl) return { url: installedPluginUrl }
      if (specifier === 'profile-peer' && context.parentURL === installedPluginUrl) return { url: profilePeerUrl }
      throw missing(specifier, context.parentURL)
    })

    expect(harness.resolve?.('plugin', { parentURL: loaderEntryUrl }, nextResolve)).toEqual({ url: installedPluginUrl })
    expect(harness.resolve?.('profile-peer', { parentURL: installedPluginUrl }, nextResolve)).toEqual({ url: profilePeerUrl })
  })

  it('does not expose Profile dependencies to unrelated modules', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    installProfilePackageResolver(profileBaseUrl, anchors())
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => {
      if (context.parentURL === profileBaseUrl) return { url: 'file:///C:/Users/test/profile/node_modules/zod/index.js' }
      throw missing(specifier, context.parentURL)
    })

    expect(() => harness.resolve?.(
      'zod',
      { parentURL: 'file:///unrelated/module.js' },
      nextResolve,
    )).toThrow('Cannot find package')
    expect(nextResolve).toHaveBeenCalledTimes(1)
  })

  it('uses the same overlay for CommonJS package manifests resolved from the Profile anchor', () => {
    // A file URL needs a drive letter on Windows, so the profile manifest path is built for the host.
    const profileManifest = resolve('/tmp/dsh-profile/package.json')
    const profileBaseUrl = pathToFileURL(profileManifest).href
    harness.sources.set('@deepseek-ai/dsh-client-modules', 'install')
    const dispose = installProfilePackageResolver(profileBaseUrl, anchors())
    const resolveFilename = harness.cjsModule._resolveFilename

    expect(resolveFilename(
      '@deepseek-ai/dsh-client-modules/package.json',
      { filename: profileManifest },
      false,
    )).toBe('/install/@deepseek-ai/dsh-client-modules/package.json')
    expect(resolveFilename(
      '@deepseek-ai/dsh-client-modules/package.json',
      { filename: resolve('/tmp/another-profile/package.json') },
      false,
    )).toBe('ordinary:@deepseek-ai/dsh-client-modules/package.json')
    expect(resolveFilename(
      '@deepseek-ai/dsh-client-modules/client.js',
      { filename: profileManifest },
      false,
    )).toBe('ordinary:@deepseek-ai/dsh-client-modules/client.js')

    dispose()
    expect(harness.cjsModule._resolveFilename).toBe(harness.cjsOriginal)
  })

  it('resolves a bare plugin import from the Profile anchor on the overlay-selected side', () => {
    // dsh-app-boot's root Include resolves every Loader row with the Profile manifest as the CommonJS parent; a fresh Profile
    // holds no node_modules, so an installation-selected package must be looked up from the installation's own manifest.
    const profileManifest = resolve('/tmp/dsh-profile/package.json')
    harness.sources.set('@deepseek-ai/cordis-plugin-timer', 'install')
    harness.sources.set('profile-plugin', 'profile')
    const dispose = installProfilePackageResolver(pathToFileURL(profileManifest).href, anchors())
    const resolveFilename = harness.cjsModule._resolveFilename
    const options = { conditions: new Set(['node', 'import']) }

    resolveFilename('@deepseek-ai/cordis-plugin-timer', { filename: profileManifest }, false, options)
    const installCall = harness.cjsOriginal.mock.calls.at(-1)!
    expect(installCall[1]).toMatchObject({ filename: expect.stringContaining('app.asar') })
    expect((installCall[1] as { paths: string[] }).paths[0]).toBe(resolve(installManifest, '..', 'node_modules'))
    expect(installCall[3]).toBe(options)

    resolveFilename('profile-plugin/lib/index.js', { filename: profileManifest }, false, options)
    expect(harness.cjsOriginal.mock.calls.at(-1)![1]).toEqual({ filename: profileManifest })

    // The file the Loader imports next keeps the Profile fallback for a dependency it cannot find beside itself.
    const pluginFile = resolve('/install/node_modules/third-party/index.js')
    harness.cjsOriginal.mockImplementationOnce(() => pluginFile)
    harness.sources.set('third-party', 'install')
    expect(resolveFilename('third-party', { filename: profileManifest }, false, options)).toBe(pluginFile)
    const nextResolve = vi.fn((specifier: string, context: { parentURL?: string }) => {
      if (context.parentURL !== pathToFileURL(profileManifest).href) throw missing(specifier, context.parentURL)
      return { url: `file:///profile/node_modules/${specifier}/index.js` }
    })
    expect(harness.resolve?.('third-party-dependency', { parentURL: pathToFileURL(pluginFile).href }, nextResolve))
      .toEqual({ url: 'file:///profile/node_modules/third-party-dependency/index.js' })

    // Relative requests and parents outside the Profile never consult the overlay.
    harness.overlay.mockClear()
    resolveFilename('./local.js', { filename: profileManifest }, false)
    resolveFilename('@deepseek-ai/cordis-plugin-timer', { filename: resolve('/elsewhere/index.js') }, false)
    expect(harness.overlay).not.toHaveBeenCalled()
    dispose()
  })

  it('deregisters hooks only once even if the disposer is reused', () => {
    const dispose = installProfilePackageResolver('file:///C:/Users/test/profile/package.json', anchors())
    dispose()
    dispose()
    expect(harness.deregister).toHaveBeenCalledTimes(1)
  })
})
