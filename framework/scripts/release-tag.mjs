#!/usr/bin/env node
/**
 * What a framework release tag publishes (spec 051 T032), read by .github/workflows/framework-release.yml:
 *   acrylblends-v<version>         acrylblends, framework/packages/cli
 *   create-acrylblends-v<version>  create-acrylblends, framework/packages/create
 *   frame-<short>-v<version>       <scope>/<short>, the frame package framework/frame/packages.json names
 *   launcher-v<version>            @acryldev/control-center, ACRYL's plugins/acryl-launcher
 * The version must be the one the source holds, so a tag can never publish something other than what is checked in.
 *
 *   node framework/scripts/release-tag.mjs <tag>    prints kind=, package=, version=, dir=, tarball= lines (GitHub step outputs)
 */
import { readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameFolders } from './lib/frame-folders.mjs'

const framework = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** The release a tag names, checked against the source; throws with the reason when it names none or the versions differ. */
export function releaseOfTag(tag, root = framework) {
  const versionOf = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
  const expect = (release, held) => {
    if (held !== release.version)
      throw new Error(
        `the tag ${tag} names ${release.package} ${release.version}, but the source holds ${String(held)}`,
      )
    return release
  }
  // npm's tarball name: the scope's @ dropped and its slash a dash (@acrylblends/app-shell 0.1.1 -> acrylblends-app-shell-0.1.1.tgz).
  const tarball = (name, version) => `${name.replace(/^@/u, '').replace('/', '-')}-${version}.tgz`
  let match = /^create-acrylblends-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/u.exec(tag)
  if (match !== null) {
    const dir = join(root, 'packages', 'create')
    return expect(
      {
        kind: 'npm',
        package: 'create-acrylblends',
        version: match[1],
        dir,
        tarball: tarball('create-acrylblends', match[1]),
      },
      versionOf(dir),
    )
  }
  match = /^acrylblends-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/u.exec(tag)
  if (match !== null) {
    const dir = join(root, 'packages', 'cli')
    return expect(
      {
        kind: 'npm',
        package: 'acrylblends',
        version: match[1],
        dir,
        tarball: tarball('acrylblends', match[1]),
      },
      versionOf(dir),
    )
  }
  // The launcher's journeys (ACRYL's plugins/acryl-launcher, spec 051 T010): Control Center installs it instead of a hand copy.
  match = /^launcher-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/u.exec(tag)
  if (match !== null) {
    const dir = join(root, '..', 'plugins', 'acryl-launcher')
    return expect(
      {
        kind: 'npm',
        package: '@acryldev/control-center',
        version: match[1],
        dir,
        tarball: tarball('@acryldev/control-center', match[1]),
      },
      versionOf(dir),
    )
  }
  match = /^frame-([a-z0-9-]+)-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/u.exec(tag)
  if (match !== null) {
    const [, short, version] = match
    const config = JSON.parse(readFileSync(join(root, 'frame', 'packages.json'), 'utf8'))
    const key = Object.keys(config.packages).find(
      (folder) => config.packages[folder].name === short,
    )
    if (key === undefined)
      throw new Error(`the tag ${tag} names ${short}, which frame/packages.json does not list`)
    const name = `${config.scope}/${short}`
    const dir = frameFolders(root).get(key)
    if (config.packages[key].version !== version)
      throw new Error(
        `the tag ${tag} names ${name} ${version}, but frame/packages.json holds ${String(config.packages[key].version)}`,
      )
    return expect(
      { kind: 'frame', package: name, version, dir, tarball: tarball(name, version) },
      versionOf(dir),
    )
  }
  throw new Error(
    `${tag} is not a framework release tag (acrylblends-v<version>, create-acrylblends-v<version>, frame-<short>-v<version> or launcher-v<version>)`,
  )
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const release = releaseOfTag(process.argv[2] ?? '')
    const repo = resolve(framework, '..')
    for (const [key, value] of Object.entries({ ...release, dir: relative(repo, release.dir) }))
      console.log(`${key}=${value}`)
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause))
    process.exit(1)
  }
}
