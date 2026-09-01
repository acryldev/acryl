import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { validateReceipt } from './release-contract.mjs'

/** Convert a portable artifact path pattern to a RegExp without adding a glob dependency. */
function patternRegExp(pattern) {
  const escaped = pattern
    .replaceAll(/[[\]{}()+^$.|]/gu, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

function matches(path, patterns) {
  return patterns.some(pattern => patternRegExp(pattern).test(path))
}

/**
 * Verify a release artifact inventory against its explicit contract.
 * Native prebuild/module paths are checked separately so a target artifact
 * cannot quietly acquire another platform's executable payload.
 */
export function verifyArtifactManifest(manifest, inventory) {
  if (manifest.receipt) {
    if (!inventory.receipt) throw new Error(`artifact ${manifest.product}/${manifest.platform}-${manifest.arch} is missing its receipt`)
    validateReceipt(inventory.receipt, manifest.receipt)
  }
  const paths = [...new Set(inventory.paths)].sort()
  const present = new Set(paths)
  const missing = manifest.requiredPaths.filter(path => !present.has(path))
  if (missing.length > 0) {
    throw new Error(`artifact ${manifest.product}/${manifest.platform}-${manifest.arch} is missing required paths: ${missing.join(', ')}`)
  }

  const forbidden = paths.filter(path => matches(path, manifest.forbiddenPathPatterns))
  if (forbidden.length > 0) {
    throw new Error(`artifact ${manifest.product}/${manifest.platform}-${manifest.arch} contains forbidden paths: ${forbidden.join(', ')}`)
  }

  const nativePaths = paths.filter(path => (
    path.includes('/prebuilds/')
    || path.endsWith('.node')
    || path.endsWith('.dylib')
    || path.endsWith('.dll')
    || path.endsWith('.exe')
  ))
  const foreignNative = nativePaths.filter(path => !matches(path, manifest.allowedNativePackagePatterns))
  if (foreignNative.length > 0) {
    throw new Error(`artifact ${manifest.product}/${manifest.platform}-${manifest.arch} contains foreign native paths: ${foreignNative.join(', ')}`)
  }

  if (inventory.bytes > manifest.maximumBytes) {
    throw new Error(`artifact ${manifest.product}/${manifest.platform}-${manifest.arch} exceeds byte budget: ${String(inventory.bytes)} > ${String(manifest.maximumBytes)}`)
  }
}

/** Build a portable relative-path inventory for a directory artifact. */
export function inspectDirectory(root, readDirectory) {
  const paths = []
  let bytes = 0
  for (const entry of readDirectory(root)) {
    const path = entry.path.replaceAll(sep, '/')
    paths.push(path)
    bytes += entry.bytes
  }
  return { paths, bytes }
}

function defaultDirectoryEntries(root) {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) return walk(absolute)
    if (!entry.isFile()) return []
    return [{ path: relative(root, absolute), bytes: statSync(absolute).size }]
  })
  return walk(root)
}

if (import.meta.main) {
  const root = process.argv[2]
  if (root === undefined) {
    console.error('usage: node scripts/inspect-artifact.mjs <directory>')
    process.exitCode = 1
  } else {
    const inventory = inspectDirectory(root, defaultDirectoryEntries)
    console.log(JSON.stringify(inventory, null, 2))
  }
}
