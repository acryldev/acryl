# Workspace tab types: add a new kind of tab (whiteboard, board, viewer)

Use this when the user wants a new kind of TAB in the workspace (an Excalidraw-style whiteboard, a
kanban of their own, a log viewer, a diagram). Works on **web** and **desktop**. A tab type is a
plugin, so it can be turned on and off in Settings > Tabs, and it appears in the "+" menu and the
command palette.

Working example, copy from it: `../example-plugins/packages/client-workspace-tab/` (a whiteboard;
read `client.js` completely). The package shape is the one in `client-slot.md`: a host half
`index.js` with an empty `apply()`, a hand-written browser half `client.js`, no build step, no JSX.

## The contract

Your browser half injects the `workspaceTabs` service and registers one type per tab kind:

```js
exports.inject = ['workspaceTabs']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.workspaceTabs.register({
    kind: 'acme.whiteboard',          // owner.name: lowercase letters, digits, dashes; unique
    label: 'Whiteboard',              // shown in the + menu, 1 to 30 characters
    description: 'One sentence for Settings > Tabs.',
    glyph: '✎',                       // one or two characters shown on the tab
    component: Whiteboard,            // a React component
  }), 'acme-whiteboard: tab type')
}
```

`register` returns a disposer; return it from `ctx.effect` so the type disappears when the plugin
is disabled. It throws when the kind is malformed or already registered; the message names the rule.

Your component receives `{ tileId, title, state, setState, setTitle }`:

- `state` is the tab's saved state, **text** (use JSON), or `undefined` for a new tab.
- `setState(next)` replaces it; the workspace saves it with the tabs, at most 200,000 characters
  (a longer value is ignored). Keep the state small: strokes, settings, not images.
- `setTitle(title)` renames the tab.

## What the workspace guarantees

- A tab of your type is restored after a reload with its state.
- If your plugin is off or not installed when the tab is restored, the tab shows a note and **keeps
  its state**; when the plugin returns, the content is back exactly as it was.
- Turning the type off in Settings > Tabs hides it from the menu and the palette; open tabs stay.

## What it does not do

Your component runs in the app's page with the same access as any client plugin (there is no
sandbox), so install only plugins you trust. It cannot start terminals or read files by itself; for
that, add a Host route (`host-route.md`) and call it from the component.
