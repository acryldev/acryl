import { readdirSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Source maps are release-debug artifacts, not runtime dependencies. */
export function shouldPruneReleasePath(path) {
  return path.endsWith('.map')
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/** Remove release-only source maps and return normalized removed paths. */
export function pruneReleasePayload(root) {
  const removed = []
  for (const path of walk(root)) {
    const artifactPath = relative(root, path).replaceAll(sep, '/')
    if (!shouldPruneReleasePath(artifactPath)) continue
    rmSync(path, { force: true })
    removed.push(artifactPath)
  }
  return removed.sort()
}

if (import.meta.main) {
  const root = process.argv[2]
  if (root === undefined) {
    console.error('usage: node scripts/prune-release-payload.mjs <root>')
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(pruneReleasePayload(root), null, 2))
  }
}
