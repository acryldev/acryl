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

/**
 * blend.yaml's text with `metadata.<key>` set to `value` (added under `metadata:` when missing), the rest of the text untouched. Without a `metadata:`
 * block the text is returned as it is.
 */
function withMetadataField(text, key, value) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^metadata:\s*(#.*)?$/u.test(line))
  if (start === -1) return text
  let end = lines.findIndex((line, index) => index > start && /^\S/u.test(line))
  if (end === -1) end = lines.length
  const at = lines.findIndex(
    (line, index) => index > start && index < end && new RegExp(`^\\s+${key}:`, 'u').test(line),
  )
  const indent =
    lines
      .slice(start + 1, end)
      .find((line) => /^\s+\S/u.test(line))
      ?.match(/^\s+/u)?.[0] ?? '  '
  if (at === -1) lines.splice(start + 1, 0, `${indent}${key}: ${value}`)
  else lines[at] = `${lines[at].match(/^\s+/u)[0]}${key}: ${value}`
  return lines.join('\n')
}

/**
 * blend.yaml's text with `metadata.version` set to `version`. The packed copy carries the version the OS shows, so the frame's top bar, the About
 * window and Installed apps name the same one.
 */
export const withManifestVersion = (text, version) => withMetadataField(text, 'version', version)

/**
 * blend.yaml's text with `metadata.name` set to the product's name, as a JSON string (a name may hold a colon or a quote). The packed copy is the
 * scaffold's, named for its folder (`blend`); the instance names an app by this field, so the window's title, the About panel and the Dock say the
 * product ("ACRYL Control Center").
 */
export const withManifestName = (text, name) =>
  withMetadataField(text, 'name', JSON.stringify(name))
