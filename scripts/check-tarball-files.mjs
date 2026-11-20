#!/usr/bin/env node
// Every tarball given must hold each entry its package.json "files" names (a folder, a file, or the fixed folder before a glob such as lib/**).
// A pack that skipped its prepack step (npm/pnpm pack --ignore-scripts) shipped @acryldev/blends 1.7.1 without docs/ and plugins/ and
// @acryldev/desktop-shell 0.1.1 without lib/watch-host.mjs; nothing checked. Usage: node scripts/check-tarball-files.mjs <a.tgz> [...]
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** The fixed part of a "files" entry that must exist in the tarball, or undefined for a negation or a pattern with no fixed folder. */
export function requiredPrefix(entry) {
  if (entry.startsWith('!')) return undefined
  const fixed = entry.replace(/^\.\//, '').split('/').filter((part) => !/[*?[\]{}]/.test(part))
  const cut = entry.replace(/^\.\//, '').split('/').findIndex((part) => /[*?[\]{}]/.test(part))
  const parts = cut === -1 ? fixed : fixed.slice(0, cut)
  return parts.length === 0 ? undefined : parts.join('/')
}

/** The "files" entries missing from a tarball's listing (paths without the leading package/). */
export function missingEntries(files, listing) {
  return files.flatMap((entry) => {
    const need = requiredPrefix(entry)
    if (need === undefined) return []
    return listing.some((path) => path === need || path.startsWith(`${need}/`)) ? [] : [entry]
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let failed = false
  for (const tgz of process.argv.slice(2)) {
    const listing = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((path) => path.replace(/^[^/]+\//, ''))
    const manifest = JSON.parse(execFileSync('tar', ['-xzOf', tgz, 'package/package.json'], { encoding: 'utf8' }))
    const missing = missingEntries(manifest.files ?? [], listing)
    if (missing.length > 0) {
      failed = true
      console.error(`${tgz}: ${manifest.name}@${manifest.version} lacks ${missing.join(', ')} (packed without its prepack step?)`)
    } else console.log(`ok ${manifest.name}@${manifest.version} (${listing.length} files)`)
  }
  process.exit(failed ? 1 : 0)
}
