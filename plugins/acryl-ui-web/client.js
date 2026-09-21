// acryl-ui-web (browser half). A LIBRARY: it fills no slot itself. Other client bundles `require('acryl-ui-web')` after listing it in
// `dsh.client.inject`. Built from the app's own primitives and `--dsw-alias-*` tokens, so it follows light/dark and any theme override.
// The client loader treats every module as a plugin, so this module also exports an (empty) `apply`.
window.__ModuleLoader__.load({ id: 'acryl-ui-web', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
const { Input, Switch, Button, Menu, Modal, IconChevronDownOutline14 } = primitives
const h = React.createElement

const GAPS = { xs: 4, sm: 8, md: 12, lg: 20 }
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const STYLE_ID = 'acryl-ui-web-styles'
const CSS = `
/* the app defines its --dsw-alias-* tokens on body, not :root, so the roles must be declared on body to resolve them */
body { --acryl-text: var(--dsw-alias-label-primary); --acryl-text-muted: var(--dsw-alias-label-tertiary); --acryl-text-dimmed: var(--dsw-alias-label-dimmed); --acryl-surface: var(--dsw-alias-bg-layer-1); --acryl-surface-raised: var(--dsw-alias-bg-layer-2); --acryl-border: var(--dsw-alias-border-l4); --acryl-primary: var(--dsw-alias-brand-primary); --acryl-success: var(--dsw-alias-state-success-primary); --acryl-warning: var(--dsw-alias-state-warn-primary); --acryl-error: var(--dsw-alias-state-error-primary); --acryl-info: var(--dsw-alias-button-info-fill); --acryl-accent: light-dark(#4F46E5, #818CF8); --acryl-reasoning: light-dark(#7C3AED, #A855F7); }
.acryl-ui-card { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border: 0.5px solid var(--acryl-border); border-radius: 12px; background: var(--acryl-surface); color: var(--acryl-text); }
.acryl-ui-card-title { margin: 0; font-size: 14px; font-weight: 500; line-height: 20px; }
.acryl-ui-card-footer { display: flex; justify-content: flex-end; gap: 8px; }
.acryl-ui-field { display: flex; flex-direction: column; gap: 6px; }
.acryl-ui-label { color: var(--acryl-text); font-size: 13px; line-height: 18px; }
.acryl-ui-hint { margin: 0; color: var(--acryl-text-muted); font-size: 12px; line-height: 16px; }
.acryl-ui-error { margin: 0; color: var(--acryl-error); font-size: 12px; line-height: 16px; }
.acryl-ui-switch-row { display: flex; flex-direction: column; gap: 4px; }
.acryl-ui-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 16px; text-align: center; color: var(--acryl-text-muted); }
.acryl-ui-empty-title { margin: 0; color: var(--acryl-text); font-size: 14px; font-weight: 500; }
.acryl-ui-empty-description { margin: 0; font-size: 12px; line-height: 18px; }

.acryl-ui-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--acryl-border); }
.acryl-ui-row:last-child { border-bottom: none; }
.acryl-ui-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.acryl-ui-row-label { color: var(--acryl-text); font-size: 14px; line-height: 20px; }
.acryl-ui-row-description { margin: 0; color: var(--acryl-text-muted); font-size: 12px; line-height: 18px; }
.acryl-ui-row-control { flex: none; }
.acryl-ui-segmented { display: flex; gap: 8px; }
.acryl-ui-segment { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 12px; border: 0.5px solid var(--acryl-border); border-radius: 12px; background: transparent; color: var(--acryl-text); font: inherit; font-size: 14px; cursor: pointer; }
.acryl-ui-segment:hover { background: var(--acryl-surface-raised); }
.acryl-ui-segment[aria-checked="true"] { background: var(--acryl-surface-raised); border-color: var(--acryl-primary); }
.acryl-ui-segment:focus-visible, .acryl-ui-tab:focus-visible { outline: 2px solid var(--acryl-primary); outline-offset: 2px; }
.acryl-ui-tabs { display: flex; gap: 4px; border-bottom: 0.5px solid var(--acryl-border); }
.acryl-ui-tab { padding: 8px 12px; border: none; border-bottom: 2px solid transparent; background: transparent; color: var(--acryl-text-muted); font: inherit; font-size: 14px; cursor: pointer; }
.acryl-ui-tab[aria-selected="true"] { color: var(--acryl-text); border-bottom-color: var(--acryl-primary); }
.acryl-ui-select-trigger { display: inline-flex; align-items: center; gap: 6px; }
.acryl-ui-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
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


// The controls below reuse what the app already ships (Button, Menu, Modal, Switch, Tag, Pill, Toast come straight from its primitives) and add only what it
// lacks (segmented tiles, tabs, a settings row), so a screen built from this library looks like the app's own Settings.
exports.SettingsRow = function SettingsRow({ label, description, children }) {
  ensureStyles()
  return h('div', { className: 'acryl-ui-row' },
    h('div', { className: 'acryl-ui-row-text' },
      h('span', { className: 'acryl-ui-row-label' }, label),
      description ? h('p', { className: 'acryl-ui-row-description' }, description) : null),
    h('div', { className: 'acryl-ui-row-control' }, children))
}

exports.SelectField = function SelectField({ options, value, onChange, placeholder = 'Select', label }) {
  ensureStyles()
  const [open, setOpen] = React.useState(false)
  const current = options.find(option => option.id === value)
  const trigger = h(Button, { variant: 'ghost', 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-label': label, onClick: () => setOpen(v => !v) },
    h('span', { className: 'acryl-ui-select-trigger' }, current ? current.label : placeholder, IconChevronDownOutline14 ? h(IconChevronDownOutline14, {}) : null))
  return h(Menu, { open, anchor: trigger, items: options.map(o => ({ id: o.id, label: o.label, disabled: o.disabled })), selectedId: value, portal: true, align: 'end',
    onSelect: id => { setOpen(false); onChange(id) }, onClose: () => setOpen(false) })
}

exports.Segmented = function Segmented({ label, options, value, onChange }) {
  ensureStyles()
  return h('div', { className: 'acryl-ui-segmented', role: 'radiogroup', 'aria-label': label },
    options.map(option => h('button', {
      key: option.id, type: 'button', role: 'radio', className: 'acryl-ui-segment', 'aria-checked': option.id === value, tabIndex: option.id === value ? 0 : -1,
      onClick: () => onChange(option.id),
      onKeyDown: event => {
        const i = options.findIndex(o => o.id === value)
        const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? options[(i + 1) % options.length] : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? options[(i - 1 + options.length) % options.length] : undefined
        if (next) { event.preventDefault(); onChange(next.id) }
      },
    }, option.icon ?? null, option.label)))
}

exports.Tabs = function Tabs({ tabs, value, onChange, label, children }) {
  ensureStyles()
  const base = useId('acryl-tabs')
  return h('div', null,
    h('div', { className: 'acryl-ui-tabs', role: 'tablist', 'aria-label': label },
      tabs.map(tab => h('button', {
        key: tab.id, type: 'button', role: 'tab', id: `${base}-tab-${tab.id}`, className: 'acryl-ui-tab', 'aria-selected': tab.id === value, 'aria-controls': `${base}-panel`, tabIndex: tab.id === value ? 0 : -1,
        onClick: () => onChange(tab.id),
        onKeyDown: event => {
          const i = tabs.findIndex(t => t.id === value)
          const next = event.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : undefined
          if (next) { event.preventDefault(); onChange(next.id) }
        },
      }, tab.label))),
    h('div', { role: 'tabpanel', id: `${base}-panel`, 'aria-labelledby': `${base}-tab-${value}` }, children))
}

exports.Dialog = function Dialog({ open, title, onClose, onConfirm, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, children }) {
  ensureStyles()
  return h(Modal, { open, onClose, title, closeLabel: cancelLabel,
    footer: h('div', { className: 'acryl-ui-dialog-actions' },
      h(Button, { variant: 'ghost', onClick: onClose }, cancelLabel),
      h(Button, { variant: 'primary', onClick: () => { onConfirm(); onClose() }, 'data-danger': danger || undefined }, confirmLabel)) }, children)
}

// Straight re-exports, so a consumer needs one import for everything the library recommends.
for (const name of ['Button', 'Tag', 'Pill', 'Toast', 'Modal', 'Tooltip']) if (primitives[name]) exports[name] = primitives[name]

exports.roles = Object.freeze(Object.fromEntries(['text', 'textMuted', 'textDimmed', 'surface', 'surfaceRaised', 'border', 'primary', 'success', 'warning', 'error', 'info', 'accent', 'reasoning']
  .map(role => [role, `var(--acryl-${role.replace(/[A-Z]/g, c => '-' + c.toLowerCase())})`])))

// Slot helpers: each is `ctx.slots.inject(<slot>, () => ctx.slots.register(...))`, so registration waits for the slot's own declaration and load order
// does not matter. `ctx` is the client plugin context (the consumer must declare `inject: ['slots']`).
const slotHelper = slot => (ctx, { id, order = 50, label }, component) =>
  ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, id, order, label }, component))
exports.footerAction = slotHelper('sidebar.footer.action')
exports.headerAction = slotHelper('conversation.session.header.actions')
exports.sidebarTab = slotHelper('sidebar.right.pane.tab')
exports.settingsSection = slotHelper('settings.section')

exports.version = '0.2.0'
exports.apply = function apply() {}

return module.exports; } });
