// Example: ui-library.tui-gallery
// Type:     tui-contribution
// Surfaces: tui (a no-op elsewhere)
// Teaches:  build a terminal screen from `acryl-ui-tui` instead of raw pi-tui and hand-picked colors: `createTuiUi(ctx.get('tuiTheme'))` gives Card, Field, SettingsRow,
//           SelectField, Segmented, Tabs, SwitchField, Dialog, EmptyState and Stack, all width-safe and keyboard-driven, painted with the shared semantic roles. Passing the
//           `tuiTheme` service makes the colors follow the terminal's light/dark scheme; without it the components use the static dark palette.
// Expect:   `/gallery` opens a popup with three tabs (Components, Settings form, Colors); Tab switches tabs, arrows and space use the controls, Esc closes.
// Docs:     extending.ui-library
import { createTuiUi, defaultTheme } from 'acryl-ui-tui'

export const name = 'acryl-example-tui-ui-library'

const ROLES = ['primary', 'secondary', 'accent', 'reasoning', 'success', 'warning', 'error', 'info', 'muted']
const ESC = '\x1b'

/** Build the gallery component. Exported so it can be rendered and width-checked without a terminal. */
export function buildGallery(theme, close) {
  const ui = createTuiUi(theme)
  let tab = 'components'
  let confirming = false
  let row = 0
  const state = { permission: 'write', appearance: 'system', queue: true }

  const settingsRows = () => [
    ui.SettingsRow({ label: 'Permission', description: 'Default permission mode for new sessions', focused: row === 0,
      control: ui.SelectField({ value: state.permission, onChange: v => { state.permission = v }, options: [{ id: 'read', label: 'Read Only' }, { id: 'write', label: 'Workspace Write' }, { id: 'full', label: 'Full access' }] }) }),
    ui.SettingsRow({ label: 'Appearance', focused: row === 1,
      control: ui.Segmented({ value: state.appearance, onChange: v => { state.appearance = v }, options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }] }) }),
    ui.SettingsRow({ label: 'Queue while busy', focused: row === 2, control: ui.SwitchField({ label: '', checked: state.queue, onChange: v => { state.queue = v } }) }),
  ]
  const settings = {
    render: width => [...settingsRows().flatMap(r => r.render(width)), '', 'up/down: row   left/right or space: change   r: reset'].map(line => line.slice(0, width * 4)),
    handleInput(data) {
      if (data === `${ESC}[A`) { row = Math.max(0, row - 1); return true }
      if (data === `${ESC}[B`) { row = Math.min(2, row + 1); return true }
      if (data === 'r') { confirming = true; return true }
      return settingsRows()[row].handleInput(data)
    },
    invalidate() {},
  }
  const components = ui.Stack({ gap: 1, children: [
    ui.Card({ title: 'Card with a form', body: [ui.Field({ label: 'Name', hint: 'shown in the header' }), ui.SwitchField({ label: 'Loud mode', checked: true, hint: 'uppercase everything' })], footer: 'Save' }),
    ui.EmptyState({ title: 'Nothing yet', description: 'Saved items appear here' }),
  ] })
  const colors = { render: width => ROLES.map(role => `${theme.color(role)('██')} ${role}`.slice(0, width * 4)), invalidate() {} }
  const panels = { components, settings, colors }
  const tabs = ui.Tabs({ value: tab, onChange: id => { tab = id }, panel: id => panels[id],
    tabs: [{ id: 'components', label: 'Components' }, { id: 'settings', label: 'Settings form' }, { id: 'colors', label: 'Colors' }] })
  const dialog = ui.Dialog({ title: 'Reset settings?', message: 'This restores every setting to its default.', confirmLabel: 'Reset', danger: true,
    onConfirm: () => { state.permission = 'write'; state.appearance = 'system'; state.queue = true; confirming = false }, onCancel: () => { confirming = false } })
  return {
    render: width => [...(confirming ? dialog : ui.Card({ title: 'ACRYL UI library (terminal)', body: [tabs] })).render(width)],
    handleInput(data) {
      if (confirming) return dialog.handleInput(data)
      if (data === ESC) { close(); return true }
      return tabs.handleInput(data)
    },
    invalidate() {},
  }
}

export function apply(ctx) {
  const commands = ctx.get('tuiCommands') // undefined outside the CLI: fine
  if (!commands) return
  const theme = ctx.get('tuiTheme') ?? defaultTheme
  ctx.effect(() => commands.register({
    command: '/gallery',
    description: 'ACRYL terminal UI library gallery (example plugin)',
    packageName: 'acryl-example-tui-ui-library',
    overlay: { width: '70%', anchor: 'center', margin: 2 },
    open: ({ close }) => buildGallery(theme, close),
  }), 'acryl-example-tui-ui-library: /gallery')
}
