/**
 * acryl-brand (host half): a configurable product identity. Set the name, tagline, mark, accent, dark accent and font in
 * this row's `config` (a Blend's YAML, a profile patch, or an ACRYL_BRAND_* value the runtime turns into this config) and
 * the Web and Desktop app wears it: sidebar name and mark, conversation hero, tab or window title, favicon, accent color.
 * Disabling the row restores the stock look; nothing else is touched. The browser half is ./client.js.
 *
 * Provides: `acrylBrand` ({ identity }). Optional: `webServer` and its `tapIndex` seam (absent on the CLI, and on servers that do not rewrite the index).
 */
import Schema from '@deepseek-ai/schemastery'
import { escapeHtml, faviconDataUrl, parseIdentity } from './lib/identity.js'

export const name = 'acryl-brand'

export const Config = Schema.object({
  name: Schema.string().required().description('Product name.'),
  tagline: Schema.string().description('One line under the name on the empty conversation.'),
  accent: Schema.string().description('Accent color, #rrggbb.'),
  accentDark: Schema.string().description('Accent color in dark mode, #rrggbb (defaults to accent).'),
  fontFamily: Schema.string().description('CSS font-family list for the whole app.'),
  mark: Schema.string().description('One to three characters drawn as the logo (defaults to the first letter of the name).'),
})

export function apply(ctx, config) {
  const identity = parseIdentity(config)
  ctx.provide('acrylBrand', { identity })
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    // The client half reads this global; the favicon avoids a flash of the stock look.
    table.push({ kind: 'global', name: '__ACRYL_BRAND__', value: identity })
    table.push({ kind: 'html', placement: 'head', html: `<link rel="icon" type="image/svg+xml" href="${faviconDataUrl(identity)}">` })
  }), 'acryl-brand: index rows')
  const server = ctx.get('webServer')
  // Desktop's own web server (and test doubles) may serve the page without the index seam: there is no HTML to rewrite there, and the
  // native window title is set by the main process, so the tap is optional the same way the service is.
  if (typeof server?.tapIndex === 'function') {
    ctx.effect(() => server.tapIndex(html => html.replace(/<title>[^<]*<\/title>/iu, () => `<title>${escapeHtml(identity.name)}</title>`)), 'acryl-brand: title')
  }
}
