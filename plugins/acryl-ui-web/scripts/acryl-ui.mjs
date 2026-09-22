#!/usr/bin/env node
// `acryl ui` v0 (spec 038-ui-component-library, tasks.md T038). A standalone script, not yet
// wired into `acryl-cli`'s grammar (that integration is next; this proves the mechanism first,
// per the user's "ship testable, correct along the way" instruction).
//
// Usage:
//   node acryl-ui.mjs list [--registry <dir>]
//   node acryl-ui.mjs add <id> <target-dir> [--surface web|tui] [--registry <dir>]
//   node acryl-ui.mjs diff <id> <target-dir> [--registry <dir>]
//
// `add` copies the item's source into <target-dir>/ui/<id>/ (the plugin owns it from then on,
// no dependency) and records {id, version, digest, surface} per item in <target-dir>/ui.lock.json.
// `diff` reports which of a previously-added item's files no longer match the registry (a local edit).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_REGISTRY = join(dirname(fileURLToPath(import.meta.url)), '..', 'registry-seed')

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`
}

function loadIndex(registryDir) {
  const path = join(registryDir, 'index.json')
  if (!existsSync(path)) throw new Error(`no index.json at ${registryDir} (run scripts/generate-registry.mjs first)`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseFlags(argv) {
  const flags = { registry: DEFAULT_REGISTRY, surface: undefined }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--registry') { flags.registry = argv[index + 1]; index += 1; continue }
    if (arg === '--surface') { flags.surface = argv[index + 1]; index += 1; continue }
    positional.push(arg)
  }
  return { flags, positional }
}

function cmdList(flags) {
  const index = loadIndex(flags.registry)
  for (const item of index.items) {
    console.log(`${item.id}  v${item.version}  [${item.surfaces.join(', ')}]`)
  }
  console.log(`${index.items.length} item(s) from ${flags.registry}`)
}

function findItem(index, id) {
  const item = index.items.find(candidate => candidate.id === id)
  if (item === undefined) throw new Error(`unknown registry item: ${id} (see \`acryl-ui.mjs list\`)`)
  return item
}

function verifyAndCollect(registryDir, item, surface) {
  const files = item.files.filter(file => file.path.startsWith(`${surface}/`))
  if (files.length === 0) throw new Error(`item ${item.id} has no ${surface} source`)
  return files.map((file) => {
    const content = readFileSync(join(registryDir, item.id, file.path))
    const digest = sha256(content)
    if (digest !== file.digest) throw new Error(`digest mismatch for ${item.id}/${file.path}: registry is corrupt or the index is stale`)
    return { path: file.path, content, digest }
  })
}

function readLock(targetDir) {
  const path = join(targetDir, 'ui.lock.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { formatVersion: 1, items: {} }
}

function writeLock(targetDir, lock) {
  writeFileSync(join(targetDir, 'ui.lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
}

function cmdAdd(flags, id, targetDir) {
  const index = loadIndex(flags.registry)
  const item = findItem(index, id)
  const surface = flags.surface ?? (item.surfaces[0] ?? 'web')
  if (!item.surfaces.includes(surface)) throw new Error(`item ${id} has no '${surface}' surface (has: ${item.surfaces.join(', ')})`)
  const files = verifyAndCollect(flags.registry, item, surface)
  const destDir = join(targetDir, 'ui', id.replace(/^acryl\.ui\./u, ''))
  mkdirSync(destDir, { recursive: true })
  for (const file of files) {
    const destName = file.path.split('/').pop()
    writeFileSync(join(destDir, destName), file.content)
  }
  const lock = readLock(targetDir)
  lock.items[id] = { version: item.version, surface, digest: sha256(Buffer.from(JSON.stringify(files.map(f => f.digest)))) }
  writeLock(targetDir, lock)
  console.log(`added ${id} (${surface}) -> ${destDir} (${files.length} file(s))`)
}

function cmdDiff(flags, id, targetDir) {
  const lock = readLock(targetDir)
  const recorded = lock.items[id]
  if (recorded === undefined) { console.log(`${id} is not installed in ${targetDir}`); return }
  const index = loadIndex(flags.registry)
  const item = findItem(index, id)
  const registryFiles = verifyAndCollect(flags.registry, item, recorded.surface)
  // Compare what is actually on disk in the plugin (the file the agent may have edited), not the registry
  // against itself - that was a real bug: it always reported "unchanged" no matter what the plugin did.
  const destDir = join(targetDir, 'ui', id.replace(/^acryl\.ui\./u, ''))
  const changedFiles = registryFiles.filter((file) => {
    const destName = file.path.split('/').pop()
    const destPath = join(destDir, destName)
    if (!existsSync(destPath)) return true
    return sha256(readFileSync(destPath)) !== file.digest
  })
  if (changedFiles.length === 0) { console.log(`${id}: unchanged since v${recorded.version}`); return }
  console.log(`${id}: locally edited (or missing) since v${recorded.version} - ${changedFiles.map(f => f.path.split('/').pop()).join(', ')}`)
}

function main() {
  const [, , command, ...rest] = process.argv
  const { flags, positional } = parseFlags(rest)
  if (command === 'list') return cmdList(flags)
  if (command === 'add') return cmdAdd(flags, positional[0], positional[1])
  if (command === 'diff') return cmdDiff(flags, positional[0], positional[1])
  console.error('usage: acryl-ui.mjs <list|add|diff> ...')
  process.exitCode = 2
}

main()
