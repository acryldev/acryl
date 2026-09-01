#!/usr/bin/env node
/** Build a target-ready, portable ACRYL Web runtime archive and integrity receipt. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'
import { flattenNodeModules } from './flatten-node-modules.mjs'
import { verifyArtifactManifest, inspectDirectory } from './inspect-artifact.mjs'
import { pruneReleasePayload } from './prune-release-payload.mjs'
import { pruneTargetNative } from './prune-target-native.mjs'
import { artifactReceipt, webTarget } from './web-archive-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'acryl-web', 'package.json'), 'utf8')).version
const releaseBaseUrl = process.env.ACRYL_RELEASE_BASE_URL ?? `https://github.com/acryldev/acryl/releases/download/v${version}`
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options })
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const directoryEntries = directory => {
  const walk = current => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const path = join(current, entry.name)
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [{ path: relative(directory, path).replaceAll(sep, '/'), bytes: statSync(path).size }] : []
  })
  return walk(directory)
}

async function main() {
  const target = process.argv[2]
  const nodeVersion = process.argv[3] ?? '24.19.0'
  const outDir = resolve(process.argv[4] ?? join(root, 'release-artifacts'))
  const spec = webTarget(target)
  const staging = join(tmpdir(), `acryl-web-${target}`)
  const archiveDir = join(staging, `acryl-web-${target}`)
  const nodeDist = `node-v${nodeVersion}-${spec.nodePlatform}-${spec.nodeArch}`
  const archiveName = `acryl-web-${target}.tar.gz`
  rmSync(staging, { recursive: true, force: true })
  try {
    run(corepackCommand(process.platform), ['pnpm', '--filter', 'acryl-web', 'deploy', archiveDir, '--prod', '--legacy'], {
      ...corepackSpawnOptions(process.platform), env: { ...process.env, CI: 'true' },
    })
    mkdirSync(join(archiveDir, 'runtime', 'bin'), { recursive: true })
    const nodeArchive = join(tmpdir(), `${nodeDist}.tar.gz`)
    run('curl', ['-fsSL', '-o', nodeArchive, `https://nodejs.org/dist/v${nodeVersion}/${nodeDist}.tar.gz`])
    run('tar', ['-xzf', nodeArchive, '-C', staging])
    copyFileSync(join(staging, nodeDist, spec.windows ? 'node.exe' : 'bin/node'), join(archiveDir, 'runtime', 'bin', spec.windows ? 'node.exe' : 'node'))
    const launcher = join(archiveDir, 'runtime', 'bin', spec.windows ? 'acryl-web.cmd' : 'acryl-web')
    writeFileSync(launcher, spec.windows
      ? '@echo off\r\n"%~dp0node.exe" "%~dp0..\\..\\lib\\bin.js" %*\r\n'
      : '#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../../lib/bin.js" "$@"\n')
    chmodSync(join(archiveDir, 'runtime', 'bin', spec.windows ? 'node.exe' : 'node'), 0o755)
    if (!spec.windows) chmodSync(launcher, 0o755)
    flattenNodeModules(archiveDir)
    pruneTargetNative(archiveDir, spec.windows ? 'win32' : spec.nodePlatform, spec.nodeArch)
    pruneReleasePayload(archiveDir)
    verifyArtifactManifest({
      product: 'web', platform: spec.windows ? 'win32' : spec.nodePlatform, arch: spec.nodeArch,
      requiredPaths: [`runtime/bin/${spec.windows ? 'acryl-web.cmd' : 'acryl-web'}`, `runtime/bin/${spec.windows ? 'node.exe' : 'node'}`, 'lib/bin.js'], 
      forbiddenPathPatterns: ['**/acryl-desktop/**', '**/electron/**', '**/*.map', '**/tests/**'],
      allowedNativePackagePatterns: [`node_modules/**/prebuilds/${spec.windows ? 'win32' : spec.nodePlatform}-${spec.nodeArch}/**`], maximumBytes: 1_000_000_000,
    }, inspectDirectory(archiveDir, directoryEntries))
    mkdirSync(outDir, { recursive: true })
    const archive = join(outDir, archiveName)
    run('tar', ['-czf', archive, '-C', staging, `acryl-web-${target}`])
    const receipt = artifactReceipt({ version, target, archive: `${releaseBaseUrl}/${archiveName}`, sha256: sha256(archive) })
    writeFileSync(join(outDir, `${archiveName}.receipt.json`), `${JSON.stringify(receipt, null, 2)}\n`)
    const checksums = join(outDir, 'checksums.txt')
    const line = `${receipt.sha256}  ${archiveName}`
    const old = existsSync(checksums) ? readFileSync(checksums, 'utf8').split('\n').filter(value => value && !value.endsWith(`  ${archiveName}`)) : []
    writeFileSync(checksums, [...old, line].join('\n') + '\n')
    console.log(`built ${archive}\nreceipt: ${join(outDir, `${archiveName}.receipt.json`)}\nchecksum: ${line}`)
  } finally {
    rmSync(staging, { recursive: true, force: true })
    run(corepackCommand(process.platform), ['pnpm', 'install'], { ...corepackSpawnOptions(process.platform), cwd: root, env: { ...process.env, CI: 'true' } })
  }
}
main().catch(cause => { process.stderr.write(`build-web-archive: ${cause instanceof Error ? cause.message : String(cause)}\n`); process.exitCode = 1 })
