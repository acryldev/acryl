/** The launcher's two looks (spec 050 D12): ACRYL ADE's fonts and shapes, or acryl.dev's. Pure helpers: the choice, where it is remembered, and light or dark. */

export type Skin = 'ade' | 'site'
export const SKINS: readonly Skin[] = ['ade', 'site']
export const SKIN_LABEL: Readonly<Record<Skin, string>> = { ade: 'ACRYL ADE', site: 'acryl.dev' }
export const SKIN_NOTE: Readonly<Record<Skin, string>> = {
  ade: "the IDE's system fonts, round pill buttons, quiet surfaces",
  site: "the website's Space Grotesk and JetBrains Mono, square corners, 1px lines and the grid",
}
export const SKIN_KEY = 'acryl-launcher-skin'

type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>

/** The remembered skin, else ACRYL ADE's. Storage may be missing or throw (a private window): the default then. */
export function readSkin(storage?: Reader): Skin {
  try {
    const value = (storage ?? globalThis.localStorage).getItem(SKIN_KEY)
    return SKINS.find(skin => skin === value) ?? 'ade'
  } catch {
    return 'ade'
  }
}

export function saveSkin(skin: Skin, storage?: Writer): void {
  try { (storage ?? globalThis.localStorage).setItem(SKIN_KEY, skin) } catch { /* not remembered: the screen still shows the choice */ }
}

/**
 * Whether a CSS color (`#151517`, `#fff`, `rgb(21, 21, 23)`) is dark; undefined when it cannot be read. The page's own theme decides the site skin's
 * palette, so the screen asks the theme token's value rather than guessing from the system.
 */
export function isDarkColor(color: string | undefined): boolean | undefined {
  if (color === undefined) return undefined
  const text = color.trim()
  let channels: number[] | undefined
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(text)?.[1]
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
    channels = [0, 2, 4].map(at => Number.parseInt(full.slice(at, at + 2), 16))
  } else {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/iu.exec(text)
    if (rgb !== null) channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }
  if (channels === undefined) return undefined
  const [red = 0, green = 0, blue = 0] = channels
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 128
}

export const RAIL_KEY = 'acryl-launcher-nav-rail'

/** Whether the sidebar is collapsed to its narrow rail (remembered); expanded when nothing is remembered or storage is unavailable. */
export function readRail(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? globalThis.localStorage).getItem(RAIL_KEY) === '1' } catch { return false }
}

export function saveRail(rail: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? globalThis.localStorage).setItem(RAIL_KEY, rail ? '1' : '0') } catch { /* not remembered */ }
}
