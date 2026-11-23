#!/usr/bin/env node
/**
 * Release the `acryl` command: npm and this repository's GitHub release always carry the same version, made in one run.
 *
 *   node scripts/release-acryl.mjs --notes <file.md> [--userconfig <npmrc>] [--go]
 *   node scripts/release-acryl.mjs --check          (only compares npm `latest` with the GitHub Latest release)
 *
 * The version is distribution/acryl-npm-launcher/package.json's. In order, stopping at the first failure:
 *   1. the tree is clean, HEAD is on origin/main, and neither npm nor GitHub has this version yet;
 *   2. the selector is packed (scripts/pack-npm-selector.mjs);
 *   3. --go only from here: npm publish (latest);
 *   4. the tag acryl-v<version> at HEAD is pushed;
 *   5. the GitHub release acryl-v<version> is made Latest, with the tarball and the notes;
 *   6. npm `latest` and the GitHub Latest release are compared: the run fails when they differ.
 * Without --go it stops after step 2 and says what it would do. Pragmatic Programmer: one command, nothing done by hand.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'acryldev/acryl'
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }
const win = process.platform === 'win32'
const run = (cmd, argv, options = {}) => execFileSync(win && (cmd === 'npm' || cmd === 'gh') ? `${cmd}.cmd` : cmd, argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim()
const tryRun = (cmd, argv) => { try { return run(cmd, argv) } catch { return undefined } }
const stop = (message) => { console.error(`release-acryl: STOP - ${message}`); process.exit(1) }

/** npm `latest` and the GitHub Latest release, as versions. */
export function versionsAgree(npmLatest, githubLatestTag) {
  return typeof npmLatest === 'string' && githubLatestTag === `acryl-v${npmLatest}`
}

function compare() {
  const npmLatest = tryRun('npm', ['view', 'acryl', 'dist-tags.latest'])
  const githubLatest = tryRun('gh', ['release', 'view', '--repo', REPO, '--json', 'tagName', '-q', '.tagName'])
  const ok = versionsAgree(npmLatest, githubLatest)
  console.log(`npm latest acryl@${npmLatest ?? '?'}, GitHub Latest ${githubLatest ?? '?'}: ${ok ? 'the same' : 'DIFFERENT'}`)
  return ok
}

function main() {
  if (flag('--check')) process.exit(compare() ? 0 : 1)

  const version = JSON.parse(readFileSync(join(root, 'distribution', 'acryl-npm-launcher', 'package.json'), 'utf8')).version
  const tag = `acryl-v${version}`
  const notes = value('--notes')
  if (notes === undefined || !existsSync(notes)) stop('--notes <file.md> is required: what this release changes, in plain words')

  // 1. Where we stand.
  if (run('git', ['status', '--porcelain']) !== '') stop('the working tree is not clean')
  run('git', ['fetch', '--quiet', 'origin', 'main', '--tags'])
  const head = run('git', ['rev-parse', 'HEAD'])
  if (tryRun('git', ['merge-base', '--is-ancestor', head, 'origin/main']) === undefined) stop('HEAD is not on origin/main: push it first')
  if (tryRun('npm', ['view', `acryl@${version}`, 'version']) === version) stop(`acryl@${version} is already on npm: raise the version in distribution/acryl-npm-launcher/package.json`)
  if (tryRun('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]) !== undefined) stop(`the tag ${tag} already exists`)
  console.log(`1. acryl ${version} from ${head.slice(0, 8)} (on origin/main), not on npm, no tag ${tag}`)

  // 2. Pack.
  const out = mkdtempSync(join(tmpdir(), 'acryl-release-'))
  run('node', ['scripts/pack-npm-selector.mjs', out], { stdio: ['ignore', 'pipe', 'inherit'] })
  const tarball = readdirSync(out).find(name => name === `acryl-${version}.tgz`)
  if (tarball === undefined) stop(`the pack made no acryl-${version}.tgz in ${out}`)
  console.log(`2. packed ${join(out, tarball)}`)

  if (!flag('--go')) {
    console.log(`(dry run) with --go: npm publish, tag ${tag} at ${head.slice(0, 8)}, GitHub release ${tag} as Latest, then npm and GitHub compared`)
    process.exit(0)
  }

  // 3. npm.
  const userconfig = value('--userconfig')
  run('npm', ['publish', join(out, tarball), '--access', 'public', '--tag', 'latest', ...(userconfig === undefined ? [] : ['--userconfig', userconfig])], { stdio: ['ignore', 'inherit', 'inherit'] })
  console.log(`3. npm: acryl@${version} published as latest`)

  // 4. Tag.
  run('git', ['tag', '-a', tag, head, '-m', `acryl ${version}`])
  run('git', ['push', 'origin', `refs/tags/${tag}`])
  console.log(`4. tag ${tag} pushed`)

  // 5. GitHub release.
  run('gh', ['release', 'create', tag, join(out, tarball), '--repo', REPO, '--verify-tag', '--latest', '--title', `ACRYL ${version}`, '--notes-file', notes], { stdio: ['ignore', 'inherit', 'inherit'] })
  console.log(`5. GitHub release ${tag} is Latest`)

  // 6. The same on both (npm's metadata can take a minute to show the new latest).
  for (let attempt = 1; attempt <= 12; attempt++) {
    if (compare()) process.exit(0)
    execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'])
  }
  stop('npm latest and the GitHub Latest release still differ after two minutes: look at both before anything else')
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
