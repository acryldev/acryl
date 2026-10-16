// Example: client-slot.sidebar-tab  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a tab in the right sidebar, in the same two stages the built-in tabs use: (1) register the tab
//           TYPE in `ctx.sidebarRightTabs` (a title, and a guide entry so the user can open it from the
//           sidebar's "new tab" page); (2) register the tab BODY in the keyed `sidebar.right.pane.tab` slot
//           under the type's `id`. State lives in localStorage. No build step, no JSX.
// Expect:   a "Todo" entry on the sidebar's new-tab page; opening it shows a small persistent todo list.
// Docs:     extending.client-slot
// Pattern:  the built-in files tab (packages/client/ui-sidebar-files) and docs/reference/subsystems/sidebar-right.md
// Status:   structure copied from the built-in tab; verify in the real UI after installing (reload the page).
window.__ModuleLoader__.load({ id: 'acryl-example-client-sidebar-tab', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement
const TAB_ID = 'acryl-example-client-sidebar-tab'
const KEY = TAB_ID + ':items'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function TodoBody() {
  const [items, setItems] = React.useState(load)
  const [draft, setDraft] = React.useState('')
  const save = next => { setItems(next); try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ } }
  const add = () => { if (draft.trim()) { save([...items, { id: Date.now(), text: draft.trim(), done: false }]); setDraft('') } }
  return h('div', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 8 } },
    h('strong', null, 'Todo'),
    items.map(item => h('label', { key: item.id, style: { display: 'flex', gap: 8, alignItems: 'center' } },
      h('input', { type: 'checkbox', checked: item.done, onChange: () => save(items.map(x => x.id === item.id ? { ...x, done: !x.done } : x)) }),
      h('span', { style: { flex: 1, textDecoration: item.done ? 'line-through' : 'none' } }, item.text),
      h('button', { type: 'button', onClick: () => save(items.filter(x => x.id !== item.id)) }, 'x'))),
    h('div', { style: { display: 'flex', gap: 8 } },
      h('input', { value: draft, placeholder: 'New item', style: { flex: 1 }, onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === 'Enter') add() } }),
      h('button', { type: 'button', onClick: add }, 'Add')))
}

// Required services: the slot registry and the sidebar's tab-type registry.
exports.inject = ['slots', 'sidebarRightTabs']

exports.apply = function apply(ctx) {
  console.info('[' + TAB_ID + '] apply: registering sidebar tab')
  // Stage one: what the tab type IS. `kind` is what "open a tab of this kind" names.
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: 'acryl-example-todo',
    title: () => 'Todo',
    guide: [{ order: 90, title: () => 'Todo', description: () => 'A small persistent todo list' }],
  }), TAB_ID + ': tab type')
  // Stage two: the body, in the keyed seat, under the type's id.
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, TodoBody)), TAB_ID + ': tab body')
}

return module.exports; } });
