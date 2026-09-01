#!/usr/bin/env node
/**
 * Build one portable ACRYL CLI archive: the built CLI + its production
 * dependency closure. The CLI runs on the host's Node (>=22.19.0), so the
 * archive carries no bundled Node runtime and stays small for a fast
 * `npm i -g acryl`.
 *
 * Usage:
 *   node scripts/build-cli-archive.mjs <target> [out-dir]
 *
 * Targets: darwin-arm64, darwin-x64, linux-arm64, linux-x64, windows-x64.
 *   unix targets   -> acryl-cli-<target>.tar.gz with a sh launcher
 *   windows-x64    -> acryl-cli-windows-x64.zip with a .cmd launcher
 * Appends each SHA-256 to <out>/checksums.txt.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { corepackCommand, corepackSpawnOptions } from './cli-archive-platform.mjs'
import { flattenNodeModules } from './flatten-node-modules.mjs'
import { pruneTargetNative } from './prune-target-native.mjs'
import { pruneReleasePayload } from './prune-release-payload.mjs'
import { payloadSha256, receiptFor } from './release-contract.mjs'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'acryl-tui', 'package.json'), 'utf8')).version

const TARGETS = {
  'darwin-arm64': { nodePlatform: 'darwin', nodeArch: 'arm64' },
  'darwin-x64': { nodePlatform: 'darwin', nodeArch: 'x64' },
  'linux-arm64': { nodePlatform: 'linux', nodeArch: 'arm64' },
  'linux-x64': { nodePlatform: 'linux', nodeArch: 'x64' },
  'windows-x64': { nodePlatform: 'win', nodeArch: 'x64', windows: true },
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

const REQUIRED_LOADER_ENTRIES = [
  '@deepseek-ai/cordis-plugin-timer',
  '@deepseek-ai/cordis-plugin-hmr',
  '@deepseek-ai/dsh-typert-loader',
  '@deepseek-ai/dsh-subprocess-local',
  '@deepseek-ai/dsh-sandbox-local',
]

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function koffiPlatform(platform) { return platform === 'win' ? 'win32' : platform }

/** Fail fast (with a precise message) if the CLI runtime closure is incomplete. */
function verifyCliRuntimeClosure(archiveDir, target, spec) {
  const missing = REQUIRED_LOADER_ENTRIES.filter(entry => !existsSync(join(archiveDir, 'node_modules', entry)))
  if (missing.length > 0) throw new Error(`CLI runtime closure missing required loader entries: ${missing.join(', ')}`)
  const koffiPackage = `@koromix/koffi-${koffiPlatform(spec.nodePlatform)}-${spec.nodeArch}`
  const nativeRoot = join(archiveDir, 'node_modules', koffiPackage)
  const hasNative = existsSync(nativeRoot) && walk(nativeRoot).some(path => path.endsWith('koffi.node'))
  if (!hasNative) throw new Error(`CLI runtime closure missing the ${koffiPackage} native binary`)
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

async function main() {
  const target = process.argv[2]
  const outDir = resolve(process.argv[3] ?? join(root, 'release-artifacts'))
  const spec = TARGETS[target]
  if (!spec) {
    throw new Error(`unsupported CLI target ${target}; supported: ${Object.keys(TARGETS).join(', ')}`)
  }
  const windows = spec.windows === true
  const archiveName = `acryl-cli-${target}.${windows ? 'zip' : 'tar.gz'}`
  const launcherName = windows ? 'acryl.cmd' : 'acryl'
  const launcher = join(root, 'scripts', windows ? 'acryl-cli-launcher.cmd' : 'acryl-cli-launcher.sh')
  const staging = join(tmpdir(), `acryl-cli-${target}`)
  const archiveDir = join(staging, `acryl-cli-${target}`)

  rmSync(staging, { recursive: true, force: true })

  // 1. Production dependency closure (isolated, hoisted) for the CLI.
  // Override platform/arch env vars to ensure correct prebuilds are fetched for the target.
  const platformEnv = spec.nodePlatform === 'win' ? 'win32' : spec.nodePlatform
  run(corepackCommand(process.platform), ['pnpm', '--filter', 'acryl-tui', 'deploy', archiveDir, '--prod', '--legacy'], {
    ...corepackSpawnOptions(process.platform),
    env: { ...process.env, CI: 'true', npm_config_platform: platformEnv, npm_config_arch: spec.nodeArch },
  })
  mkdirSync(join(archiveDir, 'bin'), { recursive: true })

  // 2. Launcher: resolves host Node --expose-internals (Cordis HMR boot guard).
  copyFileSync(launcher, join(archiveDir, 'bin', launcherName))
  if (!windows) chmodSync(join(archiveDir, 'bin', launcherName), 0o755)

  // 3. Flatten the pnpm isolated (.pnpm symlinked) node_modules to a hoisted,
  // symlink-free layout. ZIP archives and Windows extractors do not preserve
  // pnpm's relative symlinks, so an unflattened archive fails to resolve bare
  // specifiers (e.g. `@deepseek-ai/cordis`) after extraction. Tar.gz preserves
  // symlinks but a symlink-free tree works on every extractor and platform.
  flattenNodeModules(archiveDir)
  pruneTargetNative(archiveDir, spec.nodePlatform === 'win' ? 'win32' : spec.nodePlatform, spec.nodeArch)
  pruneReleasePayload(archiveDir)
  verifyCliRuntimeClosure(archiveDir, target, spec)

  // A receipt binds this prepared, target-specific payload to one release.
  // It intentionally hashes the runtime tree excluding the receipt itself.
  writeFileSync(join(archiveDir, 'receipt.json'), `${JSON.stringify(receiptFor({
    target,
    version,
    payloadSha256: payloadSha256(archiveDir),
  }), null, 2)}\n`)

  // 4. Archive + checksum.
  mkdirSync(outDir, { recursive: true })
  const archivePath = join(outDir, archiveName)
  if (windows) run('tar', ['-a', '-c', '-f', archivePath, '-C', staging, `acryl-cli-${target}`])
  else run('tar', ['-czf', archivePath, '-C', staging, `acryl-cli-${target}`])
  const checksumPath = join(outDir, 'checksums.txt')
  const line = `${sha256File(archivePath)}  ${archiveName}`
  const existing = existsSync(checksumPath)
    ? readFileSync(checksumPath, 'utf8').split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0 && !l.includes(archiveName))
    : []
  writeFileSync(checksumPath, [...existing, line].join('\n') + '\n')
  console.log(`built ${archivePath}`)
  console.log(`checksum: ${line}`)

  // `pnpm deploy --prod` marks the workspace modules state as production-only
  // (node_modules/.modules.yaml included.devDependencies=false), which prunes
  // devDependencies on the next install. Restore the full dev graph so a local
  // run leaves the workspace healthy; CI runners are isolated and unaffected.
  run(corepackCommand(process.platform), ['pnpm', 'install'], {
    ...corepackSpawnOptions(process.platform),
    env: { ...process.env, CI: 'true' },
  })
}

main().catch((cause) => {
  process.stderr.write(`build-cli-archive: ${cause instanceof Error ? cause.message : String(cause)}\n`)
  process.exitCode = 1
})
