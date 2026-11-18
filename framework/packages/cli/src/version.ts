import { createRequire } from 'node:module'

/** The version of this package. */
export const VERSION: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version

/** Semver order for the release versions (numeric segments; a pre-release sorts before its release). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  const pb = b.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}
