import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const IGNORED_NODE_MODULE_ENTRIES = new Set(['.bin', '.pnpm'])

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function packageDirectories(nodeModules) {
  if (!existsSync(nodeModules)) return []
  const entries = readdirSync(nodeModules).filter(name => !IGNORED_NODE_MODULE_ENTRIES.has(name)).sort()
  return entries.flatMap(name => {
    const path = join(nodeModules, name)
    if (!isDirectory(path)) return []
    if (name.startsWith('@')) {
      return readdirSync(path).sort().map(child => join(path, child)).filter(isDirectory)
    }
    return [path]
  })
}

/**
 * Count package roots reachable through Node resolution beneath one installed
 * package. Symlink aliases are canonicalized, while npm's implementation
 * directories (.pnpm) and executable links (.bin) are deliberately ignored.
 */
export function countInstalledPackages(nodeModules) {
  const seen = new Set()
  const visit = directory => {
    for (const candidate of packageDirectories(directory)) {
      const manifest = join(candidate, 'package.json')
      if (!existsSync(manifest)) continue
      const canonical = realpathSync(candidate)
      if (seen.has(canonical)) continue
      seen.add(canonical)
      visit(join(candidate, 'node_modules'))
    }
  }
  visit(nodeModules)
  return seen.size
}

export function installedAcrylRoot(globalModulesRoot) {
  const root = join(globalModulesRoot, 'acryl')
  if (!existsSync(join(root, 'package.json'))) {
    throw new Error(`acryl package was not installed below ${globalModulesRoot}`)
  }
  return realpathSync(root)
}

function npmCommand(args, environment) {
  return execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { encoding: 'utf8', env: environment }).trim()
}

function treeStatistics(root) {
  let files = 0
  let bytes = 0
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        files += 1
        bytes += lstatSync(path).size
      }
    }
  }
  visit(root)
  return { installedBytes: bytes, installedFileCount: files }
}

function installedCommand(prefix, args, environment) {
  const executable = join(prefix, 'bin', process.platform === 'win32' ? 'acryl.cmd' : 'acryl')
  return execFileSync(executable, args, { encoding: 'utf8', env: environment }).trim()
}

/** Measure an already-packed candidate. Packing/download is deliberately outside timed installation. */
export function measurePackedInstall(tarball) {
  const work = mkdtempSync(join(tmpdir(), 'acryl-npm-install-'))
  const prefix = join(work, 'prefix')
  const environment = {
    HOME: join(work, 'home'),
    PATH: process.env.PATH ?? '',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_cache: join(work, 'install-cache'),
    npm_config_prefix: prefix,
  }
  try {
    const started = performance.now()
    npmCommand(['install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', tarball], environment)
    const installWallTimeMs = Math.round(performance.now() - started)
    const globalModulesRoot = npmCommand(['root', '--global', '--prefix', prefix], environment)
    const root = installedAcrylRoot(globalModulesRoot)
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const versionOutput = installedCommand(prefix, ['--version'], environment)
    const tuiJsonOutput = installedCommand(prefix, ['tui', '--json'], environment)
    return {
      canonicalInstalledPackageCount: countInstalledPackages(join(root, 'node_modules')),
      directDependencyCount: Object.keys(manifest.dependencies ?? {}).length,
      installWallTimeMs,
      installedAcrylRoot: root,
      ...treeStatistics(root),
      tuiJsonCheck: { exitCode: 0, stdout: tuiJsonOutput },
      versionCheck: { exitCode: 0, stdout: versionOutput },
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const tarball = process.argv[2]
  if (tarball === undefined) {
    console.error('usage: node scripts/measure-npm-install.mjs <candidate.tgz>')
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(measurePackedInstall(tarball), null, 2))
  }
}
