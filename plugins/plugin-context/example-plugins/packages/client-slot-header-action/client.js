// Example: client-slot.header-action  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  a browser plugin WITHOUT a build step. The bundle is CommonJS wrapped in
//           window.__ModuleLoader__.load(...), the exact wrapper the repo's tsdown config
//           adds (plugins/dsh-client-ui-brand-acryl/tsdown.config.ts). `react` and
//           `react-dom` are provided by the app via require(); use React.createElement
//           (no JSX, there is no compiler). State persists in localStorage.
// Expect:   a "Notes" button in the conversation header actions; click opens a panel.
// Docs:     extending.client-slot
// Pattern:  ui-schedule (src/client/index.ts) fills 'conversation.session.header.actions'
window.__ModuleLoader__.load({ id: 'acryl-example-client-notes', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const ReactDOM = require('react-dom')
const h = React.createElement
console.info('[acryl-example-client-notes] client module loaded (react ' + typeof React.createElement + ')')
const KEY = 'acryl-example-client-notes'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function NotesAction() {
  const [open, setOpen] = React.useState(false)
  const [notes, setNotes] = React.useState(load)
  const [draft, setDraft] = React.useState('')
  const save = next => { setNotes(next); localStorage.setItem(KEY, JSON.stringify(next)) }
  const add = () => { if (draft.trim()) { save([...notes, { id: Date.now(), text: draft.trim() }]); setDraft('') } }

  const panel = open && h('div', { style: { position: 'fixed', top: 56, right: 16, width: 320, maxHeight: '70vh', overflow: 'auto', zIndex: 9999, padding: 12, background: 'var(--surface, #fff)', color: 'var(--text, #111)', border: '1px solid #8884', borderRadius: 8, boxShadow: '0 8px 24px #0003' } },
    h('strong', null, 'Notes'),
    notes.map(n => h('div', { key: n.id, style: { display: 'flex', gap: 8, marginTop: 8 } },
      h('span', { style: { flex: 1 } }, n.text),
      h('button', { onClick: () => save(notes.filter(x => x.id !== n.id)) }, 'x'))),
    h('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
      h('input', { value: draft, placeholder: 'New note', style: { flex: 1 }, onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === 'Enter') add() } }),
      h('button', { onClick: add }, 'Add')))

  return h(React.Fragment, null,
    h('button', { type: 'button', onClick: () => setOpen(v => !v), title: 'Notes' }, 'Notes'),
    panel && ReactDOM.createPortal(panel, document.body))
}

// Required service: the UI slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  console.info('[acryl-example-client-notes] apply: registering header action')
  // slots.inject waits for the slot's own declaration, so this works whether this
  // package loads before or after the package that declares the slot.
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'acryl-example-client-notes', order: 60 }, NotesAction))
}

return module.exports; } });
