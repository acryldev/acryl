# @acryl/ui

ACRYL UI library for the Web and Desktop client (spec 038): themed building blocks over the app's own primitives, and slot helpers.

```js
// in a client bundle whose package.json lists "@acryl/ui" in dsh.client.inject
const ui = require('@acryl/ui')
ui.footerAction(ctx, { id: 'my-panel' }, function Panel() {
  const [name, setName] = React.useState('')
  return React.createElement(ui.Card, { title: 'Settings' }, React.createElement(ui.Field, { label: 'Name', value: name, onChange: setName }))
})
```

Components and helpers are described in `contracts/components.json` (the single source: props, a11y, slots). `npm test` checks that the exports match the contract.
The client loader treats every module as a plugin. This library's `apply` registers its two extra theme tokens and provides `acrylChat`, the chat as
ACRYL's client plugins see it (declared in `frame.ts`): `phase(sessionId)` is `blank` on the start page (no prompt yet, no conversation drawn), then
`engaging` and `active` (DSH's own `conversationPhase`), and `notice(sessionId, level, text)` shows a line under that session's composer. A client
plugin injects `acrylChat` and imports `@acryl/ui/frame` for its types, so it names no DSH package (`acryl-command-reply` is the first).

Status: skeleton. Stack, Card, Field, SwitchField, EmptyState; footerAction, headerAction, sidebarTab. Not yet wired into every surface's composition (task T011b).
