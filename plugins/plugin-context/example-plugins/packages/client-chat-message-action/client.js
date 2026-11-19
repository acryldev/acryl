// Example: client-chat-message-action  (browser half)
// Type:     client-slot (chat message seam)
// Surfaces: web desktop
// Teaches:  the ADDITIVE ways to extend how chat messages render. (1) `conversation.chat.assistant-actions` is a LIST slot: every entry adds an action to the row under
//           each finished assistant message (props `{ messageId }`); use a fresh `id` (reusing a shipped id like 'feedback' replaces that action). This example does that.
//           (2) `conversation.chat.turnTail` is a CHAIN: entries with a `select(owner)` routing function render before a completed turn's action row (props `{ turn, seq, openFile }`).
//           (3) `conversation.chat.node` is KEYED by the fixed set of node kinds (assistant-step, user, command, ...) and every kind is already owned by a shipped
//           renderer: registering there REPLACES it (a takeover, risky: read maps/slot-contracts.md first and prefer (1) or (2)).
//           State lives in localStorage keyed by message id.
// Expect:   a small "Bookmark" / "Bookmarked" toggle under each finished assistant message.
// Docs:     extending.client-slot
// Pattern:  maps/slot-contracts.md ("conversation.chat.assistant-actions"), deepseek-harness/packages/client/ui-message-feedback (the shipped Feedback action)
window.__ModuleLoader__.load({ id: 'acryl-example-chat-message-action', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
const h = React.createElement
const ID = 'acryl-example-chat-message-action'
const KEY = ID + ':bookmarks'
console.info('[' + ID + '] client module loaded')

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

function BookmarkAction({ messageId }) {
  const [marks, setMarks] = React.useState(read)
  const marked = Boolean(marks[String(messageId)])
  const toggle = () => {
    const next = { ...marks, [String(messageId)]: !marked }
    setMarks(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }
  return h(Button, { variant: 'ghost', size: 'sm', onClick: toggle, title: 'Bookmark this answer', 'aria-pressed': marked }, marked ? 'Bookmarked' : 'Bookmark')
}

// Required service: the slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  console.info('[' + ID + '] apply: registering assistant message action')
  // A fresh id adds an action beside the shipped ones; the slot exists while the chat entry is mounted, and inject waits for it.
  ctx.slots.inject('conversation.chat.assistant-actions', () =>
    ctx.slots.register({ name: 'conversation.chat.assistant-actions', id: ID, order: 100, label: 'Bookmark' }, BookmarkAction))
}

return module.exports; } });
