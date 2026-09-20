# Branding: logo, name, tab title, favicon, page shell

Working examples: `../examples/packages/web-page-branding/` (host: title, favicon, CSS row, verified against the real web server
in a test) and `../examples/packages/client-theme-override/` (client: keeps a custom tab title, recolors). ACRYL's own brand is
`plugins/dsh-client-ui-brand-acryl` in the repository (a reference, not something to edit from a plugin).

## Layers of branding, from most to least pluggable

1. **Brand slots (Web and Desktop client).** Three single-occupant slots hold the identity: `sidebar.brand.mark`,
   `sidebar.brand.name`, `conversation.hero.brand.mark` (see `../maps/mount-points.md`). ACRYL's brand package occupies them. A
   slot is single-occupant, so to show a different mark you must swap the brand package (the Loader row `ui-acryl` is disabled
   or replaced), not register a second occupant. That is a profile composition change: tell the user; do not do it silently.
2. **Colors and fonts.** `ui-theme.md`. The accent token is `--dsw-alias-brand-primary`.
3. **Page shell (host).** The web server assembles `index.html`. Two seams, both usable from a host plugin:
   - `ctx.on('webserver/index-inject', table => table.push(row))` with structured rows:
     `{ kind: 'style', text }`, `{ kind: 'html', placement: 'head' | 'body', html }` (a `<link rel="icon">`),
     `{ kind: 'global', name, value }`, `{ kind: 'script', placement, text }`, `{ kind: 'script-src', placement, src }`.
   - `ctx.get('webServer')?.tapIndex(html => html)` a raw transform that runs after the rows.
   Use them for the favicon, a pre-boot background (avoids a flash), and analytics-free tweaks. Reload the page to see them.
4. **The tab and window TITLE.** The served `<title>` is only the pre-boot title. Once the app starts, the client rewrites
   `document.title` from a locale string (`<session title> - <product>`) that a plugin cannot replace, overwriting the server's.
   Keep your name with a `MutationObserver` on `document.head` that rewrites the product name; ACRYL's brand plugin does this
   for "ACRYL" and the theme example does it for a custom name. The same code applies to the Desktop window title.
5. **Upstream copy.** Text such as the "Internal Testing Notice" is upstream locale text in single-occupant dictionaries; it
   cannot be replaced by a plugin.

## Desktop native branding (NOT a plugin change)

The app icon, tray icon, product name (`ACRYL`), app id, installer, title bar style, window vibrancy (macOS) or Mica (Windows),
and the native menu live in the Electron main process and the build configuration. They change only by editing the ACRYL source
and rebuilding. See `desktop-app.md` for the exact files. An agent inside an installed app cannot do this: say so.

## CLI branding (NOT a plugin change)

The terminal banner, the ACRYL wordmark (half-block art), the palette and the mascot are source files compiled into the CLI. See
`tui-components.md`. A plugin can only add its own overlays with its own palette.

## Checklist

- Ask what to brand (name, mark, colors, font, favicon) and for which surfaces; explain what is live and what needs a rebuild.
- Keep assets small and local (an inline SVG data URL for a favicon; a bundled file for a font or logo); do not fetch remote assets.
- Both light and dark mode; readable contrast.
- Reload, then have the user confirm the tab title, the accent, the favicon and the sidebar.
