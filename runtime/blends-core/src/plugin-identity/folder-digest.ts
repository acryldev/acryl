// A plugin folder on disk, read into the plain files the identity and portability policy work on: the one part of plugin identity that
// touches the disk, and unlike the rest of this package it does. digestFolder is the digest of every writer and reader of a lock's `local`
// modules and of staging a plugin (ACRYL's installer names each staged copy by it; the acrylblends framework stages its plugins with it).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { digestFiles, isSkippedName, type PluginFile } from './plugin-digest.js'

/** A folder's own files, with `/` paths on every platform; folders that are never a plugin's own source are not read at all. */
export function pluginFiles(dir: string, prefix = ''): PluginFile[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !isSkippedName(entry.name))
    .flatMap((entry): PluginFile[] => {
      const path = join(dir, entry.name)
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) return pluginFiles(path, `${relative}/`)
      return [{ path: relative, bytes: readFileSync(path), kind: entry.isSymbolicLink() ? 'symlink' : 'file' }]
    })
}

/** The sha256 of a folder's content as lowercase hex; `length` shortens it (a lock uses all 64, prefixed `sha256:`). */
export function digestFolder(dir: string, length = 64): string {
  return digestFiles(pluginFiles(dir)).slice(0, length)
}
