// Semantic versions, only as far as the hub needs them: validating a version, ordering versions to find the newest, and bumping one for a fix.

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

export interface Version {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
  readonly text: string
}

export function parseVersion(text: string): Version | undefined {
  const match = SEMVER.exec(text.trim())
  if (match === null) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
    text: text.trim(),
  }
}

function compareIdentifiers(a: string, b: string): number {
  const numeric = /^\d+$/u
  if (numeric.test(a) && numeric.test(b)) return Number(a) - Number(b)
  if (numeric.test(a)) return -1
  if (numeric.test(b)) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Semver precedence: negative when `a` is older than `b`. Build metadata is ignored, as semver says. */
export function compareVersions(a: Version, b: Version): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return b.prerelease.length - a.prerelease.length
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const left = a.prerelease[index]
    const right = b.prerelease[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const order = compareIdentifiers(left, right)
    if (order !== 0) return order
  }
  return 0
}

/** The newest of some version strings; ones that are not semver are ignored. */
export function newestVersion(texts: Iterable<string>): string | undefined {
  let newest: Version | undefined
  for (const text of texts) {
    const version = parseVersion(text)
    if (version !== undefined && (newest === undefined || compareVersions(version, newest) > 0)) newest = version
  }
  return newest?.text
}

export type VersionBump = 'patch' | 'minor' | 'major'

/** The next version for a fix (`patch`), a feature (`minor`) or a breaking change (`major`). A prerelease is released as itself on `patch`. */
export function bumpVersion(text: string, bump: VersionBump): string {
  const version = parseVersion(text)
  if (version === undefined) throw new Error(`${JSON.stringify(text)} is not a semantic version`)
  if (bump === 'major') return `${version.major + 1}.0.0`
  if (bump === 'minor') return `${version.major}.${version.minor + 1}.0`
  if (version.prerelease.length > 0) return `${version.major}.${version.minor}.${version.patch}`
  return `${version.major}.${version.minor}.${version.patch + 1}`
}
