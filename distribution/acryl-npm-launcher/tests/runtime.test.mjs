import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { payloadSha256, receiptFor } from '../release-contract.js'
import { runtimeCommand, runtimeLauncher, targetPackageName, targetFor } from '../runtime.js'

const version = '0.1.19'

test('maps supported Node platforms to unscoped ACRYL CLI packages', () => {
  assert.equal(targetFor({ platform: 'darwin', arch: 'arm64' }), 'darwin-arm64')
  assert.equal(targetFor({ platform: 'linux', arch: 'x64' }), 'linux-x64')
  assert.equal(targetFor({ platform: 'win32', arch: 'x64' }), 'windows-x64')
  assert.equal(targetPackageName('darwin-arm64'), 'acryl-cli-darwin-arm64')
})

test('rejects unsupported targets before resolving a runtime', () => {
  assert.throws(() => targetFor({ platform: 'freebsd', arch: 'x64' }), /unsupported ACRYL target/)
})

test('delegates only to a matching target package with a valid receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acryl-runtime-'))
  try {
    mkdirSync(join(directory, 'runtime', 'bin'), { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'acryl-cli-linux-x64', version }))
    writeFileSync(join(directory, 'runtime', 'receipt.json'), JSON.stringify(receiptFor({ target: 'linux-x64', version, payloadSha256: payloadSha256(join(directory, 'runtime')) })))
    const require = { resolve: () => join(directory, 'package.json') }
    assert.equal(runtimeLauncher({ require, platform: 'linux', arch: 'x64', version }), join(directory, 'runtime', 'bin', 'acryl'))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('rejects missing and mismatched target runtime receipts with recovery guidance', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acryl-runtime-'))
  try {
    mkdirSync(join(directory, 'runtime'), { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'acryl-cli-linux-x64', version }))
    const require = { resolve: () => join(directory, 'package.json') }
    assert.throws(() => runtimeLauncher({ require, platform: 'linux', arch: 'x64', version }), /no valid receipt.*include=optional/)
    writeFileSync(join(directory, 'runtime', 'receipt.json'), JSON.stringify(receiptFor({ target: 'darwin-arm64', version, payloadSha256: 'a'.repeat(64) })))
    assert.throws(() => runtimeLauncher({ require, platform: 'linux', arch: 'x64', version }), /receipt validation failed.*target mismatch/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('rejects a target runtime whose prepared payload differs from its receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acryl-runtime-'))
  try {
    mkdirSync(join(directory, 'runtime', 'bin'), { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'acryl-cli-linux-x64', version }))
    writeFileSync(join(directory, 'runtime', 'bin', 'acryl'), '#!/bin/sh\necho acryl\n')
    writeFileSync(join(directory, 'runtime', 'receipt.json'), JSON.stringify(receiptFor({ target: 'linux-x64', version, payloadSha256: 'a'.repeat(64) })))
    const require = { resolve: () => join(directory, 'package.json') }
    assert.throws(() => runtimeLauncher({ require, platform: 'linux', arch: 'x64', version }), /receipt validation failed.*payload hash mismatch/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('starts the CLI runtime through its launcher, and on Windows runs what the .cmd launcher runs, without cmd.exe', () => {
  const launcher = join('/r', 'runtime', 'bin', 'acryl')
  assert.deepEqual(runtimeCommand(launcher, ['tui', '100%'], { platform: 'linux' }), { command: launcher, args: ['tui', '100%'] })
  const windows = runtimeCommand(join('/r', 'runtime', 'bin', 'acryl.cmd'), ['tui', '100%'], { platform: 'win32', node: 'node.exe' })
  assert.deepEqual(windows, { command: 'node.exe', args: ['--expose-internals', join('/r', 'runtime', 'lib', 'bin.js'), 'tui', '100%'] })
  // The .cmd in the archive must keep running the same thing, or the two ways of starting the CLI drift apart.
  const cmd = readFileSync(new URL('../../../apps/acryl-cli/scripts/acryl-cli-launcher.cmd', import.meta.url), 'utf8')
  assert.match(cmd, /^node --expose-internals "%DIR%\.\.\\lib\\bin\.js" %\*\r?$/mu)
})
