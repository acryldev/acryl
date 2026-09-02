import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { payloadSha256, receiptFor, targetForNode, targetPackageName } from '../acryl-npm-launcher/release-contract.js'

function pack(directory) {
  return join(directory, execFileSync('npm', ['pack', '--silent'], { cwd: directory, encoding: 'utf8' }).trim())
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
  const version = JSON.parse(readFileSync(new URL('../acryl-npm-launcher/package.json', import.meta.url), 'utf8')).version
  const runtime = join(directory, packageName, 'runtime')
  const launcher = join(runtime, 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl')
  try {
    mkdirSync(join(runtime, 'bin'), { recursive: true })
    writeFileSync(launcher, process.platform === 'win32'
      ? '@echo off\r\nnode -e "if (process.argv[1] === \'--version\') console.log(\'0.1.19\'); else console.log(\'{\\\"mode\\\":\\\"tui\\\"}\')" %*\r\n'
      : `#!/usr/bin/env node\nif (process.argv[2] === '--version') console.log('${version}')\nelse console.log('{\"mode\":\"tui\"}')\n`)
    if (process.platform !== 'win32') chmodSync(launcher, 0o755)
    writeFileSync(join(runtime, 'receipt.json'), JSON.stringify(receiptFor({ target, version, payloadSha256: payloadSha256(runtime) })))
    writeFileSync(join(directory, packageName, 'package.json'), JSON.stringify({
      name: packageName, version, os: [process.platform], cpu: [process.arch], files: ['runtime/**'],
    }))
    const targetTarball = pack(join(directory, packageName))

    const selector = join(directory, 'acryl')
    cpSync(new URL('../acryl-npm-launcher', import.meta.url), selector, { recursive: true })
    writeFileSync(join(selector, 'package.json'), JSON.stringify({
      name: 'acryl', version, type: 'module', bin: { acryl: './bin.js' },
      files: ['bin.js', 'runtime.js', 'release-contract.js', 'web-runtime.js', 'desktop-runtime.js'], optionalDependencies: { [packageName]: version },
    }))
    const selectorTarball = pack(selector)

    execFileSync('npm', ['install', '--global', '--prefix', prefix, '--include=optional', selectorTarball, targetTarball], { stdio: 'pipe' })
    const executable = join(prefix, 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl')
    assert.equal(execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim(), version)
    assert.deepEqual(JSON.parse(execFileSync(executable, ['tui', '--json'], { encoding: 'utf8' })), { mode: 'tui' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
