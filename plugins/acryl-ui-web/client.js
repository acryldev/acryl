// acryl-ui-web (browser half). A LIBRARY: it fills no slot itself. Other client bundles `require('acryl-ui-web')` after listing it in
// `dsh.client.inject`. Built from the app's own primitives and `--dsw-alias-*` tokens, so it follows light/dark and any theme override.
// The client loader treats every module as a plugin, so this module also exports an (empty) `apply`.
window.__ModuleLoader__.load({ id: 'acryl-ui-web', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const { Input, Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
const h = React.createElement

const GAPS = { xs: 4, sm: 8, md: 12, lg: 20 }
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const STYLE_ID = 'acryl-ui-web-styles'
const CSS = `
.acryl-ui-card { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.acryl-ui-card-title { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.acryl-ui-card-footer { display: flex; justify-content: flex-end; gap: 8px; }
.acryl-ui-field { display: flex; flex-direction: column; gap: 6px; }
.acryl-ui-label { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 18px; }
.acryl-ui-hint { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; }
.acryl-ui-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 16px; }
.acryl-ui-switch-row { display: flex; flex-direction: column; gap: 4px; }
.acryl-ui-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 16px; text-align: center; color: var(--dsw-alias-label-tertiary); }
.acryl-ui-empty-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 500; }
.acryl-ui-empty-description { margin: 0; font-size: 12px; line-height: 18px; }
`
// One shared style element for the whole library, created on first use and never duplicated.
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
let nextId = 0
const useId = prefix => { const ref = React.useRef(null); if (ref.current === null) ref.current = `${prefix}-${nextId++}`; return ref.current }

exports.Stack = function Stack({ direction = 'column', gap = 'md', align = 'stretch', children, style }) {
  return h('div', { style: { display: 'flex', flexDirection: direction, gap: GAPS[gap] ?? GAPS.md, alignItems: ALIGN[align] ?? ALIGN.stretch, ...style } }, children)
}

exports.Card = function Card({ title, footer, children }) {
  ensureStyles()
  const titleId = useId('acryl-card')
  return h('section', { className: 'acryl-ui-card', role: 'group', 'aria-labelledby': title ? titleId : undefined },
    title ? h('h3', { id: titleId, className: 'acryl-ui-card-title' }, title) : null,
    children,
    footer ? h('div', { className: 'acryl-ui-card-footer' }, footer) : null)
}

exports.Field = function Field({ label, value, onChange, hint, error, placeholder }) {
  ensureStyles()
  const id = useId('acryl-field')
  const noteId = `${id}-note`
  return h('div', { className: 'acryl-ui-field' },
    h('label', { htmlFor: id, className: 'acryl-ui-label' }, label),
    h(Input, { id, value, placeholder, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? noteId : undefined, onChange: event => onChange(event.target.value) }),
    error ? h('p', { id: noteId, role: 'alert', className: 'acryl-ui-error' }, error) : hint ? h('p', { id: noteId, className: 'acryl-ui-hint' }, hint) : null)
}

exports.SwitchField = function SwitchField({ label, checked, onChange, hint }) {
  ensureStyles()
  return h('div', { className: 'acryl-ui-switch-row' },
    h(Switch, { checked, onChange, label }),
    hint ? h('p', { className: 'acryl-ui-hint' }, hint) : null)
}

exports.EmptyState = function EmptyState({ title, description, action }) {
  ensureStyles()
  return h('div', { className: 'acryl-ui-empty' },
    h('h3', { className: 'acryl-ui-empty-title' }, title),
    description ? h('p', { className: 'acryl-ui-empty-description' }, description) : null,
    action ?? null)
}

// Slot helpers: each is `ctx.slots.inject(<slot>, () => ctx.slots.register(...))`, so registration waits for the slot's own declaration and load order
// does not matter. `ctx` is the client plugin context (the consumer must declare `inject: ['slots']`).
const slotHelper = slot => (ctx, { id, order = 50, label }, component) =>
  ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, id, order, label }, component))
exports.footerAction = slotHelper('sidebar.footer.action')
exports.headerAction = slotHelper('conversation.session.header.actions')
exports.sidebarTab = slotHelper('sidebar.right.pane.tab')

exports.version = '0.1.0'
exports.apply = function apply() {}

return module.exports; } });
