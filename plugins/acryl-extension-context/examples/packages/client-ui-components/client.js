// Example: ui-components.shared-primitives  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  build UI from the app's OWN component library instead of hand-styling: `require('@deepseek-ai/dsh-client-ui-primitives')`
//           gives Button, Modal, Input, Switch, Tag, Pill, Tooltip, Toast, Menu, MarkdownText, CodeBlock, icons and more (see
//           maps/ui-components.md). They are already themed (light and dark, your token overrides apply) and accessible, so the UI
//           matches the app with no CSS. Declare the package in `dsh.client.inject` (package.json) so it is loaded first.
//           This example fills `sidebar.footer.action`, a ROOT-scoped slot (it renders with or without an open session), and gets
//           `{ wide }` (false when the sidebar is the narrow rail). State lives in localStorage.
// Expect:   a "Quick notes" button beside Settings; click opens a modal with an input, a "Show done" switch and tagged notes.
// Docs:     extending.ui-components
// Pattern:  plugins/cordis-plugin-market/src/client/index.ts (the Market button fills the same slot)
window.__ModuleLoader__.load({ id: 'acryl-example-ui-components', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const { Button, Modal, Input, Switch, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
const h = React.createElement
const ID = 'acryl-example-ui-components'
const KEY = ID + ':notes'
console.info('[' + ID + '] client module loaded (Button ' + typeof Button + ', Modal ' + typeof Modal + ')')

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function QuickNotes({ wide }) {
  const [open, setOpen] = React.useState(false)
  const [notes, setNotes] = React.useState(load)
  const [draft, setDraft] = React.useState('')
  const [showDone, setShowDone] = React.useState(true)
  const save = next => { setNotes(next); try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ } }
  const add = () => { if (draft.trim()) { save([...notes, { id: Date.now(), text: draft.trim(), done: false }]); setDraft('') } }
  const shown = notes.filter(n => showDone || !n.done)

  return h(React.Fragment, null,
    h(Button, { variant: 'ghost', onClick: () => setOpen(true), title: 'Quick notes' }, wide ? 'Quick notes' : 'N'),
    h(Modal, {
      open, onClose: () => setOpen(false), title: 'Quick notes', closeLabel: 'Close',
      footer: h(Button, { variant: 'primary', onClick: add }, 'Add'),
    },
      h(Input, { value: draft, placeholder: 'New note', onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === 'Enter') add() } }),
      h('div', { style: { margin: '12px 0' } }, h(Switch, { checked: showDone, onChange: setShowDone, label: 'Show done' })),
      shown.map(n => h('div', { key: n.id, style: { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' } },
        h(Tag, { tone: n.done ? 'outline' : 'outline' }, n.done ? 'done' : 'todo'),
        h('span', { style: { flex: 1, textDecoration: n.done ? 'line-through' : 'none' } }, n.text),
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => save(notes.map(x => x.id === n.id ? { ...x, done: !x.done } : x)) }, n.done ? 'Undo' : 'Done'),
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => save(notes.filter(x => x.id !== n.id)) }, 'Delete'))),
    ))
}

// Required service: the slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  console.info('[' + ID + '] apply: registering sidebar footer action')
  // slots.inject waits for the slot's own declaration, so load order does not matter.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: ID, order: 50 }, QuickNotes))
}

return module.exports; } });
