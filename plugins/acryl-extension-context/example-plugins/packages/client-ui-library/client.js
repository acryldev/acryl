// Example: ui-library.gallery  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  build a Settings page (`ui.settingsSection`) from `acryl-ui-web` instead of hand-styling: `require('acryl-ui-web')` gives Card, Field, SwitchField, SettingsRow, SelectField,
//           Segmented, Tabs, Dialog, EmptyState, Stack, the app's Button/Tag/Pill/Toast/Modal re-exported, the semantic color roles, and slot helpers. List
//           "acryl-ui-web" in `dsh.client.inject` (package.json). The library already follows light and dark; use `ui.roles.<role>` for any color of your own.
// Expect:   a "UI library" entry in the Settings screen's left navigation; its page has tabs: Components, Settings form, Colors.
// Docs:     extending.ui-library
window.__ModuleLoader__.load({ id: 'acryl-example-ui-library', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const ui = require('acryl-ui-web')
const h = React.createElement
const { Stack, Card, Field, SwitchField, SettingsRow, SelectField, Segmented, Tabs, Dialog, EmptyState, Button, Tag, Pill } = ui

function Components() {
  const [name, setName] = React.useState('')
  const [on, setOn] = React.useState(true)
  return h(Stack, { gap: 'md' },
    h(Card, { title: 'Card with a form', footer: h(Button, { variant: 'primary', size: 'sm', disabled: name === '' }, 'Save') },
      h(Field, { label: 'Name', value: name, onChange: setName, hint: 'Shown in the header', error: name.length > 12 ? 'Too long (max 12)' : undefined }),
      h(SwitchField, { label: 'Loud mode', checked: on, onChange: setOn, hint: 'Uppercase everything' })),
    h(Stack, { direction: 'row', gap: 'sm', align: 'center' }, h(Tag, null, 'Tag'), h(Pill, null, 'Pill'), h(Button, { variant: 'ghost', size: 'sm' }, 'Ghost button')),
    h(EmptyState, { title: 'Nothing yet', description: 'Saved items appear here' }))
}

function SettingsForm() {
  const [permission, setPermission] = React.useState('write')
  const [theme, setTheme] = React.useState('system')
  const [queue, setQueue] = React.useState(true)
  const [confirm, setConfirm] = React.useState(false)
  return h('div', null,
    h(SettingsRow, { label: 'Permission', description: 'Choose the default permission mode for new sessions' },
      h(SelectField, { label: 'Permission', value: permission, onChange: setPermission, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] })),
    h(SettingsRow, { label: 'Appearance' }, h(Segmented, { label: 'Appearance', value: theme, onChange: setTheme, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] })),
    h(SettingsRow, { label: 'Queue while busy', description: 'What Enter does while the agent is running' }, h(SwitchField, { label: 'Queue', checked: queue, onChange: setQueue })),
    h(SettingsRow, { label: 'Reset settings', description: 'Restores every default' }, h(Button, { variant: 'ghost', size: 'sm', onClick: () => setConfirm(true) }, 'Reset')),
    h(Dialog, { open: confirm, title: 'Reset settings?', onClose: () => setConfirm(false), onConfirm: () => { setPermission('write'); setTheme('system'); setQueue(true) }, confirmLabel: 'Reset', danger: true }, 'This restores every setting to its default.'))
}

function Colors() {
  return h(Stack, { gap: 'sm' }, Object.entries(ui.roles).map(([role, value]) =>
    h(Stack, { key: role, direction: 'row', gap: 'md', align: 'center' },
      h('span', { style: { width: 28, height: 28, borderRadius: 8, border: '0.5px solid ' + ui.roles.border, background: value }, 'aria-hidden': true }),
      h('code', null, role))))
}

// A Settings page, not a dialog: the gallery is a catalogue for people building UI, so it lives in Settings (nav entry "UI library"), out of the everyday screens.
function Gallery() {
  const [tab, setTab] = React.useState('components')
  return h(Stack, { gap: 'md' },
    h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 500, color: ui.roles.text } }, 'ACRYL UI library'),
    h('p', { style: { margin: 0, color: ui.roles.textMuted, fontSize: 13 } }, 'Ready-made parts for building screens: use them instead of hand-styling.'),
    h(Tabs, { label: 'Gallery sections', value: tab, onChange: setTab, tabs: [{ id: 'components', label: 'Components' }, { id: 'settings', label: 'Settings form' }, { id: 'colors', label: 'Colors' }] },
      tab === 'components' ? h(Components) : tab === 'settings' ? h(SettingsForm) : h(Colors)))
}

exports.inject = ['slots']
exports.apply = function apply(ctx) { ui.settingsSection(ctx, { id: 'example-ui-library', order: 90, label: 'UI library' }, Gallery) }

return module.exports; } });
