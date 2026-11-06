// digestFolder: the one folder digest for lock `local` modules and plugin staging (spec 036, agreed with the acrylblends framework).
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { digestFolder, pluginFiles } from '../../../src/plugin-identity/folder-digest.js'
import { digestFiles } from '../../../src/plugin-identity/plugin-digest.js'

const created: string[] = []
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true })
})

function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'blends-digest-'))
  created.push(root)
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(join(root, relative, '..'), { recursive: true })
    writeFileSync(join(root, relative), text)
  }
  return root
}

describe('digestFolder', () => {
  it('is the sha256 over each relative path and its bytes, in path order', () => {
    const root = folder({ 'package.json': '{}', 'src/b.js': 'b', 'src/a.js': 'a' })
    const expected = createHash('sha256')
    for (const [relative, text] of [['package.json', '{}'], ['src/a.js', 'a'], ['src/b.js', 'b']] as const) expected.update(relative).update('\0').update(text).update('\0')
    expect(digestFolder(root)).toBe(expected.digest('hex'))
    expect(digestFolder(root, 10)).toBe(digestFolder(root).slice(0, 10))
  })

  it('skips dependencies, git, and ACRYL staging leftovers', () => {
    const plain = digestFolder(folder({ 'index.js': 'x' }))
    const noisy = digestFolder(folder({
      'index.js': 'x',
      'node_modules/dep/index.js': 'dep',
      '.git/HEAD': 'ref',
      'acryl-source.json': '{}',
      'acryl-v-0123456789/index.js': 'x',
    }))
    expect(noisy).toBe(plain)
  })

  it('changes when a name or a byte changes', () => {
    const base = digestFolder(folder({ 'a.js': 'x' }))
    expect(digestFolder(folder({ 'b.js': 'x' }))).not.toBe(base)
    expect(digestFolder(folder({ 'a.js': 'y' }))).not.toBe(base)
  })

  it('keeps the value every existing lock recorded', () => {
    // Computed by the formula as it stood before it moved out of this function; a change here rewrites every lock.
    const root = folder({ 'package.json': '{}\n', 'src/index.js': 'export {}\n', 'Z.txt': 'z' })
    expect(digestFolder(root)).toBe('fbca85d9746cf89dc0b3b881fd9c49deee4097000ac97de57458f52570485dc2')
  })
})

describe('pluginFiles', () => {
  it('reads a folder into the plain files the policy takes, with / paths and no skipped folders', () => {
    const root = folder({ 'index.js': 'x', 'src/a.js': 'a', 'node_modules/dep/index.js': 'dep' })
    const files = pluginFiles(root).map(({ path, bytes, kind }) => [path, Buffer.from(bytes).toString(), kind])
    expect(files.sort()).toEqual([['index.js', 'x', 'file'], ['src/a.js', 'a', 'file']])
    expect(digestFiles(pluginFiles(root))).toBe(digestFolder(root))
  })

  it('names a symbolic link as one and reads through it', () => {
    const root = folder({ 'a.js': 'x' })
    symlinkSync('a.js', join(root, 'link.js'))
    expect(pluginFiles(root).find(({ path }) => path === 'link.js')).toMatchObject({ kind: 'symlink', bytes: Buffer.from('x') })
  })
})
