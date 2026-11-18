// The archives a hosted registry publishes beside its index (registry-archives.mjs), read back with the real tar that create-acrylblends unpacks them with.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { packEntry, writeArchives } from '../scripts/registry-archives.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'registry-archives-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}
const fresh = () => join(scratch, `case-${counter++}`)

function registry() {
  const root = write(fresh(), {
    'blends/acrylblends.one/blend.yaml': 'metadata:\n  id: acrylblends.one\n',
    'blends/acrylblends.one/src/zoë.ts': 'export const one = 1\n',
    'blends/acrylblends.one/node_modules/dep/index.js': 'no\n',
    'blends/acrylblends.one/.git/HEAD': 'no\n',
    'blends/acryl.two/blend.yaml': 'metadata:\n  id: acryl.two\n',
    'index.json': `${JSON.stringify({
      formatVersion: 1,
      entries: [
        { id: 'acrylblends.one', path: 'blends/acrylblends.one', runtime: 'acrylblends' },
        { id: 'acryl.two', path: 'blends/acryl.two', runtime: 'acryl' },
      ],
    })}\n`,
  })
  return root
}

function unpack(tgz) {
  const dir = fresh()
  mkdirSync(dir, { recursive: true })
  execFileSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1'])
  return dir
}

test('every entry gets an archive beside it, and the index names it with its integrity', () => {
  const root = registry()
  writeArchives(root)
  const { formatVersion, entries } = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  assert.equal(formatVersion, 1)
  assert.deepEqual(
    entries.map((entry) => entry.archive),
    ['blends/acrylblends.one.tgz', 'blends/acryl.two.tgz'],
  )
  for (const entry of entries) {
    const bytes = readFileSync(join(root, entry.archive))
    assert.equal(entry.integrity, `sha512-${createHash('sha512').update(bytes).digest('base64')}`)
  }
})

test('an archive unpacks to the entry, under one top folder, without dependencies or git', () => {
  const root = registry()
  writeArchives(root)
  const dir = unpack(join(root, 'blends/acrylblends.one.tgz'))
  assert.equal(readFileSync(join(dir, 'src/zoë.ts'), 'utf8'), 'export const one = 1\n')
  assert.equal(readFileSync(join(dir, 'blend.yaml'), 'utf8'), 'metadata:\n  id: acrylblends.one\n')
  assert.equal(existsSync(join(dir, 'node_modules')), false)
  assert.equal(existsSync(join(dir, '.git')), false)
})

test('the same files pack to the same bytes, so a redeploy changes no integrity', () => {
  const first = registry()
  const second = registry()
  assert.ok(
    packEntry(join(first, 'blends/acrylblends.one')).equals(
      packEntry(join(second, 'blends/acrylblends.one')),
    ),
  )
})

test('an executable file stays executable, and a path past the 100 bytes of a plain tar name survives', () => {
  const long = `${'folder-name-of-some-length/'.repeat(6)}deep.txt`
  const entry = write(fresh(), { 'bin/run.sh': '#!/bin/sh\n', [long]: 'deep\n' })
  chmodSync(join(entry, 'bin/run.sh'), 0o755)
  const tgz = join(fresh())
  writeFileSync(tgz, packEntry(entry))
  const dir = unpack(tgz)
  assert.equal(statSync(join(dir, 'bin/run.sh')).mode & 0o111, 0o111)
  assert.equal(readFileSync(join(dir, long), 'utf8'), 'deep\n')
})

test('a symbolic link in an entry is refused, naming it', () => {
  const entry = write(fresh(), { 'blend.yaml': 'x\n' })
  symlinkSync('/etc/passwd', join(entry, 'link'))
  assert.throws(() => packEntry(entry), /symbolic link.*link/)
})

test('a path no tar header can hold is refused, naming it', () => {
  const name = 'n'.repeat(120)
  const entry = write(fresh(), { [`${name}.txt`]: 'x\n' })
  assert.throws(() => packEntry(entry), /too long.*nnn/)
})
