import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installedDesktop } from '../desktop-open.js'

const home = '/home/me'
// Paths are compared with forward slashes: Windows joins them with backslashes, and the test is about where the app is, not the separator.
const slash = path => path.replaceAll('\\', '/')
const has = (...paths) => path => paths.includes(slash(path))
const opened = found => found && { ...found, args: found.args.map(slash), command: slash(found.command) }

test('macOS opens the installed ACRYL.app, from /Applications or the person\'s own Applications', () => {
  assert.deepEqual(opened(installedDesktop({ platform: 'darwin', env: {}, home, exists: has('/Applications/ACRYL.app') })), { command: 'open', args: ['-a', '/Applications/ACRYL.app'] })
  assert.deepEqual(opened(installedDesktop({ platform: 'darwin', env: {}, home, exists: has('/home/me/Applications/ACRYL.app') })), { command: 'open', args: ['-a', '/home/me/Applications/ACRYL.app'] })
})

test('Windows and Linux run the installed program; nothing installed gives undefined', () => {
  const found = installedDesktop({ platform: 'win32', env: { LOCALAPPDATA: '/win' }, home, exists: has('/win/Programs/ACRYL/ACRYL.exe') })
  assert.equal(found?.args.length, 0)
  assert.match(slash(found.command), /Programs\/ACRYL\/ACRYL\.exe$/u)
  assert.deepEqual(opened(installedDesktop({ platform: 'linux', env: {}, home, exists: has('/opt/ACRYL/acryl-desktop') })), { command: '/opt/ACRYL/acryl-desktop', args: [] })
  for (const platform of ['darwin', 'win32', 'linux']) assert.equal(installedDesktop({ platform, env: {}, home, exists: () => false }), undefined)
})
