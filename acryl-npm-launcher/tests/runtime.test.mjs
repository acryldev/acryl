import assert from 'node:assert/strict'
import test from 'node:test'
import { targetPackageName, targetFor } from '../runtime.js'

test('maps supported Node platforms to unscoped ACRYL CLI packages', () => {
  assert.equal(targetFor({ platform: 'darwin', arch: 'arm64' }), 'darwin-arm64')
  assert.equal(targetFor({ platform: 'linux', arch: 'x64' }), 'linux-x64')
  assert.equal(targetFor({ platform: 'win32', arch: 'x64' }), 'windows-x64')
  assert.equal(targetPackageName('darwin-arm64'), 'acryl-cli-darwin-arm64')
})

test('rejects unsupported targets before resolving a runtime', () => {
  assert.throws(() => targetFor({ platform: 'freebsd', arch: 'x64' }), /unsupported ACRYL target/)
})
