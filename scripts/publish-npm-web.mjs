#!/usr/bin/env node
/**
 * Publish the standalone local Web surface to npm.
 *
 * `acryl-web` is a regular public package, unlike `acryl`, whose publish
 * artifact is assembled from the private workspace package `acryl-cli`.
 * This wrapper supplies npm auth through a temporary user config so no token
 * is written to the repository or a developer's global npm configuration.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'apps', 'acryl-web')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const dryRun = process.argv.includes('--dry-run')
const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN

if (!dryRun && !token) {
  throw new Error('publish-npm-web: NPM_TOKEN or NODE_AUTH_TOKEN is required')
}

const configDir = mkdtempSync(join(tmpdir(), 'acryl-web-npm-'))
try {
  if (token) {
    writeFileSync(join(configDir, '.npmrc'), `//registry.npmjs.org/:_authToken=${token}\n`)
  }
  // `pnpm publish`, not `npm publish`: acryl-web depends on real workspace
  // packages (`dsh-client-ui-brand-acryl`, `cordis-plugin-market`) via the
  // `workspace:*` protocol. Only pnpm's own publish rewrites that to the
  // dependency's real published version in what actually gets uploaded -
  // `npm publish` ships the literal string `workspace:*`, which is not a
  // valid version range npm's own installer understands, breaking every
  // real end-user install. `--no-git-checks` because this runs from CI
  // against a specific already-tagged commit, not an interactive release.
  execFileSync('pnpm', [
    'publish',
    '--access', 'public',
    '--tag', process.env.ACRYL_NPM_TAG ?? 'latest',
    '--no-git-checks',
    ...(dryRun ? ['--dry-run'] : []),
  ], {
    cwd: packageDir,
    stdio: 'inherit',
    env: { ...process.env, NPM_CONFIG_USERCONFIG: join(configDir, '.npmrc') },
  })
  console.log(`${dryRun ? 'validated' : 'published'} acryl-web@${manifest.version}`)
} finally {
  rmSync(configDir, { recursive: true, force: true })
}
