#!/usr/bin/env node
/**
 * Build one portable ACRYL CLI archive: a pinned Node runtime + the built CLI +
 * its production dependency closure, with no host Node/npm/pnpm requirement.
 *
 * Usage:
 *   node scripts/build-cli-archive.mjs <target> [node-version] [out-dir]
 *
 * Targets: darwin-arm64, darwin-x64, linux-arm64, linux-x64 (windows-x64 added
 * once the .cmd launcher path is smoke-tested on a Windows runner).
 *
 * Emits: <out>/acryl-cli-<target>.tar.gz and appends its SHA-256 to
 * <out>/checksums.txt.
 *
 * Proven slice: darwin-arm64 (2026-08-30) — built, extracted to an empty temp
 * dir, `acryl --version` and `acryl tui --json` ran with PATH=/usr/bin:/bin,
 * SHA-256 generated and verified.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const launcher = join(root, 'scripts', 'acryl-cli-launcher.sh')
const version = JSON.parse(readFileSync(join(root, 'acryl-tui', 'package.json'), 'utf8')).version

const TARGETS = {
  'darwin-arm64': { nodePlatform: 'darwin', nodeArch: 'arm64' },
  'darwin-x64': { nodePlatform: 'darwin', nodeArch: 'x64' },
  'linux-arm64': { nodePlatform: 'linux', nodeArch: 'arm64' },
  'linux-x64': { nodePlatform: 'linux', nodeArch: 'x64' },
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

async function main() {
  const target = process.argv[2]
  const nodeVersion = process.argv[3] ?? '24.19.0'
  const outDir = resolve(process.argv[4] ?? join(root, 'release-artifacts'))
  const spec = TARGETS[target]
  if (!spec) {
    throw new Error(`unsupported CLI target ${target}; supported: ${Object.keys(TARGETS).join(', ')}`)
  }
  const nodeDist = `node-v${nodeVersion}-${spec.nodePlatform}-${spec.nodeArch}`
  const archiveName = `acryl-cli-${target}.tar.gz`
  const staging = join(tmpdir(), `acryl-cli-${target}`)
  const archiveDir = join(staging, `acryl-cli-${target}`)

  rmSync(staging, { recursive: true, force: true })

  // 1. Production dependency closure (isolated, hoisted) for the CLI.
  run('corepack', ['pnpm', '--filter', 'acryl-tui', 'deploy', archiveDir, '--prod', '--legacy'], {
    env: { ...process.env, CI: 'true' },
  })
  mkdirSync(join(archiveDir, 'bin'), { recursive: true })

  // 2. Pinned Node runtime for this target.
  const nodeArchive = join(tmpdir(), `${nodeDist}.tar.gz`)
  run('curl', ['-fsSL', '-o', nodeArchive, `https://nodejs.org/dist/v${nodeVersion}/${nodeDist}.tar.gz`])
  const nodeExtract = join(staging, 'node-dist')
  mkdirSync(nodeExtract, { recursive: true })
  run('tar', ['-xzf', nodeArchive, '-C', nodeExtract])
  copyFileSync(join(nodeExtract, nodeDist, 'bin', 'node'), join(archiveDir, 'bin', 'node'))
  chmodSync(join(archiveDir, 'bin', 'node'), 0o755)

  // 3. Launcher: bundled node --expose-internals (Cordis HMR boot guard).
  copyFileSync(launcher, join(archiveDir, 'bin', 'acryl'))
  chmodSync(join(archiveDir, 'bin', 'acryl'), 0o755)

  // 4. Archive + checksum.
  mkdirSync(outDir, { recursive: true })
  const archivePath = join(outDir, archiveName)
  run('tar', ['-czf', archivePath, '-C', staging, `acryl-cli-${target}`])
  const checksumPath = join(outDir, 'checksums.txt')
  const line = `${sha256File(archivePath)}  ${archiveName}\n`
  if (!existsSync(checksumPath)) writeFileSync(checksumPath, line)
  else {
    const rest = readFileSync(checksumPath, 'utf8').split('\n').filter((l) => !l.includes(archiveName)).join('\n')
    writeFileSync(checksumPath, `${rest}${rest ? '\n' : ''}${line}`)
  }
  console.log(`built ${archivePath}`)
  console.log(`checksum: ${line.trim()}`)

  // `pnpm deploy --prod` marks the workspace modules state as production-only
  // (node_modules/.modules.yaml included.devDependencies=false), which prunes
  // devDependencies on the next install. Restore the full dev graph so a local
  // run leaves the workspace healthy; CI runners are isolated and unaffected.
  run('corepack', ['pnpm', 'install'], { env: { ...process.env, CI: 'true' } })
}

main().catch((cause) => {
  process.stderr.write(`build-cli-archive: ${cause instanceof Error ? cause.message : String(cause)}\n`)
  process.exitCode = 1
})
