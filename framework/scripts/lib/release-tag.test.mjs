import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { releaseOfTag } from '../release-tag.mjs'

const framework = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const versionOf = (dir) =>
  JSON.parse(readFileSync(join(framework, dir, 'package.json'), 'utf8')).version
const frame = JSON.parse(readFileSync(join(framework, 'frame', 'packages.json'), 'utf8'))

test('the CLI and the scaffolder tags name their package, folder and tarball', () => {
  const cli = versionOf('packages/cli')
  assert.deepEqual(releaseOfTag(`acrylblends-v${cli}`), {
    kind: 'npm',
    package: 'acrylblends',
    version: cli,
    dir: join(framework, 'packages', 'cli'),
    tarball: `acrylblends-${cli}.tgz`,
  })
  const create = versionOf('packages/create')
  assert.equal(
    releaseOfTag(`create-acrylblends-v${create}`).tarball,
    `create-acrylblends-${create}.tgz`,
  )
})

test('a frame tag names the scoped package from frame/packages.json, and its tarball as npm names it', () => {
  const [key, entry] = Object.entries(frame.packages)[0]
  const release = releaseOfTag(`frame-${entry.name}-v${entry.version}`)
  assert.equal(release.kind, 'frame')
  assert.equal(release.package, `${frame.scope}/${entry.name}`)
  assert.equal(release.tarball, `${frame.scope.slice(1)}-${entry.name}-${entry.version}.tgz`)
  assert.ok(release.dir.endsWith(key))
})

test("the launcher tag names @acryl/launcher in ACRYL's plugins/acryl-launcher", () => {
  const dir = join(framework, '..', 'plugins', 'acryl-launcher')
  const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
  assert.deepEqual(releaseOfTag(`launcher-v${version}`), {
    kind: 'npm',
    package: '@acryl/launcher',
    version,
    dir,
    tarball: `acryl-launcher-${version}.tgz`,
  })
})

test('a tag whose version is not the one in the source is refused', () => {
  assert.throws(() => releaseOfTag('acrylblends-v0.0.1'), /the source holds/u)
  const entry = Object.values(frame.packages)[0]
  assert.throws(() => releaseOfTag(`frame-${entry.name}-v99.0.0`), /frame\/packages\.json holds/u)
})

test("anything else is not a framework release: acryl's own v* tags, unknown frame packages", () => {
  assert.throws(() => releaseOfTag('v0.3.0'), /not a framework release tag/u)
  assert.throws(() => releaseOfTag('desktop-v0.1.0'), /not a framework release tag/u)
  assert.throws(() => releaseOfTag('frame-nothing-v1.0.0'), /does not list/u)
})
