#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stderr } from 'node:process'
import { runtimeLauncher, targetFor } from './runtime.js'
import { acquireWebRuntime, fetchReleaseManifest, hasVerifiedWebRuntime, manifestUrl, managedWebRoot, selectWebArtifact } from './web-runtime.js'

const require = createRequire(import.meta.url)
const selectorVersion = require('./package.json').version
const args = process.argv.slice(2)

function run(command, commandArgs) {
  const child = spawn(command, commandArgs, { stdio: 'inherit' })
  child.once('error', cause => {
    console.error(`acryl: ${cause.message}`)
    process.exitCode = 1
  })
  child.once('exit', code => { process.exitCode = code ?? 1 })
}

async function confirmDownload() {
  if (!stdin.isTTY || !stderr.isTTY) return false
  const prompt = createInterface({ input: stdin, output: stderr })
  try {
    return (await prompt.question('ACRYL Web will download a verified matching runtime. Continue? [y/N] ')).trim().toLowerCase() === 'y'
  } finally { prompt.close() }
}

async function runWeb(webArgs) {
  const yes = webArgs.includes('--yes') || webArgs.includes('-y')
  const forwarded = webArgs.filter(arg => arg !== '--yes' && arg !== '-y')
  const target = targetFor({ platform: process.platform, arch: process.arch })
  const root = join(managedWebRoot(), selectorVersion, target)
  let launcher
  try { launcher = runtimeLauncher({ require, platform: process.platform, arch: process.arch }) } catch (cause) {
    throw new Error(`matching CLI runtime is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // The CLI runtime is resolved first so a partial/broken selector never downloads Web.
  void launcher
  const manifest = await fetchReleaseManifest(manifestUrl(selectorVersion))
  const artifact = selectWebArtifact(manifest, { version: selectorVersion, target })
  const cached = hasVerifiedWebRuntime(root, { version: selectorVersion, target, sha256: artifact.sha256 })
  if (!cached && !yes && !(await confirmDownload())) {
    throw new Error('Web runtime acquisition requires confirmation. Re-run with: acryl web --yes')
  }
  const result = await acquireWebRuntime({ root: managedWebRoot(), version: selectorVersion, target, manifest })
  run(join(result.root, 'runtime', 'bin', process.platform === 'win32' ? 'acryl-web.cmd' : 'acryl-web'), forwarded)
}

if (args[0] === 'web') {
  runWeb(args.slice(1)).catch(cause => {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
} else {
  try { run(runtimeLauncher(), args) } catch (cause) {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  }
}
