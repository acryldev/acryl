// The local plugin store (spec 044 lifecycle.md, "Save" and "Pull"): every version saved or pulled on this machine, as its tarball plus a record,
// under one folder of the app instance's home. Any app instance on the machine can install from it offline, and a rollback is a pull of an
// older version from it. A version is kept once: the same name and version with different content is refused, never overwritten.
//
//   <root>/index.json                      { formatVersion: 1, plugins: { "<name>": { "<version>": StoreRecord } } }
//   <root>/<@owner>/<name>/<version>.tgz   (unscoped: <root>/<name>/<version>.tgz)
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parsePluginName, storeDirectoryOf } from './name.js'
import { integrityOf } from './tarball.js'
import { compareVersions, newestVersion, parseVersion } from './version.js'

export interface StoreRecord {
  readonly integrity: string
  /** ISO time it entered the store. */
  readonly storedAt: string
  /** Where it came from, as a source argument (`parsePluginSource` reads it back): a folder for a save, the pulled source otherwise. */
  readonly from: string
  /** The service contract and slots as its package.json declared them, so a list can say whether an app runs it without opening the tarball. */
  readonly requires?: Readonly<Record<string, readonly string[]>>
  readonly provides?: Readonly<Record<string, readonly string[]>>
  readonly description?: string
}

export interface StoredVersion extends StoreRecord {
  readonly name: string
  readonly version: string
  /** Absolute path of the tarball. */
  readonly path: string
}

interface StoreIndex {
  readonly formatVersion: 1
  readonly plugins: Record<string, Record<string, StoreRecord>>
}

export class StoreConflictError extends Error {
  constructor(readonly pluginName: string, readonly version: string) {
    super(`${pluginName}@${version} is already in the store with different content; a version is kept once, so give the change a new version`)
    this.name = 'StoreConflictError'
  }
}

function writeAtomic(path: string, bytes: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, bytes)
  try { renameSync(temporary, path) } catch (cause) {
    rmSync(temporary, { force: true })
    throw cause
  }
}

export class PluginStore {
  constructor(readonly root: string) {}

  private get indexPath(): string { return join(this.root, 'index.json') }

  private read(): StoreIndex {
    if (!existsSync(this.indexPath)) return { formatVersion: 1, plugins: {} }
    const parsed = JSON.parse(readFileSync(this.indexPath, 'utf8')) as Partial<StoreIndex>
    if (parsed.formatVersion !== 1 || typeof parsed.plugins !== 'object' || parsed.plugins === null) throw new Error(`${this.indexPath} is not a plugin store index (formatVersion 1)`)
    return { formatVersion: 1, plugins: parsed.plugins }
  }

  /** Where a version's tarball lives, whether or not it is stored yet. */
  tarballPath(name: string, version: string): string {
    if (parseVersion(version) === undefined) throw new Error(`${JSON.stringify(version)} is not a semantic version`)
    return join(this.root, ...storeDirectoryOf(parsePluginName(name)), `${version}.tgz`)
  }

  /**
   * Keep a tarball. Storing the same bytes again is a no-op (`added: false`); different bytes under a stored version are refused.
   * The tarball is written before the index, so an interrupted put leaves at most an unlisted file, never a listed version without one.
   */
  put(name: string, version: string, tarball: Uint8Array, record: Omit<StoreRecord, 'integrity' | 'storedAt'>, now = new Date()): { readonly added: boolean; readonly stored: StoredVersion } {
    const integrity = integrityOf(tarball)
    const index = this.read()
    const existing = index.plugins[name]?.[version]
    const path = this.tarballPath(name, version)
    if (existing !== undefined) {
      if (existing.integrity !== integrity) throw new StoreConflictError(name, version)
      if (existsSync(path)) return { added: false, stored: { name, version, path, ...existing } }
    }
    writeAtomic(path, tarball)
    const full: StoreRecord = { ...record, integrity, storedAt: (existing?.storedAt ?? now.toISOString()) }
    const plugins = { ...index.plugins, [name]: { ...index.plugins[name], [version]: full } }
    writeAtomic(this.indexPath, `${JSON.stringify({ formatVersion: 1, plugins }, null, 2)}\n`)
    return { added: true, stored: { name, version, path, ...full } }
  }

  /** One version, or the newest when no version is given. A listed version whose file is gone or changed is reported, not returned. */
  get(name: string, version?: string): StoredVersion | undefined {
    const versions = this.read().plugins[name]
    if (versions === undefined) return undefined
    const chosen = version ?? newestVersion(Object.keys(versions))
    if (chosen === undefined) return undefined
    const record = versions[chosen]
    if (record === undefined) return undefined
    const path = this.tarballPath(name, chosen)
    if (!existsSync(path)) throw new Error(`the store lists ${name}@${chosen} but its file ${path} is missing`)
    if (integrityOf(readFileSync(path)) !== record.integrity) throw new Error(`the stored file of ${name}@${chosen} no longer matches its checksum; pull it again`)
    return { name, version: chosen, path, ...record }
  }

  /** Every stored version, by name, newest first. */
  list(): StoredVersion[] {
    const out: StoredVersion[] = []
    const index = this.read()
    for (const name of Object.keys(index.plugins).sort()) {
      const versions = index.plugins[name] ?? {}
      const ordered = Object.keys(versions).flatMap(text => {
        const parsed = parseVersion(text)
        return parsed === undefined ? [] : [parsed]
      }).sort((a, b) => compareVersions(b, a))
      for (const version of ordered) {
        const record = versions[version.text]
        if (record !== undefined) out.push({ name, version: version.text, path: this.tarballPath(name, version.text), ...record })
      }
    }
    return out
  }
}
