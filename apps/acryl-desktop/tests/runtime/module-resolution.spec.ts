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

// Outside a packaged app the real mapping is the identity, so tag its output to see which anchors go through it.
vi.mock('../../src/runtime/packaged-runtime-path.ts', async importOriginal => ({
  ...await importOriginal<object>(),
  unpackedAsarPath: (filename: string) => `${filename}.unpacked`,
}))

const { installProfilePackageResolver } = await import('../../src/module-resolution.ts')

describe('acryl-desktop\'s installProfilePackageResolver wrapper', () => {
  it('supplies its bin name, the unpacked package anchor, and the logical entry anchor', () => {
    const profileBaseUrl = 'file:///C:/Users/test/profile/package.json'
    installProfilePackageResolver(profileBaseUrl)

    expect(harness.installProfilePackageResolver).toHaveBeenCalledWith(profileBaseUrl, {
      binName: 'acryl-desktop',
      installPackageUrl: pathToFileURL(`${fileURLToPath(new URL('../../package.json', import.meta.url))}.unpacked`).href,
      // Loader imports must resolve to the same URLs as the main process's own imports, or shared packages load twice.
      installEntryUrl: new URL('../../lib/index.js', import.meta.url).href,
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
