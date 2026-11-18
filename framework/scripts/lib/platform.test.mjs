import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { chromeCandidates, doorSpawn, npmSpawn } from './platform.mjs'

test('npm runs as npm.cmd through the shell on Windows, and as npm elsewhere', () => {
  assert.deepEqual(npmSpawn('win32'), { command: 'npm.cmd', options: { shell: true } })
  assert.deepEqual(npmSpawn('darwin'), { command: 'npm', options: {} })
  assert.deepEqual(npmSpawn('linux'), { command: 'npm', options: {} })
})

test('the door runs its .cmd wrapper through the shell, quoted so spaces in the folder survive', () => {
  assert.deepEqual(doorSpawn('/app', 'linux'), {
    command: join('/app', '.acryl', 'bin', 'acryl'),
    options: {},
  })
  assert.deepEqual(doorSpawn('/app', 'darwin'), {
    command: join('/app', '.acryl', 'bin', 'acryl'),
    options: {},
  })
  assert.deepEqual(doorSpawn('C:\\app with spaces', 'win32'), {
    command: `"${join('C:\\app with spaces', '.acryl', 'bin', 'acryl.cmd')}"`,
    options: { shell: true },
  })
})

test('Chrome is found where each platform installs it, and CHROME_BIN wins', () => {
  const windows = chromeCandidates(
    { PROGRAMFILES: 'C:\\PF', 'PROGRAMFILES(X86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\LA' },
    'win32',
  )
  assert.deepEqual(windows, [
    join('C:\\PF', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join('C:\\PF86', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join('C:\\LA', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ])
  const mac = chromeCandidates({}, 'darwin')
  assert.equal(mac[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  const linux = chromeCandidates({ CHROME_BIN: '/opt/chrome' }, 'linux')
  assert.equal(linux[0], '/opt/chrome')
  assert.equal(linux[1], '/usr/bin/google-chrome')
})
