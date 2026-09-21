// Example: state.host-store  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  read and write host-side state from the page with `ctx.connection.rpc.call(channel, endpoint, payload)`, the counterpart of
//           `connection.rpc.handle` in index.js. The component keeps only a view of the data; the host file is the source of truth.
// Expect:   a "Shared notes" button beside Settings; the notes it shows are identical in Web and Desktop.
// Docs:     extending.state-and-persistence
window.__ModuleLoader__.load({ id: 'acryl-example-state-host', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const { Button, Modal, Input } = require('@deepseek-ai/dsh-client-ui-primitives')
const h = React.createElement
const ID = 'acryl-example-state-host'
const CHANNEL = '/acryl-example-state-host'

function makeSharedNotes(connection) {
  // `rpc.call` resolves to an envelope: `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }` (transport, auth or a
  // handler that threw). Unwrap it once here; the value is whatever the host handler returned.
  const call = async (endpoint, payload) => {
    // Always send an object: the request envelope requires a `payload` key, and `undefined` is dropped by JSON, which the host rejects
    // as "invalid client-request message".
    const result = await connection.rpc.call(CHANNEL, endpoint, payload ?? {})
    if (result && result.ok === false) throw new Error(result.error && result.error.message ? result.error.message : 'RPC call failed')
    return result && result.ok === true ? result.value : result
  }
  return function SharedNotes({ wide }) {
    const [open, setOpen] = React.useState(false)
    const [notes, setNotes] = React.useState([])
    const [draft, setDraft] = React.useState('')
    const [error, setError] = React.useState('')
    const apply = result => { setError(''); setNotes(result.notes) }
    // Re-read from the host every time the panel opens: another window may have changed the file.
    React.useEffect(() => { if (open) call('list').then(apply).catch(e => setError(String(e && e.message || e))) }, [open])
    const add = () => { if (draft.trim()) call('add', { text: draft }).then(apply).then(() => setDraft('')).catch(e => setError(String(e && e.message || e))) }
    return h(React.Fragment, null,
      h(Button, { variant: 'ghost', onClick: () => setOpen(true), title: 'Shared notes' }, wide ? 'Shared notes' : 'S'),
      h(Modal, { open, onClose: () => setOpen(false), title: 'Shared notes', closeLabel: 'Close', footer: h(Button, { variant: 'primary', onClick: add }, 'Add') },
        h(Input, { value: draft, placeholder: 'New note', onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === 'Enter') add() } }),
        error ? h('p', { role: 'alert' }, error) : null,
        notes.map(n => h('div', { key: n.id, style: { display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' } },
          h('span', { style: { flex: 1 } }, n.text),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => call('remove', { id: n.id }).then(apply) }, 'Delete')))))
  }
}

// Required services: the slot registry and the connection (the authenticated channel to the host).
exports.inject = ['slots', 'connection']

exports.apply = function apply(ctx) {
  console.info('[' + ID + '] apply: registering shared notes')
  const SharedNotes = makeSharedNotes(ctx.connection)
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: ID, order: 60 }, SharedNotes))
}

return module.exports; } });
