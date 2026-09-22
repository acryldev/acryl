/**
 * `acryl ui …`: copy or inspect a component from a UI component registry (spec
 * 038-ui-component-library, tasks.md T038). Pure filesystem, no Cordis engine:
 * a registry is a directory (a local clone of `acryl-ui-registry`, or any
 * directory shaped like it) with `index.json` plus `<id>/item.yaml` and source
 * per surface. This module is the TypeScript port of the standalone script
 * `plugins/acryl-ui/scripts/acryl-ui.mjs`, proven there first (real subprocess
 * tests against the real generated registry) before this integration.
 *
 * `add` copies an item's source into `<target>/ui/<name>/`, so the plugin owns
 * it from then on - no dependency, the shadcn-style model. `diff` compares the
 * files actually on disk against the registry, not the registry against
 * itself (a real bug in the first draft of the standalone script).
 *
 * @module acryl-cli/host/ui-command
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type AcrylUiAction = 'list' | 'add' | 'diff'

export interface UiRegistryIndexFile {
  readonly path: string
  readonly digest: string
}

export interface UiRegistryIndexItem {
  readonly id: string
  readonly kind: string
  readonly version: string
  readonly surfaces: readonly string[]
  readonly path: string
  readonly digest: string
  readonly files: readonly UiRegistryIndexFile[]
}

export interface UiRegistryIndex {
  readonly formatVersion: number
  readonly items: readonly UiRegistryIndexItem[]
}

export interface UiCommandOptions {
  readonly action: AcrylUiAction
  /** Directory holding `index.json` (a local clone of the registry, or a path to one). */
  readonly registryDir: string
  readonly id?: string
  readonly targetDir?: string
  readonly surface?: string
}

export interface UiLockEntry {
  readonly version: string
  readonly surface: string
  readonly digest: string
}

export interface UiLockFile {
  readonly formatVersion: number
  readonly items: Record<string, UiLockEntry>
}

export type UiCommandResult =
  | { readonly kind: 'list'; readonly items: readonly UiRegistryIndexItem[] }
  | { readonly kind: 'add'; readonly id: string; readonly surface: string; readonly destDir: string; readonly fileCount: number }
  | { readonly kind: 'diff'; readonly id: string; readonly status: 'not-installed' | 'unchanged' | 'changed'; readonly changedFiles: readonly string[] }

function sha256(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function loadIndex(registryDir: string): UiRegistryIndex {
  const path = join(registryDir, 'index.json')
  if (!existsSync(path)) {
    throw new Error(`no index.json at ${registryDir} (not a UI registry, or it needs generating)`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as UiRegistryIndex
}

function findItem(index: UiRegistryIndex, id: string): UiRegistryIndexItem {
  const item = index.items.find(candidate => candidate.id === id)
  if (item === undefined) throw new Error(`unknown registry item: ${id} (see \`acryl ui list\`)`)
  return item
}

function verifyAndCollect(registryDir: string, item: UiRegistryIndexItem, surface: string): Array<{ path: string, content: Buffer, digest: string }> {
  const files = item.files.filter(file => file.path.startsWith(`${surface}/`))
  if (files.length === 0) throw new Error(`item ${item.id} has no '${surface}' surface (has: ${item.surfaces.join(', ')})`)
  return files.map((file) => {
    const content = readFileSync(join(registryDir, item.id, file.path))
    const digest = sha256(content)
    if (digest !== file.digest) throw new Error(`digest mismatch for ${item.id}/${file.path}: registry is corrupt or the index is stale`)
    return { path: file.path, content, digest }
  })
}

function readLock(targetDir: string): UiLockFile {
  const path = join(targetDir, 'ui.lock.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as UiLockFile : { formatVersion: 1, items: {} }
}

function writeLock(targetDir: string, lock: UiLockFile): void {
  writeFileSync(join(targetDir, 'ui.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
}

function destDirFor(targetDir: string, id: string): string {
  return join(targetDir, 'ui', id.replace(/^acryl\.ui\./u, ''))
}

/**
 * Run one `acryl ui` action against a registry directory. Throws a plain
 * `Error` with a message meant to be shown to the user (unknown id, missing
 * surface, digest mismatch) - the caller (the CLI's render layer) decides
 * exit code and formatting, matching `plugin-command.ts`'s own convention.
 * @param options - action, registry location and its arguments.
 * @returns the outcome for the render layer to format.
 */
export function runUiCommand(options: UiCommandOptions): UiCommandResult {
  const index = loadIndex(options.registryDir)

  if (options.action === 'list') return { kind: 'list', items: index.items }

  if (options.id === undefined) throw new Error(`ui ${options.action} requires an item id`)
  const item = findItem(index, options.id)

  if (options.action === 'diff') {
    if (options.targetDir === undefined) throw new Error('ui diff requires a target directory')
    const lock = readLock(options.targetDir)
    const recorded = lock.items[options.id]
    if (recorded === undefined) return { kind: 'diff', id: options.id, status: 'not-installed', changedFiles: [] }
    const registryFiles = verifyAndCollect(options.registryDir, item, recorded.surface)
    const destDir = destDirFor(options.targetDir, options.id)
    const changedFiles = registryFiles.filter((file) => {
      const destPath = join(destDir, file.path.split('/').pop() ?? file.path)
      if (!existsSync(destPath)) return true
      return sha256(readFileSync(destPath)) !== file.digest
    })
    return { kind: 'diff', id: options.id, status: changedFiles.length === 0 ? 'unchanged' : 'changed', changedFiles: changedFiles.map(f => f.path) }
  }

  // add
  if (options.targetDir === undefined) throw new Error('ui add requires a target directory')
  const surface = options.surface ?? item.surfaces[0] ?? 'web'
  if (!item.surfaces.includes(surface)) throw new Error(`item ${options.id} has no '${surface}' surface (has: ${item.surfaces.join(', ')})`)
  const files = verifyAndCollect(options.registryDir, item, surface)
  const destDir = destDirFor(options.targetDir, options.id)
  mkdirSync(destDir, { recursive: true })
  for (const file of files) writeFileSync(join(destDir, file.path.split('/').pop() ?? file.path), file.content)
  const lock = readLock(options.targetDir)
  const nextLock: UiLockFile = { ...lock, items: { ...lock.items, [options.id]: { version: item.version, surface, digest: sha256(Buffer.from(JSON.stringify(files.map(f => f.digest)))) } } }
  writeLock(options.targetDir, nextLock)
  return { kind: 'add', id: options.id, surface, destDir, fileCount: files.length }
}
