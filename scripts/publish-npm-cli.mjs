#!/usr/bin/env node
/** Assemble npm tarballs only. Publication remains an explicit release-CI action. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_TARGETS, targetPackageName } from './release-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const selectorSource = join(root, 'acryl-npm-launcher')
const version = JSON.parse(readFileSync(join(selectorSource, 'package.json'), 'utf8')).version
const requestedVersion = process.env.ACRYL_NPM_VERSION ?? version
if (requestedVersion !== version) throw new Error(`publish-npm-cli: ACRYL_NPM_VERSION (${requestedVersion}) must equal workspace version (${version})`)
const packOnlyIndex = process.argv.indexOf('--pack-only')
const packOnly = packOnlyIndex !== -1
const outDir = resolve(packOnly ? (process.argv[packOnlyIndex + 1] ?? '.') : process.env.ACRYL_NPM_OUT_DIR ?? 'release-artifacts/npm')
const artifactDir = resolve(process.env.ACRYL_CLI_ARTIFACT_DIR ?? join(root, 'release-artifacts'))
const printManifests = process.argv.includes('--print-manifests')
const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-'))

function targetManifest(target) {
  const spec = CLI_TARGETS[target]
  return {
    name: targetPackageName(target), version, private: false, description: `ACRYL prepared CLI runtime for ${target}`,
    license: 'MIT', os: [spec.npmOs], cpu: [spec.npmCpu], files: ['runtime/**'],
  }
}

function selectorManifest() {
  return {
    name: 'acryl', version, private: false, type: 'module', bin: { acryl: './bin.js' },
    files: ['bin.js', 'runtime.js', 'release-contract.js', 'web-runtime.js', 'desktop-runtime.js', 'README.md'],
    optionalDependencies: Object.fromEntries(Object.keys(CLI_TARGETS).map(target => [targetPackageName(target), version])),
    engines: { node: '>=22.19.0 || >=24.0.0' },
    description: 'A persistent, agent-agnostic coding environment. Keep your context, change your agent.',
    keywords: ['ai', 'coding-agent', 'agent', 'agentic-development', 'cli', 'tui', 'developer-tools', 'context', 'agent-context', 'multi-agent', 'cordis', 'deepseek-harness'],
    homepage: 'https://acryl.dev', repository: 'github:acryldev/acryl', license: 'MIT',
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
  // extract PKZIP archives, so this target requires unzip instead of tar -xf.
  if (target === 'windows-x64') execFileSync('unzip', ['-q', archive, '-d', output], { stdio: 'inherit' })
  else execFileSync('tar', ['-xf', archive, '-C', output], { stdio: 'inherit' })
  const extracted = join(output, `acryl-cli-${target}`)
  if (!existsSync(join(extracted, 'receipt.json'))) throw new Error(`publish-npm-cli: ${archive} has no runtime receipt`)
  return extracted
}

function pack(directory) {
  execFileSync('npm', ['pack', '--silent'], { cwd: directory, stdio: 'inherit' })
  const tarball = readdirSync(directory).find(name => name.endsWith('.tgz'))
  if (!tarball) throw new Error(`publish-npm-cli: npm pack did not produce a tarball for ${directory}`)
  mkdirSync(outDir, { recursive: true })
  cpSync(join(directory, tarball), join(outDir, tarball))
}

try {
  if (printManifests) {
    console.log(JSON.stringify({ selector: selectorManifest(), targets: Object.fromEntries(Object.keys(CLI_TARGETS).map(target => [target, targetManifest(target)])) }))
  } else for (const target of Object.keys(CLI_TARGETS)) {
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
    for (const file of ['bin.js', 'runtime.js', 'release-contract.js', 'web-runtime.js', 'desktop-runtime.js', 'README.md']) {
      if (existsSync(join(selectorSource, file))) cpSync(join(selectorSource, file), join(selector, file))
    }
    writeFileSync(join(selector, 'package.json'), `${JSON.stringify(selectorManifest(), null, 2)}\n`)
    pack(selector)
    if (!packOnly) console.log(`assembled npm CLI packages in ${outDir}; publication is intentionally not performed`)
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}
