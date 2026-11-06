// portabilityIssues: every way a plugin would not work the same on every OS, checked on any one machine, no disk (spec 049, portable-plugins.md step 1).
import { describe, expect, it } from 'vitest'

import { digestFiles, type PluginFile } from '../../../src/plugin-identity/plugin-digest.js'
import { portabilityIssues, type PortabilityRule } from '../../../src/plugin-identity/plugin-portability.js'

const file = (path: string, text = 'x\n'): PluginFile => ({ path, bytes: Buffer.from(text), kind: 'file' })
const found = (...files: PluginFile[]): Array<[PortabilityRule, string]> => portabilityIssues(files).map(({ rule, path }) => [rule, path])

describe('portabilityIssues', () => {
  it('finds nothing in an ordinary plugin', () => {
    expect(portabilityIssues([file('package.json', '{}\n'), file('src/index.js'), file('assets/logo.png'), file('.gitattributes')])).toEqual([])
  })

  it.each(['con', 'CON', 'prn', 'aux', 'nul', 'com1', 'COM9', 'lpt1', 'lpt9', 'con.txt', 'Nul.tar.gz'])('refuses the reserved name %s', (name) => {
    expect(found(file(name))).toEqual([['reserved-name', name]])
  })

  it.each(['console.js', 'com0', 'com10', 'lpt', 'auxiliary', 'null', 'my.con'])('accepts %s, which only looks reserved', (name) => {
    expect(found(file(name))).toEqual([])
  })

  it('checks every folder on the way to a file, once', () => {
    expect(found(file('aux/a.js'), file('aux/b.js'))).toEqual([['reserved-name', 'aux']])
  })

  it.each(['name.', 'name ', 'folder./a.js', 'folder /a.js'])('refuses a name ending in a dot or space: %s', (path) => {
    expect(found(file(path))).toEqual([['trailing-dot-or-space', path.split('/')[0]]])
  })

  it.each(['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\\b', 'a\tb'])('refuses a character Windows refuses: %j', (name) => {
    expect(found(file(name))).toEqual([['forbidden-character', name]])
  })

  it('refuses two files whose paths differ only in case', () => {
    expect(found(file('README.md'), file('readme.md'))).toEqual([['case-collision', 'readme.md']])
  })

  it('refuses two folders that would merge on a case-insensitive disk, even when no file collides', () => {
    expect(found(file('Src/a.js'), file('src/b.js'))).toEqual([['case-collision', 'src']])
  })

  it('refuses the composed and decomposed spelling of one name, which macOS treats as one file', () => {
    expect(found(file('café.js'), file('café.js'))).toHaveLength(1)
  })

  it('allows a path of exactly 200 characters and refuses one more', () => {
    const at = (length: number): string => `${'a'.repeat(length - 3)}.js`
    expect(found(file(`folder/${at(193)}`))).toEqual([])
    const long = `folder/${at(194)}`
    expect(found(file(long))).toEqual([['path-too-long', long]])
  })

  it('refuses a symbolic link', () => {
    expect(found({ path: 'link.js', bytes: Buffer.from('x\n'), kind: 'symlink' })).toEqual([['symlink', 'link.js']])
  })

  it('refuses a carriage return in a text file, CRLF or alone', () => {
    expect(found(file('crlf.js', 'x\r\n'))).toEqual([['carriage-return', 'crlf.js']])
    expect(found(file('cr.js', 'x\ry'))).toEqual([['carriage-return', 'cr.js']])
  })

  it('leaves a binary file alone, by the NUL byte git looks for in its first 8000 bytes', () => {
    expect(found({ path: 'logo.png', bytes: Buffer.from([0x89, 0x0d, 0x0a, 0x00]), kind: 'file' })).toEqual([])
    const lateNul = Buffer.concat([Buffer.from('\r'), Buffer.alloc(8000, 'x'), Buffer.from([0])])
    expect(found({ path: 'late.bin', bytes: lateNul, kind: 'file' })).toEqual([['carriage-return', 'late.bin']])
  })

  it('does not look at what is never the plugin itself', () => {
    expect(found(file('index.js'), file('node_modules/con/index.js', 'x\r\n'), file('.git/CON'), file('acryl-v-1/nul'))).toEqual([])
  })

  it('reports every issue, with a reason, in the same order whatever order the files came in', () => {
    const files = [file('con.js', 'x\r\n'), file('b.'), file('a.js', 'y\r\n')]
    expect(portabilityIssues(files)).toEqual(portabilityIssues([...files].reverse()))
    expect(found(...files)).toEqual([['reserved-name', 'con.js'], ['trailing-dot-or-space', 'b.'], ['carriage-return', 'a.js'], ['carriage-return', 'con.js']])
    for (const { reason } of portabilityIssues(files)) expect(reason).not.toBe('')
  })

  it('does not change a plugin’s digest: identity and portability are separate', () => {
    const files = [file('con.js', 'x\r\n')]
    expect(digestFiles(files)).toMatch(/^[0-9a-f]{64}$/)
    expect(portabilityIssues(files)).not.toEqual([])
  })
})
