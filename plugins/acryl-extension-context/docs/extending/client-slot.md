# Client slot plugins: add UI to the Web and Desktop app

Use this to add a button, a panel, a tab or a settings section to the app (a kanban
board, a notes panel, a dashboard). Works on **web** and **desktop**; the terminal UI
has no client slots (see `tui-command.md`).

BEFORE hand-styling anything read `ui-components.md`: the app's own themed Button, Modal, Input, Switch, Tag and more can be `require`d
(verified in a browser), so the UI matches the app with no CSS.

For a slot beyond the header action, read its entry in `../maps/slot-contracts.md` (register options, the props your component receives, taken keys, a worked
example). A custom card for one of your own tools: `../example-plugins/packages/client-tool-view/`.

Working example, copy from it: `../example-plugins/packages/client-slot-header-action/`
(read `index.js` and `client.js` completely).

## The two halves

A UI plugin is one package with a **host half** and a **browser half**:

- Host half `index.js`: named exports `name` and an **empty** `apply()`. It only gives the
  Loader a row.
- Browser half `client.js`, exported as `"./client"`. It is discovered because
  `package.json` has `"dsh": { "client": { "inject": [...], "platform": "web" } }`.

`package.json` needs (see the example): `"exports"` with `"."`, `"./client"` and
`"./package.json"`; `"files"` listing `index.js`, `client.js`, `cordis.patch.yml`;
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "inject": ["@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-conversation"], "platform": "web" } }`.
`dsh.client.inject` lists the client packages that must load first; use the ones that
declare the slot you fill (the conversation package for header slots, the sidebar
package for sidebar slots).

## You have no build step. Write the bundle by hand

There is no bundler in the agent's loop, so `client.js` is hand-written CommonJS inside
the exact wrapper the repo's build adds:

```js
window.__ModuleLoader__.load({ id: '<your package name>', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require('react')            // provided by the app
const ReactDOM = require('react-dom')     // provided by the app
// ...components using React.createElement (NO JSX: there is no compiler)...
exports.inject = ['slots']
exports.apply = function apply(ctx) {
  ctx.slots.inject('<slot name>', () =>
    ctx.slots.register({ name: '<slot name>', id: '<unique id>', order: 60 }, MyComponent))
}
return module.exports; } });
```

`id` in the wrapper must equal the package name. `require` only serves the modules the
app exposes (`react`, `react/jsx-runtime`, `react-dom`, `@deepseek-ai/cordis` and the
`@deepseek-ai/dsh-client-*` packages); do not import anything else, and do not use `import`.
Styling: inline `style` objects, or inject one `<style>` element in `apply` and remove it in a
`ctx.effect` disposer.

## Slots you can fill

| Slot | Where it renders | Kind |
| --- | --- | --- |
| `conversation.session.header.actions` | top bar of a conversation, next to the title | list (use `order`) |
| `conversation.session.header.utilities` | top bar, right-aligned utilities | list |
| `sidebar.right.pane.tab` | a tab in the right sidebar (two stages: register the tab TYPE in `ctx.sidebarRightTabs`, then the BODY in this keyed slot; see `client-slot-sidebar-tab`) | keyed (`key` = the type id) |
| `settings.plugin.item` | a card on the Settings > Plugin configuration page, paired with a Host settings namespace (see `reference/cookbook/adding-a-settings-card.md`; no verified example) | keyed (`key` = the namespace) |

For a first version use the header action plus a floating panel opened by the button
(the example): it needs no other props. Register with `{ name, id, order }`.

## A sidebar tab, or a docked or full-screen view

**Native sidebar tab (verified example)**: `../example-plugins/packages/client-slot-sidebar-tab/`. Copy its `client.js`.
Two stages, both inside `ctx.effect(...)`: (1) `ctx.sidebarRightTabs.register({ id, kind, title: () => 'Todo',
guide: [{ order, title, description }] })` declares the tab type and puts an entry on the sidebar's "new tab" page;
(2) `ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id },
Body))` registers the body. `inject` is `['slots', 'sidebarRightTabs']` and the package needs `dsh.client.inject`
to include `@deepseek-ai/dsh-client-ui-sidebar-right`. After install and a page reload the user opens the sidebar's
new-tab page and picks the entry. This example is loaded and applied in a real browser without errors; its body
rendering inside an open session is the part to confirm with the user, so say so.

**Docked or full view (most robust)**: keep the header-action button from `client-slot-header-action` and change
the panel it opens. A docked side panel is `position: 'fixed', top: 0, right: 0, height: '100vh', width: 420,
zIndex: 9999`; a full view is `inset: 0`. Give it a title bar with a close button. Use this when the native tab
strip is not required, or as the fallback if the sidebar tab does not show.

Exact registration reference: `reference/subsystems/sidebar-right.md` and `reference/subsystems/slots.md`.

## Chat messages and turns

Extend how the conversation looks around messages with the ADDITIVE seams, not by replacing renderers. `conversation.chat.assistant-actions` (a list: an action under
each finished assistant message, props `{ messageId }`; example `../example-plugins/packages/client-chat-message-action/`) and `conversation.chat.turnTail` (a chain with a
`select(owner)` router that renders before a completed turn's action row). `conversation.chat.node` renders every message kind, and every kind is already owned by a shipped
renderer, so registering there replaces it (a takeover): use it only when the user asks to change how a whole message kind looks, and read `../maps/slot-contracts.md` first.
The same holds for `tool.call.toolview`: a key you own (your own tool) is additive, a shipped tool's key is a takeover.

## Keyboard shortcuts

The Web and Desktop client has no plugin shortcut registry (only built-in behavior such as the sidebar toggle). A plugin owns a guarded `keydown`
listener: see the `useEffect` in `../example-plugins/packages/client-ui-components/client.js` (Cmd/Ctrl+Shift+K toggles its modal; verified in a real browser).
Rules: use a modifier combination, never a bare key; ignore the event when `event.defaultPrevented` or while the user types in an input, textarea or
editable element; call `preventDefault()` only when you act on it; remove the listener in the effect cleanup. Two plugins can collide on a combination:
say which one you chose. Desktop's native menu accelerators live in the Electron main process (`desktop-app.md`) and are not plugin-changeable.

## Persisting state

The example keeps state in `localStorage`. That survives reloads in ONE browser only: Web and Desktop each have their own copy, and clearing site data wipes it. For state
shared across surfaces, kept on the host, or visible to the agent, read `state-and-persistence.md` (host file behind an RPC channel, workspace file, settings) and
start from `../example-plugins/packages/state-host-store/`.

## Getting it live

Deliver with the `acryl_install_plugin` tool (`../delivery/local-live.md`). The host row is live
immediately; the browser part appears after the page (Web) or window (Desktop) reloads, and the
tool result tells you so. Say that to the user.

## Building something like a kanban board

Copy the example and change the component: columns as arrays in state, cards as objects with
an id, move a card by updating state and saving to `localStorage`, render columns with
`React.createElement`. Keep it in one `client.js`. Choose the slot by what the user asked: a
top-bar button and panel is the simplest; a right-sidebar tab uses the `client-slot-sidebar-tab` pattern.

## Debugging in the browser

Put a `console.info('[<package>] ...')` at the top of `client.js` and in `apply`. Open the browser console
(reload first): if the module line appears the bundle loaded and `require('react')` works; if the `apply` line
appears the slot registration ran. Nothing logged means the bundle did not load (check the wrapper `id`, no
JSX, no `import`, and that `package.json` has `dsh.client` and `exports["./client"]`). The example does this.

## Common mistakes

- JSX or `import` in `client.js` (no compiler): the bundle fails to load. Use `createElement`
  and `require`.
- Wrapper `id` different from the package name.
- `exports` missing `"./client"` or `"./package.json"`: the install tool reports it.
- Forgetting the empty host `apply()`: there is then no row to mount.
