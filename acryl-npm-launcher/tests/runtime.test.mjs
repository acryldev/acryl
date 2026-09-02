import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { payloadSha256, receiptFor } from '../release-contract.js'
import { runtimeLauncher, targetPackageName, targetFor } from '../runtime.js'

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
