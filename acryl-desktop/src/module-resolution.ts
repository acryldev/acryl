/**
 * Profile-relative package resolution for Electron's restricted Node runtime.
 *
 * Thin wrapper over `acryl-harness-runtime`'s shared `module-resolution.ts`
 * (extracted from this file's own original implementation, first built and
 * proven here against Electron's ASAR-packaged runtime) - this file supplies
 * only the two anchors that are genuinely Desktop-specific (the unpacked
 * ASAR paths to this installation's own entry module and package.json);
 * every other line of the actual resolution logic lives in the shared
 * module now, unchanged.
 */

import { installProfilePackageResolver as sharedInstallProfilePackageResolver } from 'acryl-harness-runtime'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unpackedAsarPath } from './packaged-runtime-path.ts'

export { findOverlayPackage, packageNameFromSpecifier, resolveOverlayPackage } from './package-overlay.ts'

const LOADER_ENTRY_URL = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')
const DESKTOP_ENTRY_URL = pathToFileURL(
  unpackedAsarPath(fileURLToPath(new URL('../lib/index.js', import.meta.url))),
).href
const DESKTOP_PACKAGE_URL = pathToFileURL(
  unpackedAsarPath(fileURLToPath(new URL('../package.json', import.meta.url))),
).href

/**
 * Resolve Cordis Loader bare imports from the selected persistent profile.
 * @param profileBaseUrl - file URL inside the profile that owns plugin dependencies.
 * @returns an idempotent hook disposer.
 */
export function installProfilePackageResolver(profileBaseUrl: string): () => void {
  return sharedInstallProfilePackageResolver(profileBaseUrl, {
    binName: 'acryl-desktop',
    installPackageUrl: DESKTOP_PACKAGE_URL,
    installEntryUrl: DESKTOP_ENTRY_URL,
    loaderEntryUrl: LOADER_ENTRY_URL,
  })
}
