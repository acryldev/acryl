import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasSettings, type MenuNode, settingsPlacement } from '../menu.ts'

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
