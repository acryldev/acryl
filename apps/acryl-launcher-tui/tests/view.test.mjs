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

function open(mode = 'dark', more = {}) {
  const results = []
  const view = createLauncherView({ context: { ...context, ...more }, theme: paletteTheme(mode), finish: result => results.push(result) })
  const press = async (...keys) => { for (const key of keys) { view.handleInput(key); await view.settled } }
  return { view, results, press, screen: (width = 80) => plain(view.render(width)) }
}

test('Enter five times: an app made from the defaults, and the command shown is the one handed back to run', async () => {
  const { press, results, screen } = open()
  assert.match(screen(), /No apps yet/u)
  assert.match(screen(), /\+ New app/u)
  await press(KEY.enter) // + New app
  assert.match(screen(), /Which folder should it live in/u)
  await press(KEY.enter) // the suggested folder
  assert.match(screen(), /Name of the app/u)
  assert.match(screen(), /my-app/u)
  await press(KEY.enter) // my-app
  assert.match(screen(), /Start from/u)
  await press(KEY.enter) // Blank
  assert.match(screen(), /acryl new my-app blank/u)
  await press(KEY.enter) // run
  assert.deepEqual(results, [{ command: { program: 'acryl', args: ['new', 'my-app', 'blank'], cwd: '.', ensureCwd: false }, line: 'acryl new my-app blank' }])
})

test('Esc goes back one step, then to the list, then quits; Ctrl-C quits from anywhere', async () => {
  const first = open()
  await first.press(KEY.down, KEY.enter) // Blends store
  assert.match(first.screen(), /Which Blend/u)
  assert.match(first.screen(), /notes for a team/u, "the highlighted Blend is described whole")
  await first.press(KEY.enter, KEY.enter) // Notes, the suggested folder
  assert.match(first.screen(), /notes-desktop/u)
  await first.press(KEY.esc)
  assert.match(first.screen(), /Which folder should it live in/u)
  await first.press(KEY.esc, KEY.esc)
  assert.match(first.screen(), /No apps yet/u, "going back from the first step is the home screen")
  await first.press(KEY.esc)
  assert.deepEqual(first.results, [undefined])

  const second = open()
  await second.press(KEY.enter, KEY.ctrlC)
  assert.deepEqual(second.results, [undefined])
})

const shop = { id: 'shop', path: '/home/me/ACRYL/shop', blend: 'acrylblends.notes', madeBy: 'person', state: 'ready' }
const gone = { id: 'old', path: '/home/me/ACRYL/old', blend: 'acrylblends.todo', madeBy: 'agent', state: 'missing' }

test('the home screen lists the apps on this machine; Enter opens one, u updates it, p pulls a plugin into it', async () => {
  const withApps = () => open('dark', { registeredApps: () => [shop, gone] })
  const first = withApps()
  assert.match(first.screen(), /Your apps \(2\)/u)
  assert.match(first.screen(), /shop {2,}ready {2}acrylblends\.notes/u)
  assert.match(first.screen(), /│ \/home\/me\/ACRYL\/shop +│/u, 'the highlighted app shows its whole path')
  assert.match(first.screen(), /old {2,}missing/u)
  assert.match(first.screen(), /\+ New app/u)
  await first.press(KEY.enter)
  assert.deepEqual(first.results, [], 'opening needs one more Enter: the command is shown first')
  assert.match(first.screen(), /cd \/home\/me\/ACRYL\/shop && npm run dev/u)
  await first.press(KEY.enter)
  assert.deepEqual(first.results[0].command, { program: 'npm', args: ['run', 'dev'], cwd: '/home/me/ACRYL/shop' })

  const update = withApps()
  await update.press('u')
  assert.match(update.screen(), /cd \/home\/me\/ACRYL\/shop && acryl update/u)
  const pull = withApps()
  await pull.press('p')
  assert.match(pull.screen(), /Plugin to pull/u)
  assert.equal(pull.screen().includes('Which app'), false, 'the app picked on the list is not asked again')
  const missing = withApps()
  await missing.press(KEY.down, KEY.enter)
  assert.match(missing.screen(), /Your apps/u, 'an app whose folder is gone does not open')
  // u and p on an action row do nothing.
  const none = withApps()
  await none.press(KEY.down, KEY.down, 'u')
  assert.match(none.screen(), /Your apps/u)
})

test('a wrong name is said on the screen and the step stays', async () => {
  const { press, screen, view } = open()
  await press(KEY.enter, KEY.enter)
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
    await press(KEY.enter); check()
  }
  const crowded = open('dark', { registeredApps: () => [shop, gone] })
  for (const width of [40, 60, 80, 120]) for (const line of crowded.view.render(width)) assert.ok(visibleWidth(line) <= width, `home ${width}: ${line}`)
})
