// Example: web-page-branding.basic
// Type:     host-route (web server index transform)
// Surfaces: web desktop (the CLI has no web server: the row stays ACTIVE and does nothing)
// Teaches:  change what the browser shows around the app: the tab TITLE, the FAVICON, and page-level CSS, from the HOST,
//           with the web server's two index seams. (1) `ctx.on('webserver/index-inject', table => table.push(row))` adds
//           STRUCTURED rows: { kind: 'style', text } (a <style> in <head>), { kind: 'html', placement: 'head', html }
//           (raw markup such as a <link rel="icon">), { kind: 'global', name, value }, { kind: 'script'|'script-src' }.
//           (2) `webServer.tapIndex(html => html)` is the raw-HTML escape hatch (used here for the <title>); it runs
//           after the rows. Register both inside effects so they leave with the plugin. Reload the page to see them.
//           The favicon here is an inline SVG data URL (no file to serve). Everything is optional: read `webServer`
//           at call time, never assume it exists.
// Expect:   the served index.html gets <title>My Studio</title>, a favicon link and a style row.
// Docs:     extending.ui-branding
// Pattern:  apps/acryl-web (tapIndex sets <title>ACRYL</title>), deepseek-harness/packages/host/webserver/src/injections.ts
export const name = 'acryl-example-page-branding'

const TITLE = 'My Studio'
const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#e8590c"/><text x="16" y="22" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">S</text></svg>')

export function apply(ctx) {
  ctx.effect(() => ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'html', placement: 'head', html: `<link rel="icon" type="image/svg+xml" href="${FAVICON}">` })
    // Page-level CSS that exists before the app boots (avoids a flash of the default background).
    table.push({ kind: 'style', text: 'html,body{background:#1a1410}' })
  }), 'acryl-example-page-branding: index rows')
  const server = ctx.get('webServer')
  if (server) {
    ctx.effect(() => server.tapIndex(html => html.replace(/<title>[^<]*<\/title>/iu, `<title>${TITLE}</title>`)), 'acryl-example-page-branding: title')
  }
}
