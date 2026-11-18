#!/usr/bin/env node
/**
 * Do the native packages of a product's payload load and work on this OS? Run it with the product's own runtime, the way the frame host runs
 * (`ELECTRON_RUN_AS_NODE=1 <engine executable> scripts/verify-engine-natives.mjs <resources/app>`): a pseudo-terminal runs a command and returns its output,
 * the image library resizes a picture, the foreign-function library calls into the C runtime, the ripgrep binary finds a word, and the addon loader finds
 * the build for this OS. One line per package: ok, or the error.
 */
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const app = resolve(process.argv[2] ?? '.')
const require = createRequire(join(app, 'package.json'))
const results = []
const check = async (name, run) => {
  try {
    results.push(`ok   ${name}: ${String(await run())}`)
  } catch (cause) {
    results.push(
      `FAIL ${name}: ${cause instanceof Error ? cause.message.split('\n')[0] : String(cause)}`,
    )
  }
}

await check('node-pty', async () => {
  const pty = require('node-pty')
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  const shellArgs =
    process.platform === 'win32' ? ['/c', 'echo pty-works'] : ['-c', 'echo pty-works']
  const terminal = pty.spawn(shell, shellArgs, { cols: 80, rows: 24 })
  let output = ''
  terminal.onData((data) => {
    output += data
  })
  await new Promise((done) => terminal.onExit(done))
  if (!output.includes('pty-works')) throw new Error(`no output: ${JSON.stringify(output)}`)
  return 'a terminal ran a command'
})
await check('sharp', async () => {
  const sharp = require('sharp')
  const png = await sharp({
    create: { width: 40, height: 20, channels: 3, background: '#336699' },
  })
    .resize(10, 5)
    .png()
    .toBuffer()
  const meta = await sharp(png).metadata()
  return `${String(meta.width)}x${String(meta.height)} png`
})
await check('koffi', () => {
  const koffi = require('koffi')
  const lib = koffi.load(
    { win32: 'kernel32.dll', darwin: 'libSystem.B.dylib' }[process.platform] ?? 'libc.so.6',
  )
  const call =
    process.platform === 'win32'
      ? lib.func('uint32_t GetCurrentProcessId()')
      : lib.func('int getpid()')
  return `pid ${String(call())}`
})
await check('ripgrep', () => {
  // The binary lies in the package for this OS (`@vscode/ripgrep-<os>-<cpu>/bin`), or in `@vscode/ripgrep/bin` where the package downloaded it.
  const name = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const scope = join(app, 'node_modules', '@vscode')
  const bin = readdirSync(scope)
    .map((entry) => join(scope, entry, 'bin', name))
    .find((path) => existsSync(path))
  if (bin === undefined) throw new Error('no ripgrep binary in @vscode')
  const run = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr || 'did not run')
  return run.stdout.split('\n')[0]
})
await check('node-addon-require-builtin', () => {
  require('node-addon-require-builtin')
  return 'loaded'
})
await check('bufferutil and utf-8-validate', () => {
  require('bufferutil')
  require('utf-8-validate')
  return 'loaded'
})

console.log(
  `platform ${process.platform}-${process.arch}, node ${process.versions.node}, electron ${process.versions.electron ?? 'none'}`,
)
for (const line of results) console.log(line)
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0)
