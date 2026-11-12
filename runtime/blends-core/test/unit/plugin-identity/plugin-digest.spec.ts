// digestFiles: a plugin's identity from its files alone, no disk (spec 049, portable-plugins.md step 1). The formula is digestFolder's, unchanged.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { digestFiles, isSkippedName, type PluginFile } from '../../../src/plugin-identity/plugin-digest.js'

const file = (path: string, text: string): PluginFile => ({ path, bytes: Buffer.from(text), kind: 'file' })

describe('digestFiles', () => {
  it('is the sha256 over each relative path and its bytes, in path order', () => {
    const expected = createHash('sha256')
    for (const [path, text] of [['package.json', '{}'], ['src/a.js', 'a'], ['src/b.js', 'b']] as const) expected.update(path).update('\0').update(text).update('\0')
    expect(digestFiles([file('src/b.js', 'b'), file('package.json', '{}'), file('src/a.js', 'a')])).toBe(expected.digest('hex'))
  })

  it('orders paths by code unit, as every earlier lock did', () => {
    // 'Z' (0x5a) sorts before 'a' (0x61): code-unit order, not a locale's.
    const expected = createHash('sha256').update('Z.js').update('\0').update('z').update('\0').update('a.js').update('\0').update('a').update('\0')
    expect(digestFiles([file('a.js', 'a'), file('Z.js', 'z')])).toBe(expected.digest('hex'))
  })

  it('leaves out what is never the plugin itself: dependencies, git, and staging leftovers, at any depth', () => {
    const plain = digestFiles([file('index.js', 'x')])
    expect(
      digestFiles([
        file('index.js', 'x'),
        file('node_modules/dep/index.js', 'dep'),
        file('.git/HEAD', 'ref'),
        file('acryl-source.json', '{}'),
        file('acryl-v-0123456789/index.js', 'x'),
        file('src/node_modules/dep/index.js', 'dep'),
      ]),
    ).toBe(plain)
  })

  it('changes when a name or a byte changes, and with the line endings', () => {
    const base = digestFiles([file('a.js', 'x\n')])
    expect(digestFiles([file('b.js', 'x\n')])).not.toBe(base)
    expect(digestFiles([file('a.js', 'y\n')])).not.toBe(base)
    expect(digestFiles([file('a.js', 'x\r\n')])).not.toBe(base)
  })

  it('counts a symbolic link by the bytes a loader reads through it', () => {
    expect(digestFiles([{ path: 'a.js', bytes: Buffer.from('x'), kind: 'symlink' }])).toBe(digestFiles([file('a.js', 'x')]))
  })
})

describe('isSkippedName', () => {
  it('names the folders and files that are never a plugin’s own source', () => {
    for (const name of ['node_modules', '.git', 'acryl-source.json', 'acryl-v-0123456789']) expect(isSkippedName(name)).toBe(true)
    for (const name of ['src', 'node_module', 'git', 'acryl-v']) expect(isSkippedName(name)).toBe(false)
  })
})
