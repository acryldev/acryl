# Changing how ACRYL looks: what you can change, on which surface, and how live

Read this first for any request about colors, fonts, branding, logo, layout, "look and feel" or "restyle". Then open the doc
in the last column. All facts here were checked against the source and, where marked, in a running app.

## The three surfaces

- **Web** and **Desktop** render the SAME browser app (React). A client plugin (`client.js`, no build step) changes both
  identically. Desktop wraps that app in an Electron shell (window chrome, icon, menu) that a plugin cannot change.
- **CLI** is a terminal app (pi-tui). Its look is compiled in; a plugin can add its own themed overlays but cannot restyle the
  built-in screens.

## What to change, where, and whether it is live

| I want to change | Web | Desktop | CLI | Live? | Read |
| --- | --- | --- | --- | --- | --- |
| Colors, surfaces, borders, accent | `ctx.theme.overrideTokens` (client) | same | not pluggable (compiled palette in `tui/theme.ts`) | reload page or window | `ui-theme.md`, `../maps/theme-tokens.md` |
| Fonts, text size | `--dsw-font-family` token, `ctx.theme.setFontSize` | same | terminal font is the user's terminal setting | reload | `ui-theme.md` |
| A whole named theme (user picks it) | `ctx.theme.register` | same | no | reload | `ui-theme.md` |
| Logo, brand name in sidebar and hero | client slots `sidebar.brand.mark` / `.name`, `conversation.hero.brand.mark` (single occupant: swap the brand package row) | same | wordmark and banner are source files (`acrylMark.ts`, `bannerText.ts`) | reload / rebuild | `ui-branding.md` |
| Browser tab title, favicon, page background before boot | host: `webserver/index-inject` rows and `tapIndex` | the window title is native (see below) | none | reload | `ui-branding.md` |
| Add a button, panel, tab, card | client slots, built from the shared components | same | a `tuiCommands` overlay built from pi-tui components | reload / restart TUI | `ui-components.md`, `client-slot.md`, `tui-components.md`, `../maps/mount-points.md` |
| Layout (sidebar, columns, main view) | slots (`sidebar`, `rightbar`, `conversation.view`) | plus the `desktop.main` frame slot | none | reload | `../maps/mount-points.md` |
| Window chrome, title bar, vibrancy, app icon, tray, native menu, installer name | no | Electron main process: source edit and rebuild | no | NOT live (rebuild) | `desktop-app.md` |
| Terminal palette, banner, mascot, built-in overlays | no | no | source edit and rebuild | NOT live (rebuild) | `tui-components.md` |

"Reload" means the user reloads the Web page or the Desktop window (Cmd/Ctrl+R). "Rebuild" means editing the ACRYL source
repository and rebuilding: only possible when you are working inside that repository; an installed app cannot be changed
that way, so say so and offer the live alternative.

## Rules for restyling

1. Prefer a token override over CSS: it survives upstream changes and respects light and dark mode. Provide BOTH modes.
2. Never edit files inside `node_modules`, the harness, or the packaged app: they are overwritten and not yours.
3. Keep the change in ONE plugin under `<workspace>/.acryl-extensions/<name>/` so it can be updated or removed as a unit.
4. Check contrast: text on the new background must stay readable in both modes.
5. After installing, ask the user to reload and look; you cannot see the screen. State what you changed and what you could
   not verify.
6. Known limit: some visible text ("Internal Testing Notice", some settings copy) is upstream locale text in
   single-occupant dictionaries. A plugin cannot replace it; do not promise to.
7. Never promise to change the CLI's built-in colors or the Desktop window chrome from a plugin. Say what is possible instead.
