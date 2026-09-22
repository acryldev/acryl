// Example: ui-library.gallery  (browser half)
// Type:     client-slot
// Surfaces: web desktop
// Teaches:  build a Settings page (`ui.settingsSection`) from `acryl-ui-web` instead of hand-styling: `require('acryl-ui-web')` gives Card, Field, SwitchField, SettingsRow, SelectField,
//           Segmented, Tabs, Dialog, EmptyState, Stack, the app's Button/Tag/Pill/Toast/Modal re-exported, the semantic color roles, and slot helpers. List
//           "acryl-ui-web" in `dsh.client.inject` (package.json). The library already follows light and dark; use `ui.roles.<role>` for any color of your own.
// Expect:   a "UI library" entry in the Settings screen's left navigation; its page has tabs: Components, Settings form, Conversation, Colors (DSH token names).
// Docs:     extending.ui-library
window.__ModuleLoader__.load({ id: 'acryl-example-ui-library', factory: (require) => {
var module = { exports: {} }; var exports = module.exports;

const React = require('react')
const ui = require('acryl-ui-web')
const h = React.createElement
const { Stack, Card, Field, SwitchField, SettingsRow, SelectField, Segmented, Tabs, Dialog, EmptyState, Button, Tag, Pill } = ui
const { StateDot, DisclosureRow, Switch, Input, JsonTree, TerminalBlock, ReadBlock, DiffBlock, RiskConfirmation, ConnectionIndicator } = ui

// Every part below is live: type, click, toggle, open. The catalogue is the point, so each entry is a working instance, not a picture.
function Section({ name, note, children }) {
  return h(Card, { title: name }, h('p', { style: { margin: '0 0 12px', color: ui.roles.textMuted, fontSize: 12 } }, note), children)
}

function Components() {
  const [name, setName] = React.useState('')
  const [on, setOn] = React.useState(true)
  const [clicks, setClicks] = React.useState(0)
  const [tab, setTab] = React.useState('one')
  const [pick, setPick] = React.useState('write')
  const [seg, setSeg] = React.useState('dark')
  const [modal, setModal] = React.useState(false)
  const [answer, setAnswer] = React.useState('nothing yet')
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'Button', note: 'ui.Button: primary, ghost, disabled. Click them.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Button, { variant: 'primary', size: 'sm', onClick: () => setClicks(clicks + 1) }, 'Primary (' + clicks + ')'),
        h(ui.Button, { variant: 'ghost', size: 'sm', onClick: () => setClicks(0) }, 'Reset'),
        h(ui.Button, { variant: 'primary', size: 'sm', disabled: true }, 'Disabled'))),
    h(Section, { name: 'Field and SwitchField', note: 'Type in the field; more than 12 characters shows the error state.' },
      h(Field, { label: 'Name', value: name, onChange: setName, hint: 'Shown in the header', error: name.length > 12 ? 'Too long (max 12)' : undefined }),
      h(SwitchField, { label: 'Loud mode', checked: on, onChange: setOn, hint: on ? 'On: uppercase everything' : 'Off' })),
    h(Section, { name: 'SelectField and Segmented', note: 'Open the menu; pick a tile. The value shown below each is live.' },
      h(SelectField, { label: 'Permission', value: pick, onChange: setPick, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] }),
      h(Segmented, { title: 'Appearance', value: seg, onChange: setSeg, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] }),
      h('p', { style: { margin: '8px 0 0', color: ui.roles.textMuted, fontSize: 12 } }, 'permission = ' + pick + ', appearance = ' + seg)),
    h(Section, { name: 'Tabs', note: 'Arrow keys move between tabs.' },
      h(ui.Tabs, { label: 'Demo', value: tab, onChange: setTab, tabs: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }, h('p', { style: { margin: 0 } }, 'Panel ' + tab))),
    h(Section, { name: 'Tag, Pill, Tooltip', note: 'Hover the button for the tooltip.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Tag, null, 'Tag'), h(ui.Pill, null, 'Pill'),
        h(ui.Tooltip, { label: 'This is a tooltip' }, h(ui.Button, { variant: 'ghost', size: 'sm' }, 'Hover me')))),
    h(Section, { name: 'Dialog', note: 'A confirm dialog over the app Modal.' },
      h(Stack, { direction: 'row', gap: 'sm', align: 'center' },
        h(ui.Button, { variant: 'primary', size: 'sm', onClick: () => setModal(true) }, 'Open dialog'),
        h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'last answer: ' + answer)),
      h(Dialog, { open: modal, title: 'Delete item?', onClose: () => setModal(false), onConfirm: () => setAnswer('confirmed'), confirmLabel: 'Delete' }, 'This cannot be undone.')),
    h(EmptyState, { title: 'Nothing yet', description: 'Saved items appear here' }))
}

// The 15 primitives re-exported straight from the app this pass (spec 038-ui-component-library T035). Each one below is real, live output, not a mock; the tool
// blocks are given real-shaped fixture data so the truncation, copy button and status pill all behave as they would on a real tool call.
function Blocks() {
  const [open, setOpen] = React.useState(false)
  const [risk, setRisk] = React.useState(false)
  const [ack, setAck] = React.useState(false)
  return h(Stack, { gap: 'md' },
    h(Section, { name: 'StateDot and ConnectionIndicator', note: 'Status dots used by ToolCallCard and the connection banner.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(StateDot, { state: 'done' }), h(StateDot, { state: 'error' }), h(StateDot, { state: 'ongoing' }),
        h(ConnectionIndicator, { state: 'connected' }))),
    h(Section, { name: 'DisclosureRow', note: 'The collapsible row ToolCallCard is built on.' },
      h(DisclosureRow, { icon: h(StateDot, { state: 'done' }), title: 'Read', open, expandable: true, onToggle: () => setOpen(!open), collapsedContent: h('span', null, 'a.ts') }, h('p', { style: { margin: 0 } }, 'expanded body')),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'open = ' + open)),
    h(Section, { name: 'Switch and Input (bare)', note: 'The primitives SwitchField and Field build on; Switch needs its own visible label, Input has none.' },
      h(Stack, { direction: 'row', gap: 'md', align: 'center' },
        h(Switch, { checked: risk, onChange: setRisk, label: 'Bare switch' }), h(Input, { value: '', onChange: () => {} }))),
    h(Section, { name: 'TerminalBlock', note: 'A settled command with a non-zero exit.' },
      h(TerminalBlock, { command: 'pnpm test', output: '1 failing\n  expected true to be false', exitCode: 1, labels: { signal: s => 'signal ' + s, exitCode: c => 'exit ' + c, running: 'Running', failed: 'Failed', done: 'Done', copy: 'Copy', copied: 'Copied', noOutput: 'No output', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more' } })),
    h(Section, { name: 'ReadBlock', note: 'A file window with line numbers.' },
      h(ReadBlock, { label: 'src/index.ts', totalLines: 42, lines: [{ number: 1, text: 'export const x = 1' }, { number: 2, text: 'export const y = 2' }], labels: { window: (n, t) => 'Showing ' + n + ' of ' + t, copy: 'Copy', copied: 'Copied', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more', collapse: 'Collapse', expand: n => 'Show ' + n + ' more' } })),
    h(Section, { name: 'DiffBlock', note: 'One hunk, added and removed lines.' },
      h(DiffBlock, { diffs: [{ path: 'src/index.ts', oldText: 'const x = 1\n', newText: 'const x = 2\n' }], labels: { copy: 'Copy', copied: 'Copied', collapseAria: 'Collapse', expandAria: n => 'Show ' + n + ' more', collapse: 'Collapse', expand: n => 'Show ' + n + ' more', files: n => n + ' file' } })),
    h(Section, { name: 'JsonTree', note: 'A collapsible tree; click a row to expand.' },
      h(JsonTree, { data: { name: 'acryl', tags: ['ui', 'cordis'] }, label: 'Demo JSON', labels: { copyValue: 'Copy value', copyJson: 'Copy JSON', copyPath: 'Copy path', copyPrettyJson: 'Copy pretty', copyCompactJson: 'Copy compact', copied: 'Copied', copyFailed: 'Copy failed', collapseNode: 'Collapse', expandNode: 'Expand' } })),
    h(Section, { name: 'RiskConfirmation', note: 'The app\'s own destructive-confirmation control (Dialog has no danger state on web); the confirm button stays disabled until acknowledged is checked.' },
      h(RiskConfirmation, { open: true, title: 'Delete workspace?', description: 'This removes every session in it. This cannot be undone.', acknowledgeLabel: 'I understand this cannot be undone', cancelLabel: 'Cancel', closeLabel: 'Close', confirmLabel: 'Delete', acknowledged: ack, onAcknowledgedChange: setAck, onCancel: () => setAck(false), onConfirm: () => {} })))
}

function SettingsForm() {
  const [permission, setPermission] = React.useState('write')
  const [theme, setTheme] = React.useState('system')
  const [queue, setQueue] = React.useState(true)
  const [confirm, setConfirm] = React.useState(false)
  return h('div', null,
    h(SettingsRow, { label: 'Permission', description: 'Choose the default permission mode for new sessions' },
      h(SelectField, { label: 'Permission', value: permission, onChange: setPermission, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] })),
    h(Segmented, { title: 'Appearance', value: theme, onChange: setTheme, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] }),
    h(SettingsRow, { label: 'Queue while busy', description: 'What Enter does while the agent is running' }, h(SwitchField, { label: 'Queue', checked: queue, onChange: setQueue })),
    h(SettingsRow, { label: 'Reset settings', description: 'Restores every default' }, h(Button, { variant: 'ghost', size: 'sm', onClick: () => setConfirm(true) }, 'Reset')),
    h(Dialog, { open: confirm, title: 'Reset settings?', onClose: () => setConfirm(false), onConfirm: () => { setPermission('write'); setTheme('system'); setQueue(true) }, confirmLabel: 'Reset', danger: true }, 'This restores every setting to its default.'))
}

// The app's own tokens: each swatch is the DSH token the role resolves to, so nothing here is a color of our own except the two registered through the theme service.
function Colors() {
  return h(Stack, { gap: 'sm' }, Object.entries(ui.roles).map(([role, value]) =>
    h(Stack, { key: role, direction: 'row', gap: 'md', align: 'center' },
      h('span', { style: { width: 28, height: 28, borderRadius: 8, border: '0.5px solid ' + ui.roles.border, background: value }, 'aria-hidden': true }),
      h('code', null, value.replace(/^var\((.*)\)$/u, '$1')),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, role))))
}

const labels = { input: 'IN', output: 'OUT', running: 'Running', failed: 'Failed', stopped: 'Stopped' }
const dot = h('span', { 'aria-hidden': true }, '\u25B8')

// The conversation's tool-call row and the sidebar's New Session bar, extracted from the app itself.
function Conversation() {
  const [wide, setWide] = React.useState(true)
  return h(Stack, { gap: 'md' },
    h(ui.ToolCallCard, { icon: dot, title: 'Read', summary: 'src/index.ts', state: 'ok', input: 'src/index.ts', output: '42 lines', labels }),
    h(ui.ToolCallCard, { icon: dot, title: 'Bash', summary: 'pnpm test', state: 'running', input: 'pnpm test', labels }),
    h(ui.ToolCallCard, { icon: dot, title: 'Bash', summary: 'pnpm build', errorSummary: 'exit code 1', state: 'error', input: 'pnpm build', output: 'error TS2304', labels }),
    h(Stack, { direction: 'row', gap: 'md', align: 'center' },
      h('div', { style: { width: wide ? 220 : 56 } }, h(ui.SidebarRow, { icon: dot, label: 'New session', wide, onClick: () => setWide(!wide) })),
      h('span', { style: { color: ui.roles.textMuted, fontSize: 12 } }, 'Click to switch between the wide sidebar and the rail')))
}

// A Settings page, not a dialog: the gallery is a catalogue for people building UI, so it lives in Settings (nav entry "UI library"), out of the everyday screens.
function Gallery() {
  const [tab, setTab] = React.useState('components')
  return h(Stack, { gap: 'md' },
    h('h2', { style: { margin: 0, fontSize: 18, fontWeight: 500, color: ui.roles.text } }, 'ACRYL UI library'),
    h('p', { style: { margin: 0, color: ui.roles.textMuted, fontSize: 13 } }, 'Ready-made parts for building screens: use them instead of hand-styling.'),
    h(Tabs, { label: 'Gallery sections', value: tab, onChange: setTab, tabs: [{ id: 'components', label: 'Components' }, { id: 'settings', label: 'Settings form' }, { id: 'conversation', label: 'Conversation' }, { id: 'blocks', label: 'Blocks' }, { id: 'colors', label: 'Colors' }] },
      tab === 'components' ? h(Components) : tab === 'settings' ? h(SettingsForm) : tab === 'conversation' ? h(Conversation) : tab === 'blocks' ? h(Blocks) : h(Colors)))
}

exports.inject = ['slots']
exports.apply = function apply(ctx) { ui.settingsSection(ctx, { id: 'example-ui-library', order: 90, label: 'UI library' }, Gallery) }

return module.exports; } });
