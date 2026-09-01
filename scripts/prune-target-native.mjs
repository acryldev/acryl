import { readdirSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const TARGETS = new Set(['darwin', 'linux', 'win32'])
const ARCHES = new Set(['arm64', 'x64', 'universal'])

function normalizedSegments(path) {
  return path.replaceAll(sep, '/').split('/').filter(Boolean)
}

function targetFromSegment(segment) {
  const match = /(?:^|[^a-z0-9])(darwin|linux|win32|win10)-(arm64|x64)(?:$|[^a-z0-9])/u.exec(segment)
  if (match === null) return undefined
  return { platform: match[1] === 'win10' ? 'win32' : match[1], arch: match[2] }
}

/** Return whether a known native package/prebuild path belongs to another target. */
export function shouldRemoveNativePath(path, platform, arch) {
  if (!TARGETS.has(platform) || !ARCHES.has(arch) || (arch === 'universal' && platform !== 'darwin')) {
    throw new Error(`unsupported native target ${platform}-${arch}`)
  }
  const segments = normalizedSegments(path)
  for (const segment of segments) {
    const target = targetFromSegment(segment)
    if (target !== undefined) return target.platform !== platform || (arch !== 'universal' && target.arch !== arch)
  }
  return false
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return [path, ...walk(path)]
    return [path]
  })
}

/**
 * Remove only known target-qualified native paths from a deployed runtime tree.
 * Generic packages and their JavaScript remain intact; a target's own native
 * binary is preserved. Return relative paths for release evidence and tests.
 */
export function pruneTargetNative(root, platform, arch) {
  const removed = []
  const entries = walk(root)
    .filter(path => shouldRemoveNativePath(relative(root, path), platform, arch))
    .sort((left, right) => right.length - left.length)
  const roots = []
  for (const path of entries) {
    if (roots.some(parent => path.startsWith(`${parent}${sep}`) || path === parent)) continue
    rmSync(path, { recursive: true, force: true })
    roots.push(path)
    removed.push(relative(root, path).replaceAll(sep, '/'))
  }
  return removed.sort()
}

if (import.meta.main) {
  const [root, platform, arch] = process.argv.slice(2)
  if (root === undefined || platform === undefined || arch === undefined) {
    console.error('usage: node scripts/prune-target-native.mjs <root> <darwin|linux|win32> <arm64|x64>')
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(pruneTargetNative(root, platform, arch), null, 2))
  }
}
