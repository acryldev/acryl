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
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tuiDir = join(root, 'acryl-tui')
const srcPkg = JSON.parse(readFileSync(join(tuiDir, 'package.json'), 'utf8'))
const version = process.env.ACRYL_NPM_VERSION ?? srcPkg.version
const dryRun = process.argv.includes('--dry-run')
const staging = mkdtempSync(join(tmpdir(), 'acryl-npm-'))

try {
  // 0. Build so the published `lib/bin.js` contains the corrected symlink-aware
  //    entrypoint (the regression that shipped in npm `acryl@0.1.8`).
  execFileSync('corepack', ['pnpm', '--filter', 'acryl-tui', 'exec', 'tsdown', '--config', 'tsdown.publish.config.ts'], {
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' },
  })

  // 1. Assemble the publishable `acryl` package from the built acryl-tui.
  const dir = join(staging, 'pkg')
  mkdirSync(dir, { recursive: true })
  cpSync(join(tuiDir, 'lib-publish'), join(dir, 'lib'), { recursive: true })
  if (existsSync(join(tuiDir, 'README.md'))) {
    cpSync(join(tuiDir, 'README.md'), join(dir, 'README.md'))
  }

  // The runtime needs core @deepseek-ai/cordis (a peer of the dsh packages). It
  // is a devDependency of acryl-tui, so the published manifest must declare it
  // as a prod dependency rather than relying on npm's auto-install-peers.
  const dependencies = { ...(srcPkg.dependencies ?? {}) }
  // Strip internal pnpm workspace:* deps (acryl-control, acryl-harness-runtime).
  // These are bundled into lib/bin.js by tsdown and are NOT published to npm, so
  // a `workspace:*` protocol in the published manifest breaks external installs
  // (npm cannot resolve it in the public registry).
  for (const k of Object.keys(dependencies)) {
    if (dependencies[k] === 'workspace:*') delete dependencies[k]
  }
  if (!dependencies['@deepseek-ai/cordis']) {
    dependencies['@deepseek-ai/cordis'] = srcPkg.devDependencies?.['@deepseek-ai/cordis'] ?? '4.0.1'
  }

  const publishPkg = {
    name: 'acryl',
    version,
    description: 'ACRYL local-first coding-agent workspace CLI',
    license: srcPkg.license ?? 'MIT',
    type: srcPkg.type,
    main: srcPkg.main,
    exports: srcPkg.exports,
    bin: { acryl: './lib/bin.js' },
    files: ['lib/**', 'README.md'],
    dependencies,
    engines: srcPkg.engines,
    keywords: ['acryl', 'coding-agent', 'terminal', 'cli', 'agentic'],
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(publishPkg, null, 2) + '\n')

  const tag = process.env.ACRYL_NPM_TAG ?? 'latest'
  if (dryRun) {
    console.log(`dry-run: would publish ${publishPkg.name}@${publishPkg.version} (tag=${tag})`)
    console.log(`  bin=${JSON.stringify(publishPkg.bin)} deps=${Object.keys(dependencies).length}`)
    execFileSync('npm', ['pack', dir, '--dry-run'], { cwd: dir, stdio: 'inherit' })
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
