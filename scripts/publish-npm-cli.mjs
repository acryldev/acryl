#!/usr/bin/env node
/**
 * Build the `acryl-tui` CLI and publish it to npm under the canonical `acryl`
 * package name, so `npm install -g acryl` gives the corrected CLI on every
 * release.
 *
 * The workspace package is named `acryl-tui` (`bin: { acryl: lib/bin.js }`),
 * but the user-facing npm package is `acryl`. This script builds acryl-tui,
 * assembles a publishable `acryl` package (name overridden, same bin/deps/
 * version/files) in a temp dir, and runs `npm publish --access public`.
 *
 * Auth: the caller must supply `NPM_TOKEN` (or `NODE_AUTH_TOKEN`), which is
 * wired into npm's registry auth via a private userconfig. Pass `--dry-run` to
 * validate assembly without publishing.
 *
 * Dependency closure: the published package MUST carry the full production
 * runtime closure that the Cordis Loader resolves at boot. The DSH profile
 * bundle (dsh-base / dsh) declares plugin packages such as
 * `@deepseek-ai/cordis-plugin-timer`, `-hmr`, `@deepseek-ai/dsh-typert-loader`,
 * `dsh-subprocess-local`, and `dsh-sandbox-local`. `acryl-tui/package.json`
 * does not list these directly, and npm does not reproduce the workspace's
 * pnpm resolution, so a package built only from `acryl-tui`'s dependency list
 * silently omits them — an external `npm install -g acryl` then fails to apply
 * the loader entry include. We therefore derive the publish manifest's
 * dependency map from the actual deployed production closure (the same closure
 * the proven portable CLI archive uses) instead of the hand-curated subset.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tuiDir = join(root, 'acryl-tui')
const srcPkg = JSON.parse(readFileSync(join(tuiDir, 'package.json'), 'utf8'))
const srcPkgVersion = srcPkg.version
const version = process.env.ACRYL_NPM_VERSION ?? srcPkgVersion
// Single source of truth: the npm version must always equal the workspace
// package version (which the release workflow guarantees equals the release
// tag). An override that diverges was the cause of the 0.1.10 (workspace) vs
// 0.1.12 (npm) drift, so refuse to publish a divergent version.
if (version !== srcPkgVersion) {
  throw new Error(
    `publish-npm-cli: ACRYL_NPM_VERSION override (${version}) differs from the workspace package version (${srcPkgVersion}); ` +
    `the npm version must always match the workspace/release version`,
  )
}
const dryRun = process.argv.includes('--dry-run')
const packOnly = process.argv.includes('--pack-only')
const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-'))

/** Workspace-internal packages that are bundled into lib/bin.js and never published. */
const INTERNAL_WORKSPACE_PACKAGES = new Set([
  'acryl-control',
  'acryl-harness-runtime',
  'acryl-development-canvas',
  'dsh-community-market',
  'dsh-community-fabric',
])

/** True when a package.json is a platform-specific native addon (os/cpu-scoped).
 *  These are pulled transitively by their parent (e.g. @koromix/koffi-*, @img/sharp-*),
 *  so npm selects the right one per platform; they must NOT be flattened into the
 *  top-level dependency map (a foreign os/cpu entry would fail an npm install). */
function isPlatformNative(manifest) {
  return Boolean(manifest?.os) || Boolean(manifest?.cpu)
}

/** Walk a node_modules tree and collect every package name -> version.
 *  Handles both the top-level (hoisted/legacy) layout and pnpm's `.pnpm` store. */
function collectManifests(nodeModules) {
  const found = []
  // Helper: given a dir that contains packages (a node_modules folder), read
  // each package (plain, or @scope/name) and record its manifest path.
  const scanDir = (dir) => {
    let entries = []
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (entry.startsWith('@')) {
        for (const sub of readdirSafe(full)) {
          const pj = join(full, sub, 'package.json')
          if (existsSync(pj)) found.push([`${entry}/${sub}`, pj])
        }
      } else if (existsSync(join(full, 'package.json'))) {
        found.push([entry, join(full, 'package.json')])
      }
    }
  }
  scanDir(nodeModules)
  // pnpm virtual store: node_modules/.pnpm/<name@version>/node_modules/<name>
  const pnpmStore = join(nodeModules, '.pnpm')
  if (existsSync(pnpmStore)) {
    for (const entry of readdirSafe(pnpmStore)) {
      if (entry.startsWith('.')) continue
      const inner = join(pnpmStore, entry, 'node_modules')
      if (existsSync(inner)) scanDir(inner)
    }
  }
  return found
}

function readdirSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}

/** Read versions from the deployed tree without copying its maximal dependency map. */
function availableProductionDependencies(deployDir) {
  const nodeModules = join(deployDir, 'node_modules')
  const deps = {}
  for (const [name, pj] of collectManifests(nodeModules)) {
    if (INTERNAL_WORKSPACE_PACKAGES.has(name)) continue
    let manifest
    try { manifest = JSON.parse(readFileSync(pj, 'utf8')) } catch { continue }
    if (!manifest.version) continue
    if (isPlatformNative(manifest)) continue        // transitive-per-platform
    deps[name] = manifest.version
  }
  // The Loader must be able to resolve the core Cordis runtime as a peer.
  if (!deps['@deepseek-ai/cordis']) {
    deps['@deepseek-ai/cordis'] = srcPkg.devDependencies?.['@deepseek-ai/cordis'] ?? '4.0.1'
  }
  return deps
}

// Static publish-bundle imports plus the dynamic TUI/Web Loader rows audited in
// specs/025-acryl-runtime-distribution/evidence/tui-web-closure-audit.md.
const SHARED_CLI_PACKAGES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/cordis-plugin-hmr',
  '@deepseek-ai/cordis-plugin-include',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis-plugin-timer',
  '@deepseek-ai/dsh-agent-presets',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-authorization',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-goal',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-sandbox-local',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-stats',
  '@deepseek-ai/dsh-subprocess-local',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-typert-loader',
  '@deepseek-ai/dsh-web-app',
  '@earendil-works/pi-tui',
  'diff',
]

function selectSharedCliDependencies(available) {
  const missing = SHARED_CLI_PACKAGES.filter(name => available[name] === undefined)
  if (missing.length > 0) throw new Error(`publish-npm-cli: audited package missing from deployed closure: ${missing.join(', ')}`)
  return Object.fromEntries(SHARED_CLI_PACKAGES.map(name => [name, available[name]]))
}

try {
  // 0. Build the publish bundle with the dedicated publish config
  //    (tsdown.publish.config.ts), which BUNDLES the internal workspace
  //    packages (acryl-control / acryl-harness-runtime) into a self-contained
  //    lib-publish/bin.js. The default `build` leaves those external, so an
  //    external `npm install -g acryl` cannot resolve them at startup
  //    (ERR_MODULE_NOT_FOUND).
  execFileSync('corepack', ['pnpm', '--filter', 'acryl-tui', 'exec', 'tsdown', '-c', 'tsdown.publish.config.ts'], {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  })

  // 0b. Materialize the real production closure (same source as the portable
  //     archive) so the published dependency map is complete and npm-accurate.
  const deployDir = join(staging, 'deploy')
  mkdirSync(deployDir, { recursive: true })
  execFileSync('corepack', ['pnpm', '--filter', 'acryl-tui', 'deploy', deployDir, '--prod', '--legacy'], {
    stdio: 'ignore',
    env: { ...process.env, CI: 'true' },
  })

  // 1. Assemble the publishable `acryl` package from the built acryl-tui.
  const dir = join(staging, 'pkg')
  mkdirSync(dir, { recursive: true })
  cpSync(join(tuiDir, 'lib-publish'), join(dir, 'lib'), { recursive: true })
  if (existsSync(join(tuiDir, 'README.md'))) {
    cpSync(join(tuiDir, 'README.md'), join(dir, 'README.md'))
  }

  const dependencies = selectSharedCliDependencies(availableProductionDependencies(deployDir))

  // Gate: the Cordis Loader resolves these entries by package name at boot. If
  // any is absent from the published dependency map, an external
  // `npm install -g acryl` fails to apply the loader entry include (the exact
  // bug this fixes). Refuse to assemble/publish a package with an incomplete
  // runtime closure.
  const REQUIRED_LOADER_ENTRIES = [
    '@deepseek-ai/cordis-plugin-timer',
    '@deepseek-ai/cordis-plugin-hmr',
    '@deepseek-ai/dsh-typert-loader',
    '@deepseek-ai/dsh-subprocess-local',
    '@deepseek-ai/dsh-sandbox-local',
  ]
  const missing = REQUIRED_LOADER_ENTRIES.filter((k) => !dependencies[k])
  if (missing.length) {
    throw new Error(`publish-npm-cli: incomplete runtime closure; missing loader entries: ${missing.join(', ')}`)
  }

  const publishPkg = {
    name: 'acryl',
    version,
    description: 'A persistent, agent-agnostic coding environment. Keep your context, change your agent.',
    license: srcPkg.license ?? 'MIT',
    type: srcPkg.type,
    main: srcPkg.main,
    exports: srcPkg.exports,
    bin: { acryl: './lib/bin.js' },
    files: ['lib/**', 'README.md'],
    dependencies,
    engines: srcPkg.engines,
    keywords: ['ai', 'coding-agent', 'agent', 'agentic-development', 'cli', 'tui', 'developer-tools', 'context', 'agent-context', 'multi-agent', 'cordis', 'deepseek-harness'],
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(publishPkg, null, 2) + '\n')

  const tag = process.env.ACRYL_NPM_TAG ?? 'latest'
  if (dryRun) {
    console.log(`dry-run: would publish ${publishPkg.name}@${publishPkg.version} (tag=${tag})`)
    console.log(`  bin=${JSON.stringify(publishPkg.bin)} deps=${Object.keys(dependencies).length}`)
    console.log(`  has timer/hmr/typert/subprocess/sandbox loader entries: ${
      ['@deepseek-ai/cordis-plugin-timer', '@deepseek-ai/cordis-plugin-hmr', '@deepseek-ai/dsh-typert-loader', '@deepseek-ai/dsh-subprocess-local', '@deepseek-ai/dsh-sandbox-local']
        .map((k) => `${k}=${Boolean(dependencies[k])}`).join(', ')}`)
    execFileSync('npm', ['pack', dir, '--dry-run'], { cwd: dir, stdio: 'inherit' })
  } else if (packOnly) {
    // Assemble + pack a tarball so an external-install gate can consume it.
    // Usage: publish-npm-cli.mjs --pack-only <outdir>
    const outDir = resolve(process.argv[process.argv.indexOf('--pack-only') + 1] ?? '.')
    mkdirSync(outDir, { recursive: true })
    execFileSync('npm', ['pack', dir, '--silent'], { cwd: dir, stdio: 'inherit' })
    const tgz = `${publishPkg.name}-${publishPkg.version}.tgz`
    const outPath = join(outDir, tgz)
    if (existsSync(outPath)) rmSync(outPath, { force: true })
    cpSync(join(dir, tgz), outPath)
    console.log(outPath)
  } else {
    const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN
    if (!token) throw new Error('npm publish requires NPM_TOKEN or NODE_AUTH_TOKEN')
    const npmrc = `//registry.npmjs.org/:_authToken=${token}\n`
    writeFileSync(join(staging, '.npmrc'), npmrc)
    execFileSync('npm', ['publish', dir, '--access', 'public', '--tag', tag], {
      stdio: 'inherit',
      env: { ...process.env, NPM_CONFIG_USERCONFIG: join(staging, '.npmrc') },
    })
    console.log(`published ${publishPkg.name}@${publishPkg.version} (tag=${tag})`)
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}
