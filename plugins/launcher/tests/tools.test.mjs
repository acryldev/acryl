import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installNode, listedSum, nodeIsNewEnough, toolDirs, toolsEnv } from '../tools.js'

test('Node 22.19 or later is new enough; older, garbage or nothing is not', () => {
  for (const ok of ['22.19.0', 'v22.19.1', 'v24.1.0', '23.0.0']) assert.equal(nodeIsNewEnough(ok), true, ok)
  for (const no of ['22.18.9', 'v18.19.1', '', undefined, 'node']) assert.equal(nodeIsNewEnough(no), false, String(no))
})

test('the listed checksum is read from either published format', () => {
  const sum = 'a'.repeat(64)
  assert.equal(listedSum(`${'b'.repeat(64)}  other.zip\n${sum}  node-v24.1.0-win-x64.zip\n`, 'node-v24.1.0-win-x64.zip'), sum)
  assert.equal(listedSum(`${sum} *gh_2.1.0_windows_amd64.zip`, 'gh_2.1.0_windows_amd64.zip'), sum)
  assert.equal(listedSum(`${sum}  x.zip`, 'y.zip'), undefined)
})

test('fetched tools go first on PATH, keeping the variable spelling Windows uses', () => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-tools-'))
  try {
    assert.deepEqual(toolsEnv(home, { Path: 'C:\\Windows' }, 'win32'), { Path: 'C:\\Windows' })
    const dirs = toolDirs(home, 'win32')
    mkdirSync(dirs.node, { recursive: true })
    mkdirSync(dirs.gh, { recursive: true })
    assert.deepEqual(toolsEnv(home, { Path: 'C:\\Windows' }, 'win32'), { Path: `${dirs.node};${dirs.gh};C:\\Windows` })
    const unix = toolDirs(home, 'linux')
    mkdirSync(unix.node, { recursive: true })
    assert.ok(toolsEnv(home, { PATH: '/usr/bin' }, 'linux').PATH.startsWith(`${unix.node}:`))
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('a download whose checksum does not match is refused and nothing is installed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-tools-'))
  try {
    const name = 'node-v24.9.9-linux-x64'
    const fake = async (url) => {
      const body = url.endsWith('index.json') ? JSON.stringify([{ version: 'v24.9.9' }])
        : url.endsWith('SHASUMS256.txt') ? `${createHash('sha256').update('the real one').digest('hex')}  ${name}.tar.gz\n`
          : 'something else'
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer }
    }
    await assert.rejects(installNode(home, { platform: 'linux', arch: 'x64', fetchImpl: fake }), /does not match its published checksum/u)
    assert.deepEqual(toolsEnv(home, { PATH: '/usr/bin' }, 'linux'), { PATH: '/usr/bin' })
    writeFileSync(join(home, 'keep'), '')
  } finally { rmSync(home, { recursive: true, force: true }) }
})
