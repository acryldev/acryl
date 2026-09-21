# ACRYL UI library (`acryl-ui-web`): build screens from ready components

Use this instead of hand-styling. It is a client-only package that every Web and Desktop profile carries; a client bundle requires it after listing it in `package.json`:

```json
"dsh": { "client": { "inject": ["acryl-ui-web", "@deepseek-ai/dsh-client-ui-sidebar"], "platform": "web" } }
```

```js
const ui = require('acryl-ui-web')   // then ui.Card, ui.Field, ui.SettingsRow ...
```

Example: `../example-plugins/packages/client-ui-library/` (a gallery as a Settings page: every component, the color roles, a Settings-style form). The single source of truth for props and accessibility is
`contracts/components.json` in the package (`plugins/acryl-ui-web/`); the semantic colors are `contracts/tokens.json`.

| Need | Use |
| --- | --- |
| Layout | `Stack` (row or column, gap `xs` to `lg`) |
| A grouped surface | `Card` (title, footer actions) |
| Text input with label, hint, error | `Field` (`onChange` receives the string) |
| On/off | `SwitchField` |
| A settings screen row | `SettingsRow` (label and description left, control right) |
| Dropdown | `SelectField` (built on the app's own Menu) |
| Few exclusive tiles (Light, Dark, System) | `Segmented` |
| Sections | `Tabs` (active panel as children) |
| Confirm or destructive action | `Dialog` (built on the app's Modal) |
| Nothing to show | `EmptyState` |
| Button, Tag, Pill, Toast, Modal, Tooltip | re-exported from the app's primitives |
| Register in the app | `settingsSection` (a Settings page), `footerAction`, `headerAction`, `sidebarTab` (slot helpers; the slot is waited for) |

Rules that keep it correct:

- The library follows light and dark by itself. For any color of your own use `ui.roles.<role>` (a CSS `var(--acryl-<role>)`): `text`, `textMuted`, `textDimmed`, `surface`, `surfaceRaised`, `border`, `primary`,
  `success`, `warning`, `error`, `info`, `accent`, `reasoning`. Never write a hex color or an `--dsw-alias-*` name in your own bundle.
- Interactive components name themselves: give `SelectField`, `Segmented` and `Tabs` a `label`. `Field` announces its error by itself.
- The client loader treats every module as a plugin: a pure library needs an (empty) `apply`; a consumer that fills a slot declares `inject = ['slots']`.

## In the terminal (`acryl-ui-tui`)

The same component names exist for the CLI, built on pi-tui, and every one is width-safe (no line is ever wider than the terminal) and keyboard-driven. A terminal plugin imports the library
(it is made resolvable in the CLI profile) and hands it the CLI's palette service so colors follow the terminal's light or dark scheme:

```js
import { createTuiUi } from 'acryl-ui-tui'
export function apply(ctx) {
  const ui = createTuiUi(ctx.get('tuiTheme'))   // omit for the static dark palette; undefined outside the CLI
  ctx.get('tuiCommands')?.register({ command: '/settings', description: 'Settings', packageName: 'my-plugin', overlay: { width: '70%' },
    open: ({ close }) => ui.Card({ title: 'Settings', body: [ui.SettingsRow({ label: 'Theme', control: ui.Segmented({ options: [{ id: 'l', label: 'Light' }, { id: 'd', label: 'Dark' }], value: 'd' }) })] }) })
}
```

Keys: arrows move a `Segmented`, `SelectField` or `Tabs`; space or enter toggles a `SwitchField`; `y`/enter and `n`/Esc answer a `Dialog`; Tab and Shift+Tab switch `Tabs`. `ctx.get('tuiTheme')` is read-only
(`mode`, `hex(role)`, `color(role)`, `onChange`); the mode is the user's (`ACRYL_TUI_THEME=dark|light`) or the terminal's, never a plugin's. Example: `../example-plugins/packages/tui-ui-library/` (`/gallery`).

