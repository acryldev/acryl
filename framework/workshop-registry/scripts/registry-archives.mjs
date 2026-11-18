#!/usr/bin/env node
/**
 * Publish a registry's entries one by one: `node registry-archives.mjs <registry folder>` writes `blends/<id>.tgz` beside each entry's folder and names it, with
 * its integrity, in `index.json` (`archive`, `integrity`), so create-acrylblends downloads one starter instead of the whole registry. It runs on the copy a site
 * is about to deploy (`dist/registry`), never on the repository: the repository stays source only, and its index, without archives, is read the older way.
 * An archive is a function of the entry's files: its tar is written here, with no tar program, so the same files give the same tar on every machine, and a redeploy
 * on the same runtime changes no integrity (gzip's bytes follow the runtime: run it with node, not sometimes bun). The integrity is taken from the bytes published, so
 * it holds either way. Plain Node, no dependencies, so a site copies this one file. Nothing of an entry is run.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BLOCK = 512
/** What npm writes for every file, for the same reason: a fixed time that no unpacking tool calls implausible. */
const FIXED_TIME = 499162500
const SKIPPED = new Set(['.git', 'node_modules'])
/** The folder every archive holds, which an unpacker drops (`--strip-components=1`), as in an npm or GitHub tarball. */
const TOP = 'package'

const codeUnitOrder = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

/** An entry's files as `{ path, bytes, mode }`, in path order. A link would point outside the entry once unpacked, so it is refused. */
function entryFiles(folder) {
  const files = []
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (SKIPPED.has(name)) continue
      const path = join(dir, name)
      const relative = `${prefix}${name}`
      const info = lstatSync(path)
      if (info.isSymbolicLink()) throw new Error(`${folder} holds a symbolic link: ${relative}`)
      if (info.isDirectory()) walk(path, `${relative}/`)
      else if (info.isFile())
        files.push({
          path: relative,
          bytes: readFileSync(path),
          mode: info.mode & 0o111 ? 0o755 : 0o644,
        })
    }
  }
  walk(folder, '')
  return files.sort((left, right) => codeUnitOrder(left.path, right.path))
}

/** Split a path into the `name` and `prefix` fields of a ustar header (100 and 155 bytes, cut at a `/`), or undefined when no cut fits. */
function headerNames(path) {
  const size = (text) => Buffer.byteLength(text)
  if (size(path) <= 100) return { name: path, prefix: '' }
  for (let cut = path.indexOf('/'); cut !== -1; cut = path.indexOf('/', cut + 1)) {
    const prefix = path.slice(0, cut)
    const name = path.slice(cut + 1)
    if (size(prefix) <= 155 && size(name) <= 100) return { name, prefix }
  }
  return undefined
}

function header(file, path) {
  const names = headerNames(path)
  if (names === undefined) throw new Error(`a path is too long for an archive: ${file.path}`)
  const block = Buffer.alloc(BLOCK)
  const octal = (value, length) => `${value.toString(8).padStart(length - 1, '0')}\0`
  block.write(names.name, 0)
  block.write(octal(file.mode, 8), 100)
  block.write(octal(0, 8), 108)
  block.write(octal(0, 8), 116)
  block.write(octal(file.bytes.length, 12), 124)
  block.write(octal(FIXED_TIME, 12), 136)
  block.write(' '.repeat(8), 148)
  block.write('0', 156)
  block.write('ustar\0' + '00', 257)
  block.write(names.prefix, 345)
  const sum = block.reduce((total, byte) => total + byte, 0)
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return block
}

/** The `.tgz` of an entry's folder: its files under one top folder, the same bytes for the same files. */
export function packEntry(folder) {
  const parts = []
  for (const file of entryFiles(folder)) {
    parts.push(header(file, `${TOP}/${file.path}`), file.bytes)
    const over = file.bytes.length % BLOCK
    if (over !== 0) parts.push(Buffer.alloc(BLOCK - over))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  return gzipSync(Buffer.concat(parts), { level: 9 })
}

/** Write every entry's archive beside its folder and name them in the registry's `index.json`. */
export function writeArchives(root) {
  const file = join(root, 'index.json')
  const index = JSON.parse(readFileSync(file, 'utf8'))
  const entries = index.entries.map((entry) => {
    const bytes = packEntry(join(root, entry.path))
    const archive = `${entry.path}.tgz`
    writeFileSync(join(root, archive), bytes)
    return {
      ...entry,
      archive,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    }
  })
  writeFileSync(file, `${JSON.stringify({ ...index, entries }, null, 2)}\n`)
  return entries.length
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2]
  if (root === undefined) {
    console.error('usage: registry-archives.mjs <registry folder>')
    process.exit(2)
  }
  console.log(`registry-archives: ${writeArchives(root)} entries packed in ${root}`)
}
