import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { execShim, tarCommand } from './lib/portable-commands.mjs'
import { CLI_TARGETS, payloadSha256, receiptFor, targetForNode, targetPackageName } from '../distribution/acryl-npm-launcher/release-contract.js'

// npm packs and installs with a cache of this run, not the machine's ~/.npm; every npm these tests start inherits it.
const npmCache = mkdtempSync(join(tmpdir(), 'acryl-npm-cache-'))
process.env.npm_config_cache = npmCache
test.after(() => { rmSync(npmCache, { recursive: true, force: true }) })

function pack(directory) {
  return join(directory, execShim('npm', ['pack', '--silent'], { cwd: directory, encoding: 'utf8' }).trim())
}

test('assembles a selector-only manifest with exact optional target dependencies', () => {
  const output = execFileSync(process.execPath, ['scripts/publish-npm-cli.mjs', '--print-manifests'], { encoding: 'utf8' })
  const { selector, targets } = JSON.parse(output)
  assert.deepEqual(Object.keys(selector.dependencies ?? {}), [])
  assert.deepEqual(Object.keys(selector.optionalDependencies).sort(), [
    'acryl-cli-darwin-arm64', 'acryl-cli-linux-arm64', 'acryl-cli-linux-x64', 'acryl-cli-windows-x64',
  ])
  for (const [target, manifest] of Object.entries(targets)) {
    assert.equal(manifest.name, `acryl-cli-${target}`)
    assert.equal(manifest.version, selector.version)
    assert.equal(selector.optionalDependencies[manifest.name], selector.version)
    assert.equal(manifest.files.includes('runtime/**'), true)
    assert.equal(manifest.os.length, 1)
    assert.equal(manifest.cpu.length, 1)
  }
})

test('clean local tarball global install launches the prepared target TUI without a first-run build', () => {
  const directory = mkdtempSync(join(tmpdir(), 'acryl-npm-tarballs-'))
  const prefix = join(directory, 'prefix')
  const target = targetForNode({ platform: process.platform, arch: process.arch })
  const packageName = targetPackageName(target)
  const version = JSON.parse(readFileSync(new URL('../distribution/acryl-npm-launcher/package.json', import.meta.url), 'utf8')).version
  const runtime = join(directory, packageName, 'runtime')
  const launcher = join(runtime, 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl')
  try {
    // The real archive's layout: the launcher runs lib/bin.js on the host's Node (apps/acryl-cli/scripts), and on Windows the npm launcher runs
    // lib/bin.js itself instead of the .cmd.
    mkdirSync(join(runtime, 'bin'), { recursive: true }); mkdirSync(join(runtime, 'lib'), { recursive: true })
    writeFileSync(join(runtime, 'lib', 'bin.js'), `console.log(process.argv[2] === '--version' ? '${version}' : JSON.stringify({ mode: 'tui' }))\n`)
    writeFileSync(launcher, process.platform === 'win32'
      ? '@echo off\r\nnode --expose-internals "%~dp0..\\lib\\bin.js" %*\r\n'
      : '#!/bin/sh\nexec node --expose-internals "$(dirname "$0")/../lib/bin.js" "$@"\n')
    if (process.platform !== 'win32') chmodSync(launcher, 0o755)
    writeFileSync(join(runtime, 'receipt.json'), JSON.stringify(receiptFor({ target, version, payloadSha256: payloadSha256(runtime) })))
    writeFileSync(join(directory, packageName, 'package.json'), JSON.stringify({
      name: packageName, version, os: [process.platform], cpu: [process.arch], files: ['runtime/**'],
    }))
    const targetTarball = pack(join(directory, packageName))

    const selector = join(directory, 'acryl')
    cpSync(new URL('../distribution/acryl-npm-launcher', import.meta.url), selector, { recursive: true })
    writeFileSync(join(selector, 'package.json'), JSON.stringify({
      name: 'acryl', version, type: 'module', bin: { acryl: './bin.js' },
      files: ['bin.js', 'runtime.js', 'release-contract.js', 'web-runtime.js', 'desktop-runtime.js'], optionalDependencies: { [packageName]: version },
    }))
    const selectorTarball = pack(selector)

    execShim('npm', ['install', '--global', '--prefix', prefix, '--include=optional', selectorTarball, targetTarball], { stdio: 'pipe' })
    // A global install puts its bins in the prefix itself on Windows, and in its bin folder elsewhere.
    const executable = process.platform === 'win32' ? join(prefix, 'acryl.cmd') : join(prefix, 'bin', 'acryl')
    assert.equal(execShim(executable, ['--version'], { encoding: 'utf8' }).trim(), version)
    assert.deepEqual(JSON.parse(execShim(executable, ['tui', '--json'], { encoding: 'utf8' })), { mode: 'tui' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('packs every CLI_TARGETS archive, including the windows-x64 .zip', () => {
  // windows-x64 ships as .zip while every other target ships .tar.gz. This
  // reproduces the real prepared-artifact layout build-cli-archive.mjs
  // produces, so extractRuntime's archive-format branch is exercised for
  // real: a GNU tar cannot extract a .zip and must fall back to unzip.
  const artifactDir = mkdtempSync(join(tmpdir(), 'acryl-npm-artifacts-'))
  const outDir = mkdtempSync(join(tmpdir(), 'acryl-npm-out-'))
  const version = JSON.parse(readFileSync(new URL('../distribution/acryl-npm-launcher/package.json', import.meta.url), 'utf8')).version
  const stagings = []
  try {
    for (const target of Object.keys(CLI_TARGETS)) {
      const windows = target === 'windows-x64'
      const staging = mkdtempSync(join(tmpdir(), `acryl-npm-stage-${target}-`))
      stagings.push(staging)
      const runtimeDir = join(staging, `acryl-cli-${target}`)
      mkdirSync(join(runtimeDir, 'bin'), { recursive: true })
      const launcher = join(runtimeDir, 'bin', windows ? 'acryl.cmd' : 'acryl')
      writeFileSync(launcher, windows ? '@echo off\r\n' : '#!/bin/sh\necho acryl\n')
      if (!windows) chmodSync(launcher, 0o755)
      writeFileSync(join(runtimeDir, 'receipt.json'), JSON.stringify(receiptFor({ target, version, payloadSha256: payloadSha256(runtimeDir) })))
      const archive = join(artifactDir, `acryl-cli-${target}.${windows ? 'zip' : 'tar.gz'}`)
      // Windows has no zip command; its own tar writes a .zip from the extension (-a).
      if (windows && process.platform === 'win32') execFileSync(tarCommand(), ['-a', '-cf', archive, `acryl-cli-${target}`], { cwd: staging })
      else if (windows) execFileSync('zip', ['-qr', archive, `acryl-cli-${target}`], { cwd: staging })
      else execFileSync(tarCommand(), ['-czf', archive, '-C', staging, `acryl-cli-${target}`])
    }
    execFileSync(process.execPath, ['scripts/publish-npm-cli.mjs', '--pack-only', outDir], {
      env: { ...process.env, ACRYL_CLI_ARTIFACT_DIR: artifactDir },
      stdio: 'inherit',
    })
    const produced = readdirSync(outDir).sort()
    assert.deepEqual(produced, [
      `acryl-${version}.tgz`,
      ...Object.keys(CLI_TARGETS).map(target => `acryl-cli-${target}-${version}.tgz`).sort(),
    ].sort())
  } finally {
    rmSync(artifactDir, { recursive: true, force: true })
    rmSync(outDir, { recursive: true, force: true })
    for (const staging of stagings) rmSync(staging, { recursive: true, force: true })
  }
})
