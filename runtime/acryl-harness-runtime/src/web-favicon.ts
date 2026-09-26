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
