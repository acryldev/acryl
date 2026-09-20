# Ready-made UI components: build with the app's own library

Use this BEFORE hand-styling any UI. On Web and Desktop the app already ships a themed component library, and a plugin can use it
today. Working example (verified in a real browser: the modal, input, switch and buttons rendered themed): 
`../examples/packages/client-ui-components/` (read `client.js` and `package.json`). All component names: `../maps/ui-components.md`.

## Web and Desktop: `@deepseek-ai/dsh-client-ui-primitives`

```js
// client.js
const React = require('react')
const { Button, Modal, Input, Switch, Tag, Pill, Tooltip, Toast, Menu } = require('@deepseek-ai/dsh-client-ui-primitives')
```

and in `package.json`: `"dsh": { "client": { "inject": ["@deepseek-ai/dsh-client-ui-primitives"], "platform": "web" } }` so it loads first.
No JSX (use `React.createElement`), no `import`. The components follow the theme, so your token overrides (`ui-theme.md`) restyle them too.

Props of the common ones (read from the source):

| Component | Props |
| --- | --- |
| `Button` | `variant?: 'primary' \| 'ghost' \| 'outline' \| 'toolbar'`, `size?: 'md' \| 'sm'`, `icon?`, `className?`, plus any `<button>` attribute (`onClick`, `title`, `disabled`) |
| `Input` | `icon?`, `className?`, plus any `<input>` attribute (`value`, `onChange`, `placeholder`, `onKeyDown`) |
| `Switch` | `checked: boolean`, `onChange(next: boolean)`, `label: string` (accessibility name, not drawn), `disabled?`, `title?` |
| `Tag` | `tone?` (default `'outline'`), `className?`, `children` (a small status label) |
| `Pill` | `active?`, `onClick?` (interactive when given), `children` |
| `Modal` | `open`, `onClose`, `title`, `closeLabel` (required unless `headless: true`), `description?`, `footer?`, `children`; closes on Escape; renders in a portal |
| `Toast` | `text`, `icon?`, `anchor?`, `holdMs?`, `onDone` (you unmount it in `onDone`) |
| `Tooltip` | `label: string \| () => string`, `side?`, `delayMs?`, `disabled?`, `children` (ONE element that can take a ref) |
| `Menu` | entries `{ label, onSelect }`, separators and labels (read `src/Menu.tsx` for the exact shape before using) |
| `MarkdownText`, `CodeBlock`, `DiffBlock`, `TerminalBlock`, `JsonTree` | render agent-style output; read their `src/*.tsx` props first |

If a component's props are not listed here, READ its source in the repository (`deepseek-harness/packages/client/ui-primitives/src/<Name>.tsx`)
or the reference doc; do not guess.

## Which slot to put it in

Component libraries fill the same slots as any UI: `../maps/mount-points.md`. Two good first choices: `sidebar.footer.action`
(root-scoped: renders with or without an open session, receives `{ wide }`; the example) and `conversation.session.header.actions`
(per session, `client-slot.md`). For a Modal you do not need a slot for the panel itself: it portals to the body.

## CLI

The terminal has its own components (pi-tui), documented in `tui-components.md`. There is no shared component contract between the web
and terminal stacks yet (spec 038 proposes one): build each surface's UI with its own library.

## Rules

1. Prefer these components over hand-written styles: consistent look, both color modes, accessible by default.
2. Never import from the harness by file path or bundle your own React: use `require` of the module names above.
3. Keep state in the plugin (localStorage or a host route), not in the components.
4. Declare every package you `require` in `dsh.client.inject`, otherwise load order is not guaranteed.
5. State that you could not see the result and ask the user to check it, in both light and dark.
