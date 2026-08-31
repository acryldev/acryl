import { readdirSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export type NativePlatform = 'darwin' | 'linux' | 'win32'
export type NativeArch = 'arm64' | 'x64' | 'universal'

export type PackagedNativePruner = (
  root: string,
  platform: NativePlatform,
  arch: NativeArch,
) => readonly string[]

function targetOf(path: string): { readonly platform: NativePlatform; readonly arch: Exclude<NativeArch, 'universal'> } | undefined {
  const match = /(?:^|[^a-z0-9])(darwin|linux|win32)-(arm64|x64)(?:$|[^a-z0-9])/u.exec(path)
  if (match === null) return undefined
  return { platform: match[1] as NativePlatform, arch: match[2] as Exclude<NativeArch, 'universal'> }
}

/**
 * True when a packed entry path carries a native target other than the package
 * target. This is the single source of truth shared by the payload pruner and
 * the packaged-runtime verifier, so pruning and verification agree on which
 * target-foreign native payloads are intentionally absent from app.asar.unpacked.
 */
export function nativePathIsForeign(
  path: string,
  platform: NativePlatform,
  arch: NativeArch,
): boolean {
  const target = targetOf(path)
  if (target === undefined) return false
  return target.platform !== platform || (arch !== 'universal' && target.arch !== arch)
}

function walk(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? [path, ...walk(path)] : [path]
  })
}

/** Remove foreign target-qualified paths while retaining a universal macOS pair. */
export const prunePackagedNativeTree: PackagedNativePruner = (root, platform, arch) => {
  const roots: string[] = []
  for (const path of [...walk(root)].sort((left, right) => right.length - left.length)) {
    const target = targetOf(relative(root, path).replaceAll(sep, '/'))
    if (target === undefined || target.platform === platform && (arch === 'universal' || target.arch === arch)) continue
    if (roots.some(parent => path === parent || path.startsWith(`${parent}${sep}`))) continue
    rmSync(path, { recursive: true, force: true })
    roots.push(path)
  }
  return roots.map(path => relative(root, path).replaceAll(sep, '/')).sort()
}

/** Prune foreign native payload from Electron Builder's unpacked tree. */
export function prunePackagedNative(
  unpackedRoot: string,
  platform: string,
  electronBuilderArch: number | undefined,
  prune: PackagedNativePruner = prunePackagedNativeTree,
): readonly string[] {
  if (electronBuilderArch === 4) {
    if (platform !== 'darwin') throw new Error('universal package is supported only on macOS')
    return prune(unpackedRoot, 'darwin', 'universal')
  }
  if (electronBuilderArch === 3) {
    if (platform !== 'darwin' && platform !== 'linux') throw new Error(`unsupported ARM64 platform ${platform}`)
    return prune(unpackedRoot, platform, 'arm64')
  }
  if (electronBuilderArch === 1) {
    if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') throw new Error(`unsupported x64 platform ${platform}`)
    return prune(unpackedRoot, platform, 'x64')
  }
  throw new Error(`unsupported Electron Builder architecture ${String(electronBuilderArch)}`)
}
