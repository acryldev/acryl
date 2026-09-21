# acryl-ui-tui

ACRYL UI library for the terminal (spec 038-ui-component-library): pi-tui components with the same names and contracts as `acryl-ui-web`, themed by the shared semantic roles.

```js
import { createTuiUi } from 'acryl-ui-tui'
export function apply(ctx) {
  const ui = createTuiUi(ctx.get('tuiTheme'))   // follows the terminal's light/dark scheme; omit for the static dark palette
  ctx.get('tuiCommands')?.register({ command: '/settings', description: 'Settings', packageName: 'my-plugin',
    open: ({ close }) => ui.Card({ title: 'Settings', body: ui.SettingsRow({ label: 'Theme', control: ui.Segmented({ options: [{ id: 'l', label: 'Light' }, { id: 'd', label: 'Dark' }], value: 'd' }) }) }) })
}
```

The contract for every component is `plugins/acryl-ui-web/contracts/components.json`; `tests/conformance.test.mjs` checks width (12, 24, 40, 80, 200 columns) and keyboard behavior.
