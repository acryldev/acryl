import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { visibleWidth } from '@earendil-works/pi-tui'
import { createTuiUi, defaultTheme } from '../index.js'
import * as library from '../index.js'
import { palettes } from '../palette.js'

const contract = JSON.parse(readFileSync(fileURLToPath(new URL('../../acryl-ui-web/contracts/components.json', import.meta.url)), 'utf8'))
const RIGHT = '\x1b[C'; const LEFT = '\x1b[D'; const ENTER = '\r'; const ESC = '\x1b'
const WIDTHS = [12, 24, 40, 80, 200]
const LONG = 'A label that is far longer than any of the narrow terminals in this test can show'

test('the library exports exactly the components the shared contract assigns to the terminal', () => {
  const expected = Object.entries(contract.components).filter(([, c]) => c.surfaces.includes('tui')).map(([name]) => name).sort()
  const exported = Object.keys(library).filter(k => !['createTuiUi', 'defaultTheme'].includes(k)).sort()
  assert.deepEqual(exported, expected)
})

function built(ui) {
  const seg = ui.Segmented({ label: LONG, options: [{ id: 'a', label: 'Light' }, { id: 'b', label: 'Dark' }, { id: 'c', label: LONG }], value: 'a' })
  return {
    Stack: ui.Stack({ children: [LONG, ui.EmptyState({ title: LONG, description: LONG })], gap: 1 }),
    Card: ui.Card({ title: LONG, body: [LONG, 'second line'], footer: LONG }),
    Field: ui.Field({ label: LONG, value: LONG, hint: LONG, error: LONG }),
    SettingsRow: ui.SettingsRow({ label: LONG, description: LONG, control: seg }),
    SelectField: ui.SelectField({ label: LONG, options: [{ id: 'x', label: LONG }], value: 'x' }),
    Segmented: seg,
    Tabs: ui.Tabs({ tabs: [{ id: 'a', label: LONG }, { id: 'b', label: LONG }], value: 'a', panel: () => LONG }),
    SwitchField: ui.SwitchField({ label: LONG, hint: LONG, checked: true }),
    EmptyState: ui.EmptyState({ title: LONG, description: LONG }),
    Dialog: ui.Dialog({ title: LONG, message: LONG, confirmLabel: LONG, cancelLabel: LONG }),
  }
}

test('no component ever renders a line wider than the terminal (12, 24, 40, 80 and 200 columns)', () => {
  const ui = createTuiUi()
  for (const [name, component] of Object.entries(built(ui))) {
    for (const width of WIDTHS) {
      const out = component.render(width)
      assert.ok(Array.isArray(out) && out.length > 0, `${name} renders lines at ${width}`)
      for (const line of out) assert.ok(visibleWidth(line) <= width, `${name} at ${width} columns: a line is ${visibleWidth(line)} wide: ${JSON.stringify(line)}`)
    }
  }
})

test('every component is a real component: render, invalidate, and (interactive ones) handleInput', () => {
  for (const [name, component] of Object.entries(built(createTuiUi()))) {
    assert.equal(typeof component.render, 'function', name); assert.equal(typeof component.invalidate, 'function', name)
  }
  for (const name of ['Field', 'SelectField', 'Segmented', 'Tabs', 'SwitchField', 'Dialog']) assert.equal(typeof built(createTuiUi())[name].handleInput, 'function', `${name} takes keys`)
})

test('Segmented, SelectField and Tabs move with the arrow keys and wrap', () => {
  const ui = createTuiUi(); const seen = []
  const options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
  const segmented = ui.Segmented({ options, value: 'a', onChange: id => seen.push(['seg', id]) })
  segmented.handleInput(RIGHT); segmented.handleInput(RIGHT); segmented.handleInput(LEFT)
  const select = ui.SelectField({ options, value: 'a', onChange: id => seen.push(['sel', id]) })
  select.handleInput(LEFT)
  const tabs = ui.Tabs({ tabs: options, value: 'a', onChange: id => seen.push(['tab', id]) })
  assert.equal(tabs.handleInput(RIGHT), true)
  assert.deepEqual(seen, [['seg', 'b'], ['seg', 'a'], ['seg', 'b'], ['sel', 'b'], ['tab', 'b']])
  assert.match(segmented.render(80)[0], /\[ B \]/u)
})

test('SwitchField toggles with space or enter; Dialog confirms with y or enter and cancels with n or escape', () => {
  const ui = createTuiUi(); const events = []
  const sw = ui.SwitchField({ label: 'Loud', onChange: v => events.push(['switch', v]) })
  sw.handleInput(' '); sw.handleInput(ENTER)
  const dialog = ui.Dialog({ title: 'Reset?', message: 'Sure?', onConfirm: () => events.push('confirm'), onCancel: () => events.push('cancel') })
  dialog.handleInput('y'); dialog.handleInput(ENTER); dialog.handleInput('n'); dialog.handleInput(ESC)
  assert.equal(dialog.handleInput('x'), false, 'unrelated keys are not swallowed')
  assert.deepEqual(events, [['switch', true], ['switch', false], 'confirm', 'confirm', 'cancel', 'cancel'])
  assert.match(sw.render(40)[0], /\[ \]/u)
})

test('Field edits through the pi-tui Input, reports changes, shows the error in place of the hint', () => {
  const ui = createTuiUi(); const changes = []
  const field = ui.Field({ label: 'Name', hint: 'shown in the header', onChange: v => changes.push(v) })
  field.handleInput('a'); field.handleInput('b')
  assert.equal(field.value, 'ab'); assert.deepEqual(changes, ['a', 'ab'])
  assert.ok(field.render(40).join('\n').includes('shown in the header'))
  field.setError('Too long')
  const text = field.render(40).join('\n'); assert.ok(text.includes('Too long')); assert.ok(!text.includes('shown in the header'))
})

test('Stack routes keys to the focused child and Card degrades to plain lines when too narrow for a border', () => {
  const ui = createTuiUi(); const received = []
  const a = { render: () => ['a'], handleInput: d => received.push(['a', d]) }; const b = { render: () => ['b'], handleInput: d => received.push(['b', d]) }
  ui.Stack({ children: [a, b], focus: 1 }).handleInput('k')
  assert.deepEqual(received, [['b', 'k']])
  const narrow = ui.Card({ title: 'T', body: ['x'] }).render(6)
  assert.ok(narrow.every(line => !line.includes('╭') && visibleWidth(line) <= 6))
  const wide = ui.Card({ title: 'T', body: ['x'], footer: 'f' }).render(30)
  assert.ok(wide[0].includes('╭') && wide.at(-1).includes('╰'))
})

test('colors come from the theme (the tuiTheme service shape) and follow its mode', () => {
  const asked = []
  const theme = { mode: 'light', color: role => { asked.push(role); return text => `<${role}>${text}` } }
  const ui = createTuiUi(theme)
  const out = ui.Dialog({ title: 'X', message: 'm', danger: true }).render(40).join('\n')
  assert.ok(out.includes('<error>[y]'), 'a danger dialog paints its confirm action with the error role')
  assert.ok(asked.includes('muted'))
  assert.deepEqual(Object.keys(palettes.light), Object.keys(palettes.dark))
  assert.equal(defaultTheme.color('primary')('x'), '\x1b[38;2;79;107;254mx\x1b[0m')   // #4F6BFE, the dark palette
})
