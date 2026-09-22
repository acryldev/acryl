# acryl-ui-web

ACRYL UI library for the Web and Desktop client (spec 038): themed building blocks over the app's own primitives, and slot helpers.

```js
// in a client bundle whose package.json lists "acryl-ui-web" in dsh.client.inject
const ui = require('acryl-ui-web')
ui.footerAction(ctx, { id: 'my-panel' }, function Panel() {
  const [name, setName] = React.useState('')
  return React.createElement(ui.Card, { title: 'Settings' }, React.createElement(ui.Field, { label: 'Name', value: name, onChange: setName }))
})
```

Components and helpers are described in `contracts/components.json` (the single source: props, a11y, slots). `npm test` checks that the exports match the contract.
The client loader treats every module as a plugin, so this library also exports an empty `apply`.

Status: skeleton. Stack, Card, Field, SwitchField, EmptyState; footerAction, headerAction, sidebarTab. Not yet wired into every surface's composition (task T011b).
