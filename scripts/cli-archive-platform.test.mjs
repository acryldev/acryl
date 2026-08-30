import assert from 'node:assert/strict'
import test from 'node:test'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'

test('uses the Windows command shim when spawning Corepack', () => {
  assert.equal(corepackCommand('win32'), 'corepack.cmd')
})

test('uses Corepack directly on Unix-like platforms', () => {
  assert.equal(corepackCommand('darwin'), 'corepack')
  assert.equal(corepackCommand('linux'), 'corepack')
})

test('runs Windows command shims through a shell', () => {
  assert.deepEqual(corepackSpawnOptions('win32'), { shell: true })
  assert.deepEqual(corepackSpawnOptions('darwin'), {})
})
