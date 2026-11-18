/**
 * The frame's packages as a published release would present them: every package in the closure of the frame's rows, as `file:` specs pointing at this
 * checkout, so `npm install` puts them (and their workspace dependencies, which npm does not resolve from `workspace:*`) into the app's node_modules.
 * Shared by the profile gate (`scripts/verify-ide-profile.mjs`) and the per-template gate (`scripts/verify-ide-template.mjs`).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRAME_PACKAGES } from '../../packages/cli/src/ide-profile.ts'

/** The package folders under `ide/`, by package name. Throws when one is not built (the gate's `pnpm run build` builds them first). */
export function frameSpecs(root) {
  const folders = new Map()
  for (const name of readdirSync(join(root, 'ide'))) {
    const folder = join(root, 'ide', name)
    const manifest = join(folder, 'package.json')
    if (!existsSync(manifest)) continue
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (!existsSync(join(folder, 'lib')))
      throw new Error(`${parsed.name} is not built; run pnpm run build first`)
    folders.set(parsed.name, folder)
  }
  const closure = []
  const seen = new Set()
  const need = (name) => {
    if (seen.has(name) || !folders.has(name)) return
    seen.add(name)
    const parsed = JSON.parse(readFileSync(join(folders.get(name), 'package.json'), 'utf8'))
    for (const field of ['dependencies', 'peerDependencies'])
      for (const [dependency, range] of Object.entries(parsed[field] ?? {}))
        if (String(range).startsWith('workspace:')) need(dependency)
    closure.push(name)
  }
  for (const entry of FRAME_PACKAGES) if (entry.installed !== true) need(entry.name)
  return Object.fromEntries(closure.map((name) => [name, `file:${folders.get(name)}`]))
}

/**
 * The framework as the checkout's frame packages see it: `packages/cli` of the same checkout. A `file:` package is installed as a link, so it resolves its
 * `acrylblends` peer from its real folder, here; the app has to install that same folder, or the host serves the frame's routes on one copy of the
 * framework while their middleware runs on another (a request the second copy did not make has no match result: a wrong method on a private route was a
 * 500 instead of 405). A published release dedupes the peer by itself.
 */
export function frameworkSpec(root) {
  return `file:${join(root, 'packages', 'cli')}`
}

/** `ACRYLBLENDS_FRAME_PACKAGES`, the scaffold gate's bridge while the ide packages are unpublished: what the CLI writes into a template's profile. */
export function frameSpecsEnv(root, { dshVersion }) {
  return JSON.stringify({
    dshVersion,
    frameworkVersion: frameworkSpec(root),
    packages: frameSpecs(root),
  })
}
