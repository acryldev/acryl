import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visibleWidth } from '@earendil-works/pi-tui'
import { paletteTheme } from 'acryl-ui-tui/scheme'
import { createLauncherView } from '../view.js'

const KEY = { enter: '\r', down: '\x1b[B', esc: '\x1b', ctrlC: '\x03' }
const plain = lines => lines.join('\n').replace(/\x1b\[[0-9;]*m/gu, '')

const context = {
  exists: () => false,
  listApps: () => [{ value: 'shop', label: 'shop' }],
  listBlends: async () => [{ value: 'acrylblends.notes-desktop', label: 'Notes', description: 'notes for a team' }],
  listPlugins: () => [{ value: 'cart', label: 'cart' }],
}

function open(mode = 'dark') {
  const results = []
  const view = createLauncherView({ context, theme: paletteTheme(mode), finish: result => results.push(result) })
  const press = async (...keys) => { for (const key of keys) { view.handleInput(key); await view.settled } }
  return { view, results, press, screen: (width = 80) => plain(view.render(width)) }
}

test('Enter, Enter, Enter, Enter: an app made from the defaults, and the command shown is the one handed back to run', async () => {
  const { press, results, screen } = open()
  assert.match(screen(), /What do you want to do\?/u)
  assert.match(screen(), /Create an app/u)
  await press(KEY.enter) // Create an app
  assert.match(screen(), /Name of the app/u)
  assert.match(screen(), /my-app/u)
  await press(KEY.enter) // my-app
  assert.match(screen(), /Start from/u)
  await press(KEY.enter) // Blank
  assert.match(screen(), /acryl new my-app blank/u)
  await press(KEY.enter) // run
  assert.deepEqual(results, [{ command: { program: 'acryl', args: ['new', 'my-app', 'blank'], cwd: '.' }, line: 'acryl new my-app blank' }])
})

test('Esc goes back one step, then to the list, then quits; Ctrl-C quits from anywhere', async () => {
  const first = open()
  await first.press(KEY.down, KEY.enter) // Install a Blend
  assert.match(first.screen(), /Which Blend/u)
  assert.match(first.screen(), /notes for a team/u, "the highlighted Blend is described whole")
  await first.press(KEY.enter) // Notes
  assert.match(first.screen(), /notes-desktop/u)
  await first.press(KEY.esc)
  assert.match(first.screen(), /Which Blend/u)
  await first.press(KEY.esc)
  assert.match(first.screen(), /What do you want to do\?/u)
  assert.match(first.screen(), /→ Install a Blend/u, "the list comes back on the journey that was left")
  await first.press(KEY.esc)
  assert.deepEqual(first.results, [undefined])

  const second = open()
  await second.press(KEY.enter, KEY.ctrlC)
  assert.deepEqual(second.results, [undefined])
})

test('a wrong name is said on the screen and the step stays', async () => {
  const { press, screen, view } = open()
  await press(KEY.enter)
  for (let i = 0; i < 6; i += 1) view.handleInput('\x7f') // backspace my-app away
  await press('B', 'a', 'd', KEY.enter)
  assert.match(screen(), /lower case letters/u)
  assert.match(screen(), /Name of the app/u)
})

test('no line is wider than the terminal, at 80 columns and narrower, in the dark and the light palette', async () => {
  for (const mode of ['dark', 'light']) {
    const { press, view } = open(mode)
    const check = () => { for (const width of [40, 60, 80, 120]) for (const line of view.render(width)) assert.ok(visibleWidth(line) <= width, `${mode} ${width}: ${line}`) }
    check()
    await press(KEY.enter); check()
    await press(KEY.enter); check()
    await press(KEY.enter); check()
  }
})
