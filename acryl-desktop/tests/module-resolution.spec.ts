/**
 * The deep hook-logic tests moved to acryl-harness-runtime's own
 * module-resolution.spec.ts when this file became a thin wrapper over its
 * shared installProfilePackageResolver() (see this file's own doc comment).
 * This suite only confirms the wrapper passes Desktop's own anchors through
 * correctly - the actual resolution behavior is covered upstream.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  installProfilePackageResolver: vi.fn(() => vi.fn()),
}))

vi.mock('acryl-harness-runtime', async importOriginal => ({
  ...await importOriginal<object>(),
  installProfilePackageResolver: harness.installProfilePackageResolver,
}))

const { installProfilePackageResolver } = await import('../src/module-resolution.ts')
const { unpackedAsarPath } = await import('../src/packaged-runtime-path.ts')

describe('acryl-desktop\'s installProfilePackageResolver wrapper', () => {
  it('supplies its own bin name and unpacked-ASAR anchors to the shared resolver', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    installProfilePackageResolver(profileBaseUrl)

    expect(harness.installProfilePackageResolver).toHaveBeenCalledWith(profileBaseUrl, {
      binName: 'acryl-desktop',
      installPackageUrl: pathToFileURL(
        unpackedAsarPath(fileURLToPath(new URL('../package.json', import.meta.url))),
      ).href,
      installEntryUrl: pathToFileURL(
        unpackedAsarPath(fileURLToPath(new URL('../lib/index.js', import.meta.url))),
      ).href,
      loaderEntryUrl: import.meta.resolve('@deepseek-ai/cordis-plugin-loader'),
    })
  })

  it('returns the shared resolver\'s own disposer', () => {
    const disposer = vi.fn()
    harness.installProfilePackageResolver.mockReturnValueOnce(disposer)

    const dispose = installProfilePackageResolver('file:///C:/Users/test/profile/package.json')
    dispose()

    expect(disposer).toHaveBeenCalledOnce()
  })
})
