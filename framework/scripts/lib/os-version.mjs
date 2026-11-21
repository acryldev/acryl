/**
 * The version a packed app carries (Info.plist, the Windows installer, Settings > Installed apps, and the About window's): the higher of its
 * package.json's, which a product's release sets to its tag (v0.2.8 -> 0.2.8), and its Blend's own, blend.yaml's `metadata.version`, which the person
 * raises as they change the app and package.json does not follow.
 */
const triple = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version ?? '')
  return match === null ? undefined : match.slice(1).map(Number)
}

/** The higher of two x.y.z versions; one that is not x.y.z loses, and a tie keeps package.json's. */
export function osVersion(packageVersion, blendVersion) {
  const a = triple(packageVersion)
  const b = triple(blendVersion)
  if (b === undefined) return packageVersion
  if (a === undefined) return blendVersion
  const at = a.findIndex((part, index) => part !== b[index])
  return at !== -1 && b[at] > a[at] ? blendVersion : packageVersion
}
