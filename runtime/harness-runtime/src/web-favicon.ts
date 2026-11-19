/**
 * The ACRYL tab icons for the Web surface: the smooth black-on-white logo in the sizes browsers ask for
 * (ICO, 16, 32 and the Apple touch icon), inlined as data URLs so serving them needs no route and no file
 * next to the bundle. Sources live in `assets/brand/favicon/`; `scripts/generate-web-favicon.mjs` regenerates the data.
 */

import { APPLE_TOUCH_ICON_BASE64, FAVICON_16_BASE64, FAVICON_32_BASE64, FAVICON_ICO_BASE64 } from './web-favicon-data.ts'

/** The `<link>` tags that replace the pinned frontend's DeepSeek icon links. */
export const WEB_FAVICON_LINKS = [
  `<link rel="icon" href="data:image/x-icon;base64,${FAVICON_ICO_BASE64}" sizes="any">`,
  `<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${FAVICON_32_BASE64}">`,
  `<link rel="icon" type="image/png" sizes="16x16" href="data:image/png;base64,${FAVICON_16_BASE64}">`,
  `<link rel="apple-touch-icon" sizes="180x180" href="data:image/png;base64,${APPLE_TOUCH_ICON_BASE64}">`,
].join('')

const ICON_LINK = /<link\b[^>]*\brel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>\s*/gi

/** @param html - the served index; drops any existing icon links, then adds ACRYL's before `</head>`. */
export function applyWebFavicon(html: string): string {
  return html.replace(ICON_LINK, '').replace(/<\/head>/i, `${WEB_FAVICON_LINKS}</head>`)
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/gu, character => `&#${String(character.charCodeAt(0))};`)

/** What the served page needs to know about its brand. */
export interface WebIndexBrand {
  /** The product name the page title carries; `ACRYL` when absent. */
  readonly productName?: string
  /** The stock ACRYL brand (not a Blueprint's own): it wears the ACRYL icon. A custom brand ships its own icon (acryl-brand). */
  readonly stockBrand?: boolean
}

/**
 * @param html - the served index of the pinned frontend.
 * @param brand - whose page this is.
 * @returns the index with the brand's title, and for the stock ACRYL brand the ACRYL icon in place of DeepSeek's. A composition that names neither
 * a product nor a brand kind is the stock one.
 */
export function brandWebIndex(html: string, brand: WebIndexBrand): string {
  const titled = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeHtml(brand.productName ?? 'ACRYL')}</title>`)
  return brand.stockBrand === true || (brand.productName === undefined && brand.stockBrand === undefined) ? applyWebFavicon(titled) : titled
}
