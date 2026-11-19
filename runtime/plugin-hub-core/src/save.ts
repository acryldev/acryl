// Saving a plugin you edit into the store (spec 044 lifecycle.md, "Save"): pack its source folder and keep the tarball, so this machine can
// install that exact version again, offline, into any app instance, and a later change has to be a new version.
import { packFolder, type PackedPlugin } from './pack.js'
import type { PluginStore, StoredVersion } from './store.js'

export interface SavedPlugin {
  readonly packed: PackedPlugin
  readonly stored: StoredVersion
  /** False when this exact version and content was already saved. */
  readonly added: boolean
}

export function savePlugin(dir: string, store: PluginStore, now = new Date()): SavedPlugin {
  const packed = packFolder(dir)
  const acryl = typeof packed.manifest['acryl'] === 'object' && packed.manifest['acryl'] !== null ? packed.manifest['acryl'] as Record<string, unknown> : {}
  const { added, stored } = store.put(packed.name.full, packed.version, packed.tarball, {
    from: dir,
    ...(typeof acryl['requires'] === 'object' && acryl['requires'] !== null ? { requires: acryl['requires'] as Record<string, string[]> } : {}),
    ...(typeof acryl['provides'] === 'object' && acryl['provides'] !== null ? { provides: acryl['provides'] as Record<string, string[]> } : {}),
    ...(typeof packed.manifest['description'] === 'string' ? { description: packed.manifest['description'] } : {}),
  }, now)
  return { packed, stored, added }
}
