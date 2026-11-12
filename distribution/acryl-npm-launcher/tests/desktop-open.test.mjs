import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installedDesktop } from '../desktop-open.js'

const home = '/home/me'
const has = (...paths) => path => paths.includes(path)

test('macOS opens the installed ACRYL.app, from /Applications or the person\'s own Applications', () => {
  assert.deepEqual(installedDesktop({ platform: 'darwin', env: {}, home, exists: has('/Applications/ACRYL.app') }), { command: 'open', args: ['-a', '/Applications/ACRYL.app'] })
  assert.deepEqual(installedDesktop({ platform: 'darwin', env: {}, home, exists: has('/home/me/Applications/ACRYL.app') }), { command: 'open', args: ['-a', '/home/me/Applications/ACRYL.app'] })
})

test('Windows and Linux run the installed program; nothing installed gives undefined', () => {
  const exe = '/win/Programs/ACRYL/ACRYL.exe'
  const found = installedDesktop({ platform: 'win32', env: { LOCALAPPDATA: '/win' }, home, exists: path => path.replaceAll('\\', '/') === exe })
  assert.equal(found?.args.length, 0)
  assert.match(found.command.replaceAll('\\', '/'), /Programs\/ACRYL\/ACRYL\.exe$/u)
  assert.deepEqual(installedDesktop({ platform: 'linux', env: {}, home, exists: has('/opt/ACRYL/acryl-desktop') }), { command: '/opt/ACRYL/acryl-desktop', args: [] })
  for (const platform of ['darwin', 'win32', 'linux']) assert.equal(installedDesktop({ platform, env: {}, home, exists: () => false }), undefined)
})
