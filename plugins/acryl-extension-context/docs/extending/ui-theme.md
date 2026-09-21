# Theme, colors and fonts for Web and Desktop (the client `theme` service)

Working example, copy from it: `../example-plugins/packages/client-theme-override/` (`client.js` and `index.js`). Verified in a real
browser: the accent color, the font, the tab title and the page background all changed.
Token names: `../maps/theme-tokens.md` (generated, every `--dsw-alias-*` with light and dark values).

## How theming works

The app styles read CSS custom properties: `--dsw-alias-*` design tokens (backgrounds, borders, brand, buttons, labels, states),
`--dsw-font-family`, corner and shadow tokens. Two built-in themes exist, `light` and `dark`; the user's preference (`light`,
`dark` or `system`) picks one. The client `theme` service (`ctx.theme`) lets a plugin change tokens without a stylesheet. The
same service and presenter run on Web and Desktop, so the code is identical.

## The API (inside `client.js`, `exports.inject = ['theme']`)

```js
exports.inject = ['theme']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.theme.overrideTokens('my-plugin-id', {
    '--dsw-alias-brand-primary': { light: '#e8590c', dark: '#ff922b' },   // BOTH modes are mandatory
    '--dsw-font-family': { light: "Georgia, serif", dark: "Georgia, serif" },
  }), 'my-plugin: token layer')
}
```

- `ctx.theme.overrideTokens(sourceId, { token: { light, dark } })` stacks a layer over the active theme and returns a disposer.
  One layer per `sourceId`: calling again replaces it. A bare string value throws a teaching error. Later layers win per token.
- `ctx.theme.register({ id, colorScheme: 'light' | 'dark', tokens: { '--token': 'value' } })` adds a selectable theme. Duplicate ids
  throw. Selecting it (`ctx.theme.setTheme(id)`) changes the user's SAVED preference: only do that if they asked.
- `ctx.theme.setFontSize(px)` changes conversation text size (integer, within the allowed range) and is also a saved preference.
- `ctx.theme.getTheme()` returns the current snapshot (`preference`, `fontSize`, `active`, `themes`); the `theme/change` event
  fires on every change. `ctx.theme.exportInspectTokens()` lists the documented tokens.
- Register inside `ctx.effect` so the layer is removed when the plugin is removed or updated, restoring the base theme.

## Fonts

- Override `--dsw-font-family` with a CSS font-family list. System fonts need nothing else.
- A web font: add an `@font-face` `<style>` (from `client.js` with `document.head.appendChild`, or a host `webserver/index-inject`
  `style` row, see `ui-branding.md`) and reference its family in the token. Use a locally bundled file or a font the user
  provided; do not hotlink third-party fonts without saying so (privacy and offline use).
- Code and monospace text use their own tokens; check `../maps/theme-tokens.md` for the exact name before overriding.
- Content size: `ctx.theme.setFontSize`; the conversation scales from `--dsh-content-font-size`.

## What this cannot do

- Rewrite component layout or markup (use slots, `../maps/mount-points.md`).
- Change the CLI (no theme service in the terminal; `tui-components.md`).
- Change Desktop window chrome (`desktop-app.md`).
- Replace upstream locale text (`ui-customization.md`, rule 6).

## Verify

Install with `acryl_install_plugin`, ask the user to reload, and have them check both light and dark. Add
`console.info('[<name>] ...')` at load and apply: the browser console shows whether the layer registered (the example does).
Reference: `reference/subsystems/client-modules.md`, `reference/subsystems/slots.md`; the service source is the `ui-theme` package.
