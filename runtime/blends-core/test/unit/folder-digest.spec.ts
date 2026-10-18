// digestFolder: the one folder digest for lock `local` modules and plugin staging (spec 036, agreed with the acrylblends framework).
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { digestFolder } from '../../src/folder-digest.js'

function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'blends-digest-'))
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
})
