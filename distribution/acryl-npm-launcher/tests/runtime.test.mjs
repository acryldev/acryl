import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { payloadPath, payloadSha256, receiptFor } from '../release-contract.js'
import { EventEmitter } from 'node:events'
import { forwardStopSignals, runtimeCommand, runtimeLauncher, STOP_SIGNALS, targetPackageName, targetFor } from '../runtime.js'

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

// The receipt of a Windows runtime is made on one machine and checked on another, so its file names must not depend on the separator.
test('names payload files with forward slashes on every platform', () => {
  assert.equal(payloadPath('node_modules\\koffi\\index.js'), 'node_modules/koffi/index.js')
  assert.equal(payloadPath('node_modules/koffi/index.js'), 'node_modules/koffi/index.js')
})

test('leaves out what npm pack strips from a vendored node_modules, so the installed runtime still matches its receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acryl-payload-'))
  try {
    mkdirSync(join(directory, 'node_modules', 'koffi'), { recursive: true })
    writeFileSync(join(directory, 'node_modules', 'koffi', 'index.js'), 'export {}\n')
    const packed = payloadSha256(directory)
    writeFileSync(join(directory, 'node_modules', 'koffi', '.npmignore'), 'src\n')
    writeFileSync(join(directory, 'node_modules', 'koffi', '.gitignore'), 'build\n')
    assert.equal(payloadSha256(directory), packed)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('passes stop signals on to the runtime while it runs, not on Windows, and lets go of them when asked', () => {
  const started = () => { const kills = []; return { kills, child: { exitCode: null, signalCode: null, kill: signal => { kills.push(signal) } } } }
  const host = new EventEmitter()
  const posix = started()
  const stop = forwardStopSignals(posix.child, { platform: 'linux', host })
  for (const signal of STOP_SIGNALS) host.emit(signal, signal)
  assert.deepEqual(posix.kills, ['SIGINT', 'SIGTERM', 'SIGHUP'])
  posix.child.exitCode = 0
  host.emit('SIGTERM', 'SIGTERM')
  assert.deepEqual(posix.kills, ['SIGINT', 'SIGTERM', 'SIGHUP'], 'an exited runtime is not signalled')
  stop()
  for (const signal of STOP_SIGNALS) assert.equal(host.listenerCount(signal), 0)

  const windows = started()
  const stopWindows = forwardStopSignals(windows.child, { platform: 'win32', host })
  host.emit('SIGINT', 'SIGINT')
  assert.deepEqual(windows.kills, [], 'Windows: the console already sent Ctrl-C to the runtime, and kill() there would end it at once')
  assert.equal(host.listenerCount('SIGINT'), 1, 'Windows: the launcher still waits for the runtime instead of exiting first')
  stopWindows()
})
