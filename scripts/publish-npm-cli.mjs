#!/usr/bin/env node
/** Assemble npm tarballs only. Publication remains an explicit release-CI action. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleLauncher } from '../distribution/acryl-npm-launcher/tui/bundle.mjs'
import { execShim, tarCommand } from './lib/portable-commands.mjs'
import { CLI_TARGETS, targetPackageName } from './release-contract.mjs'
import { MINIMUM as MINIMUM_NODE } from '../distribution/acryl-npm-launcher/node-version.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const selectorSource = join(root, 'distribution', 'acryl-npm-launcher')
const selectorPackage = JSON.parse(readFileSync(join(selectorSource, 'package.json'), 'utf8'))
const version = selectorPackage.version
// The launcher's own package.json lists what the selector ships; a second list here once left forward.js out of the tarball.
const selectorFiles = selectorPackage.files.filter(file => file !== 'package.json')
const LAUNCHER_BUNDLE = 'launcher.js'
const requestedVersion = process.env.ACRYL_NPM_VERSION ?? version
if (requestedVersion !== version) throw new Error(`publish-npm-cli: ACRYL_NPM_VERSION (${requestedVersion}) must equal workspace version (${version})`)
const packOnlyIndex = process.argv.indexOf('--pack-only')
const packOnly = packOnlyIndex !== -1
const outDir = resolve(packOnly ? (process.argv[packOnlyIndex + 1] ?? '.') : process.env.ACRYL_NPM_OUT_DIR ?? 'release-artifacts/npm')
const artifactDir = resolve(process.env.ACRYL_CLI_ARTIFACT_DIR ?? join(root, 'release-artifacts'))
const printManifests = process.argv.includes('--print-manifests')
// --only <target>: pack that target's runtime and the selector, from that one archive (the npm round trip on one machine, scripts/npm-round-trip.mjs).
const onlyIndex = process.argv.indexOf('--only')
const only = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1]
if (only !== undefined && !CLI_TARGETS[only]) throw new Error(`publish-npm-cli: --only needs one of ${Object.keys(CLI_TARGETS).join(', ')}`)
// --selector-only: pack the selector alone, for a release that changes only the launcher (its runtimes stay those of `acrylRuntime`).
const selectorOnly = process.argv.includes('--selector-only')
if (selectorOnly && !/^\d+\.\d+\.\d+$/u.test(selectorPackage.acrylRuntime ?? '')) throw new Error('publish-npm-cli: --selector-only needs acrylRuntime (the last full release) in distribution/acryl-npm-launcher/package.json')
const packedTargets = selectorOnly ? [] : only === undefined ? Object.keys(CLI_TARGETS) : [only]
const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-'))

function targetManifest(target) {
  const spec = CLI_TARGETS[target]
  return {
    name: targetPackageName(target), version, private: false, description: `ACRYL prepared CLI runtime for ${target}`,
    license: 'MIT', os: [spec.npmOs], cpu: [spec.npmCpu], files: ['runtime/**'],
  }
}

function selectorManifest() {
  // The package's own manifest (what `npm publish` in its folder sends too), without the scripts and the dev dependencies that only build it
  // (the terminal Control Center is bundled into launcher.js).
  const { scripts: _scripts, devDependencies: _bundled, ...manifest } = selectorPackage
  return {
    ...manifest,
    private: false,
    files: selectorFiles,
    // No runtime dependency: `npx acryl` downloads only the selector and the launcher. The terminal agent's runtime (`acryl-cli-<target>`, about
    // 450 MB) is installed into ~/.acryl/runtime the first time someone opens it (spec 050 D14, T009). A full release ships both at one version; a
    // selector-only release (--selector-only) keeps pointing at the last full one.
    acrylRuntime: selectorOnly ? selectorPackage.acrylRuntime : version,
    // The same minimum bin.js checks before anything loads (distribution/acryl-npm-launcher/node-version.js).
    engines: { node: `>=${MINIMUM_NODE}` },
  }
}

function archiveFor(target) {
  const extension = target === 'windows-x64' ? 'zip' : 'tar.gz'
  return join(artifactDir, `acryl-cli-${target}.${extension}`)
}

function extractRuntime(target, output) {
  const archive = archiveFor(target)
  if (!existsSync(archive)) throw new Error(`publish-npm-cli: missing prepared artifact ${archive}; run build-cli-archive first`)
  mkdirSync(output, { recursive: true })
  // windows-x64 ships as .zip (see build-cli-archive.mjs); GNU tar cannot
  // extract PKZIP archives, so this target requires unzip instead of tar -xf,
  // except on Windows, whose own tar reads both.
  if (target === 'windows-x64' && process.platform !== 'win32') execFileSync('unzip', ['-q', archive, '-d', output], { stdio: 'inherit' })
  else execFileSync(tarCommand(), ['-xf', archive, '-C', output], { stdio: 'inherit' })
  const extracted = join(output, `acryl-cli-${target}`)
  if (!existsSync(join(extracted, 'receipt.json'))) throw new Error(`publish-npm-cli: ${archive} has no runtime receipt`)
  return extracted
}

function pack(directory) {
  execShim('npm', ['pack', '--silent'], { cwd: directory, stdio: 'inherit' })
  const tarball = readdirSync(directory).find(name => name.endsWith('.tgz'))
  if (!tarball) throw new Error(`publish-npm-cli: npm pack did not produce a tarball for ${directory}`)
  mkdirSync(outDir, { recursive: true })
  cpSync(join(directory, tarball), join(outDir, tarball))
}

try {
  if (printManifests) {
    console.log(JSON.stringify({ selector: selectorManifest(), targets: Object.fromEntries(Object.keys(CLI_TARGETS).map(target => [target, targetManifest(target)])) }))
  } else for (const target of packedTargets) {
    const directory = join(staging, targetPackageName(target))
    const runtime = extractRuntime(target, directory)
    // The archive root is the npm package's runtime payload.
    if (runtime !== join(directory, 'runtime')) cpSync(runtime, join(directory, 'runtime'), { recursive: true })
    writeFileSync(join(directory, 'package.json'), `${JSON.stringify(targetManifest(target), null, 2)}\n`)
    pack(directory)
  }
  if (!printManifests) {
    const selector = join(staging, 'acryl')
    mkdirSync(selector, { recursive: true })
    for (const file of selectorFiles) {
      // launcher.js is made, not kept: the terminal launcher (spec 050) bundled into one file with nothing to install.
      if (file === LAUNCHER_BUNDLE) { await bundleLauncher(join(selector, file)); continue }
      if (!existsSync(join(selectorSource, file))) throw new Error(`publish-npm-cli: the launcher lists ${file} in files but it is missing`)
      cpSync(join(selectorSource, file), join(selector, file))
    }
    writeFileSync(join(selector, 'package.json'), `${JSON.stringify(selectorManifest(), null, 2)}\n`)
    pack(selector)
    if (!packOnly) console.log(`assembled npm CLI packages in ${outDir}; publication is intentionally not performed`)
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}
