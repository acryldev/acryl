/**
 * Profile-relative package resolution for Electron's restricted Node runtime.
 *
 * Thin wrapper over `acryl-harness-runtime`'s shared `module-resolution.ts`
 * (extracted from this file's own original implementation, first built and
 * proven here against Electron's ASAR-packaged runtime) - this file supplies
 * only the two anchors that are genuinely Desktop-specific (this
 * installation's own entry module and its package.json); every other line of
 * the actual resolution logic lives in the shared module now, unchanged.
 *
 * The entry anchor stays on the logical `app.asar` path the main process
 * itself loads from. Node keys ESM instances by URL, so resolving Loader
 * imports from the physical `app.asar.unpacked` twin gave every profile plugin
 * a second copy of each shared package. `dsh-app-boot` keeps the root Include
 * entry in a module-level registry, so the copy `config-editor` loaded never
 * saw the entry the engine mounted, and every in-app settings save (Models,
 * Settings) failed with "profile reload requires the root Include entry".
 * Only the package anchor needs the physical path, for installs run outside
 * Electron's ASAR support.
 */

import { installProfilePackageResolver as sharedInstallProfilePackageResolver } from 'acryl-harness-runtime'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unpackedAsarPath } from './runtime/packaged-runtime-path.ts'

export { findOverlayPackage, packageNameFromSpecifier, resolveOverlayPackage } from './plugins/package-overlay.ts'

const LOADER_ENTRY_URL = import.meta.resolve('@deepseek-ai/cordis-plugin-loader')
const DESKTOP_ENTRY_URL = new URL('../lib/index.js', import.meta.url).href
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
