// acryl-gtd board link (browser half)
// Type:     client-slot (tool renderer, key 'gtd_board')
// Surfaces: web desktop
// Teaches:  a tool.call.toolview that is deliberately thin. An earlier version of this file reimplemented the
//           whole board here (buckets, list, kanban, calendar, projects) - a second, divergent copy of what
//           lib/board-page.js already renders at its own URL (/gtd). Every completed tool call in this chat
//           collapses behind a "N tool calls" row the user has to click (dsh-client-ui-chat hardcodes that
//           expand state to false, no override a plugin can set), so a todo app whose own board only shows up
//           after "open the board" and a click is broken UX (owner feedback, 2026-09-28) - and duplicating the
//           real UI here on top of that was also a DRY violation (Pragmatic Programmer: two implementations of
//           one thing drift). The fix is the standalone page, not a bigger card here; this file now only points
//           at it.
// Expect:   a small card with a link that opens /gtd in a new tab - the actual board.
window.__ModuleLoader__.load({ id: 'acryl-gtd', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const h = React.createElement

function GtdBoardLink() {
  return h('div', {
    style: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--dsw-alias-border-l1, #ffffff26)', borderRadius: 10, padding: '10px 12px', margin: '4px 0' },
  },
    h('span', null, 'The GTD board is a page of its own, not a chat card - open it once and it stays your task list.'),
    h('a', {
      href: '/gtd', target: '_blank', rel: 'noopener',
      style: { marginLeft: 'auto', flex: 'none', background: '#1971c2', color: '#fff', borderRadius: 6, padding: '6px 12px', fontWeight: 600, fontSize: 12, textDecoration: 'none' },
    }, 'Open the board ↗'))
}

// Required service: the slot registry.
exports.inject = ['slots']

exports.apply = function apply(ctx) {
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'gtd_board' }, GtdBoardLink))
}

return module.exports; } });
