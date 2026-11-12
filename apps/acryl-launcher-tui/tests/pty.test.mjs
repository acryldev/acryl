// spec 050 T003: a bare `acryl` in a real pseudo-terminal opens the launcher, and Enter alone makes an app. The selector is the real one
// (distribution/acryl-npm-launcher) with the real bundle beside it, as npm installs it; only the create package is a local stand-in
// (ACRYL_CREATE, the selector's own override) so the test needs no network and records exactly what `acryl new` was asked.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import pty from 'node-pty'
import { bundleLauncher } from '../scripts/bundle.mjs'

const selectorSource = fileURLToPath(new URL('../../../distribution/acryl-npm-launcher', import.meta.url))
const plain = text => text.replace(/\x1b\[[0-9;?<>=]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\/gu, '')

test('Enter, Enter, Enter, Enter in a terminal: acryl new my-app blank runs', { timeout: 120_000 }, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-launcher-pty-')))
  try {
    const selector = join(root, 'acryl')
    mkdirSync(selector)
    for (const file of readdirSync(selectorSource)) if (file.endsWith('.js') || file === 'package.json') cpSync(join(selectorSource, file), join(selector, file))
    await bundleLauncher(join(selector, 'launcher.js'))

    const create = join(root, 'fake-create')
    mkdirSync(create)
    writeFileSync(join(create, 'package.json'), JSON.stringify({ name: 'fake-create', version: '1.0.0', bin: { 'fake-create': 'bin.js' } }))
    writeFileSync(join(create, 'bin.js'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ACRYL_TEST_MARKER, JSON.stringify(process.argv.slice(2)))\n')
    const work = join(root, 'work')
    mkdirSync(work)
    const marker = join(root, 'asked.json')

    const env = { ...process.env, ACRYL_CREATE: create, ACRYL_TEST_MARKER: marker, ACRYL_TUI_THEME: 'dark', npm_config_cache: join(root, 'npm-cache') }
    delete env.npm_execpath
    const terminal = pty.spawn(process.execPath, [join(selector, 'bin.js')], { name: 'xterm-256color', cols: 80, rows: 30, cwd: work, env })
    let screen = ''
    terminal.onData(data => { screen += data })
    const exited = new Promise(resolve => terminal.onExit(resolve))
    const waitFor = async (text, ms = 30_000) => {
      const until = Date.now() + ms
      while (!plain(screen).includes(text)) {
        if (Date.now() > until) throw new Error(`waited for "${text}"; the screen shows:\n${plain(screen).slice(-2000)}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    try {
      await waitFor('What do you want to do?')
      terminal.write('\r')
      await waitFor('Name of the app')
      terminal.write('\r')
      await waitFor('Start from')
      terminal.write('\r')
      await waitFor('acryl new my-app blank')
      terminal.write('\r')
      const { exitCode } = await exited
      assert.equal(exitCode, 0, plain(screen).slice(-2000))
    } finally {
      terminal.kill()
    }
    assert.ok(existsSync(marker), `the create package never ran; the screen shows:\n${plain(screen).slice(-2000)}`)
    assert.deepEqual(JSON.parse(readFileSync(marker, 'utf8')), ['my-app', 'blank'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
