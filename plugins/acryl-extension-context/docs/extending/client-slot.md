# Client slot plugins: add UI to the Web and Desktop app

Use this to add a button, a panel, a tab or a settings section to the app (a kanban
board, a notes panel, a dashboard). Works on **web** and **desktop**; the terminal UI
has no client slots (see `tui-command.md`).

Working example, copy from it: `../examples/packages/client-slot-header-action/`
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
| `sidebar.right.pane.tab` | a tab in the right sidebar pane (needs `key`, and more props; see `deepseek-harness/packages/client/ui-sidebar-files/src/client/index.ts`) | list |
| `settings.section` | a section in Settings | list |

For a first version use the header action plus a floating panel opened by the button
(the example): it needs no other props. Register with `{ name, id, order }`.

## Persisting state

The example keeps state in `localStorage`. That survives reloads on one machine. For state
shared across devices or with the agent, add a host route (`host-route.md`) and `fetch` it.

## Getting it live

Deliver with the `acryl_install_plugin` tool (`../delivery/local-live.md`). The host row is live
immediately; the browser part appears after the page (Web) or window (Desktop) reloads, and the
tool result tells you so. Say that to the user.

## Building something like a kanban board

Copy the example and change the component: columns as arrays in state, cards as objects with
an id, move a card by updating state and saving to `localStorage`, render columns with
`React.createElement`. Keep it in one `client.js`. Choose the slot by what the user asked: a
top-bar button and panel is the simplest; a right-sidebar tab is nicer but needs the extra props.

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
