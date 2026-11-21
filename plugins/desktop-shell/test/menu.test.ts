import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aboutPlacement,
  aboutText,
  hasSettings,
  type MenuNode,
  settingsPlacement,
} from '../menu.ts'

const item = (label: string, extra: Partial<MenuNode> = {}): MenuNode => ({ label, ...extra })
const separator = item('', { type: 'separator' })
const submenu = (label: string, items: MenuNode[]): MenuNode =>
  item(label, { type: 'submenu', submenu: { items } })

// Electron's default menu on macOS: the application menu first.
const mac = [
  submenu('app', [
    item('About app', { role: 'about' }),
    separator,
    item('Services'),
    item('Hide app'),
    separator,
    item('Quit app', { role: 'quit' }),
  ]),
  submenu('File', [item('Close Window', { role: 'close' })]),
  submenu('Edit', [item('Undo')]),
]
// Electron's default menu on Windows and Linux: no application menu.
const other = [
  submenu('File', [item('Exit', { role: 'quit' })]),
  submenu('Edit', [item('Undo')]),
  submenu('View', [item('Reload')]),
]

test('on macOS the Settings item goes in the application menu under About and its separator', () => {
  assert.deepEqual(settingsPlacement(mac, 'darwin'), { menu: 0, at: 2, separatorAfter: true })
})

test('on Windows and Linux it is the first item of the File menu', () => {
  assert.deepEqual(settingsPlacement(other, 'win32'), { menu: 0, at: 0, separatorAfter: true })
  assert.deepEqual(settingsPlacement(other, 'linux'), { menu: 0, at: 0, separatorAfter: true })
  assert.deepEqual(
    settingsPlacement([submenu('Edit', []), submenu('&File', [item('Exit')])], 'linux'),
    { menu: 1, at: 0, separatorAfter: true },
  )
})

test("a menu with no place for it (an app that replaced Electron's menu) gets nothing, and an application menu without About gets it first", () => {
  assert.equal(settingsPlacement([submenu('Edit', [item('Undo')])], 'linux'), undefined)
  assert.equal(settingsPlacement([], 'darwin'), undefined)
  assert.equal(settingsPlacement([item('app')], 'darwin'), undefined)
  assert.deepEqual(
    settingsPlacement([submenu('app', [item('Quit', { role: 'quit' })])], 'darwin'),
    { menu: 0, at: 0, separatorAfter: true },
  )
})

test('an existing Settings or Preferences item is found at any depth', () => {
  assert.equal(hasSettings(mac), false)
  assert.equal(hasSettings([submenu('File', [item('Settings...')])]), true)
  assert.equal(hasSettings([submenu('app', [submenu('More', [item('Preferences')])])]), true)
})

test('on Windows and Linux About goes at the end of the Help menu, once; macOS and a menu without Help get none', () => {
  const help = submenu('Help', [item('Learn More')])
  const withHelp = [...other, help]
  assert.equal(aboutPlacement(withHelp, 'win32'), 3)
  assert.equal(aboutPlacement([item('x', { role: 'help', submenu: { items: [] } })], 'linux'), 0)
  assert.equal(aboutPlacement(withHelp, 'darwin'), undefined)
  assert.equal(aboutPlacement(other, 'linux'), undefined)
  assert.equal(
    aboutPlacement([submenu('Help', [item('About app', { role: 'about' })])], 'linux'),
    undefined,
  )
})

test('the About text names the product and its version, then the runtime', () => {
  assert.deepEqual(
    aboutText('ACRYL ADE', '1.2.3', { electron: '40.0.0', chrome: '140.0.1', node: '24.1.0' }),
    {
      message: 'ACRYL ADE',
      detail: 'Version 1.2.3\nElectron 40.0.0\nChromium 140.0.1\nNode.js 24.1.0',
    },
  )
  assert.equal(aboutText('App', '0.1.0', {}).detail, 'Version 0.1.0')
})
