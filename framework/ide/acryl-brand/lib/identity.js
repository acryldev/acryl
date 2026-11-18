/**
 * The brand identity this plugin renders. Pure: no I/O. The plugin is independently replaceable, so it validates its own
 * config at its own boundary instead of importing the runtime's copy (dependencies point at services, not at each other).
 */
const HEX = /^#[0-9a-fA-F]{6}$/u

/** Turn a Loader row config into a safe identity. Throws with a message naming the bad field. */
export function parseIdentity(config) {
  const source = config ?? {}
  const text = (key, max) => {
    const value = source[key]
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'string' || value.length > max) throw new Error(`acryl-brand: "${key}" must be a string of at most ${max} characters`)
    return value.trim()
  }
  const color = key => {
    const value = text(key, 7)
    if (value !== undefined && !HEX.test(value)) throw new Error(`acryl-brand: "${key}" must be a #rrggbb color`)
    return value
  }
  const name = text('name', 40)
  if (name === undefined) throw new Error('acryl-brand: "name" is required')
  const accent = color('accent')
  return {
    name,
    tagline: text('tagline', 120),
    accent,
    accentDark: color('accentDark') ?? accent,
    fontFamily: text('fontFamily', 200),
    mark: text('mark', 3) ?? [...name][0].toUpperCase(),
  }
}

/** The inline SVG favicon for a mark: the accent-colored square with the mark text. */
export function faviconDataUrl(identity) {
  const fill = identity.accent ?? '#3b6ef5'
  const glyph = identity.mark.replace(/[<>&"']/gu, '')
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${fill}"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">${glyph}</text></svg>`)
}

export function escapeHtml(text) {
  return text.replace(/[&<>"']/gu, character => `&#${character.charCodeAt(0)};`)
}
