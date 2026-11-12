// spec 050 T003: a bare `acryl` in a real pseudo-terminal opens the launcher, and Enter alone makes an app. The selector is the real one
// (distribution/acryl-npm-launcher) with the real bundle beside it, as npm installs it; only the create package is a local stand-in
// (ACRYL_CREATE, the selector's own override) so the test needs no network and records exactly what `acryl new` was asked.
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pty from 'node-pty'
import { bundleLauncher } from '../scripts/bundle.mjs'

const selectorSource = fileURLToPath(new URL('../../../distribution/acryl-npm-launcher', import.meta.url))
const plain = text => text.replace(/\x1b\[[0-9;?<>=]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\/gu, '')

test('Enter five times: acryl new my-app blank runs in ~/ACRYL, the app is listed, and acryl apps and acryl --tui show it', { timeout: 120_000 }, async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-launcher-pty-')))
  try {
    const selector = join(root, 'acryl')
    mkdirSync(selector)
    for (const file of readdirSync(selectorSource)) if (file.endsWith('.js') || file === 'package.json') cpSync(join(selectorSource, file), join(selector, file))
    await bundleLauncher(join(selector, 'launcher.js'))

    const create = join(root, 'fake-create')
    mkdirSync(create)
    writeFileSync(join(create, 'package.json'), JSON.stringify({ name: 'fake-create', version: '1.0.0', bin: { 'fake-create': 'bin.js' } }))
    // The stand-in records what it was asked and makes the folder a real create would (a blend.yaml), so the selector can list the app.
    writeFileSync(join(create, 'bin.js'), '#!/usr/bin/env node\nconst fs = require("node:fs")\nfs.writeFileSync(process.env.ACRYL_TEST_MARKER, JSON.stringify(process.argv.slice(2)))\nfs.mkdirSync(process.argv[2])\nfs.writeFileSync(process.argv[2] + "/blend.yaml", "id: acrylblends.blank\\n")\n')
    const work = join(root, 'work')
    mkdirSync(work)
    const marker = join(root, 'asked.json')

    // HOME is a scratch folder: the list (~/.acryl) and the suggested folder (~/ACRYL) must never touch the real ones.
    const home = join(root, 'home')
    mkdirSync(home)
    const env = { ...process.env, HOME: home, USERPROFILE: home, ACRYL_CREATE: create, ACRYL_TEST_MARKER: marker, ACRYL_TUI_THEME: 'dark', npm_config_cache: join(root, 'npm-cache') }
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
      await waitFor('No apps yet')
      terminal.write('\r')
      await waitFor('Which folder should it live in')
      terminal.write('\r')
      await waitFor('Name of the app')
      terminal.write('\r')
      await waitFor('Start from')
      terminal.write('\r')
      await waitFor('This runs now')
      terminal.write('\r')
      const { exitCode } = await exited
      assert.equal(exitCode, 0, plain(screen).slice(-2000))
    } finally {
      terminal.kill()
    }
    assert.ok(existsSync(marker), `the create package never ran; the screen shows:\n${plain(screen).slice(-2000)}`)
    assert.deepEqual(JSON.parse(readFileSync(marker, 'utf8')), ['my-app', 'blank'])
    const made = join(realpathSync(home), 'ACRYL', 'my-app')
    assert.ok(existsSync(join(made, 'blend.yaml')), 'the app was made in the suggested folder, which the selector created')
    const listed = JSON.parse(readFileSync(join(home, '.acryl', 'apps.json'), 'utf8')).apps
    assert.deepEqual(listed.map(entry => [entry.id, entry.blend, entry.madeBy]), [['my-app', 'acrylblends.blank', 'person']])

    // `acryl apps` says the same in words.
    const apps = spawnSync(process.execPath, [join(selector, 'bin.js'), 'apps'], { cwd: work, env, encoding: 'utf8' })
    assert.equal(apps.status, 0, apps.stderr)
    assert.match(apps.stdout, /^my-app {2}ready {2}acrylblends\.blank {2}/u)
    // `acryl --tui` opens the app screen with it; without a terminal it says what to do instead.
    const second = pty.spawn(process.execPath, [join(selector, 'bin.js'), '--tui'], { name: 'xterm-256color', cols: 80, rows: 30, cwd: work, env })
    let again = ''
    second.onData(data => { again += data })
    try {
      const until = Date.now() + 30_000
      while (!plain(again).includes('Your apps (1)')) {
        if (Date.now() > until) throw new Error(`waited for the app list; the screen shows:\n${plain(again).slice(-2000)}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      assert.match(plain(again), /my-app +ready +Web +acrylblends\.blank/u)
    } finally { second.kill() }
    // `acryl model set deepseek` over a pipe (a script) stores the key owner-only and never prints it; the status shows only its tail.
    const KEY = 'sk-0123456789abcdef0123456789abcdef'
    const stored = spawnSync(process.execPath, [join(selector, 'bin.js'), 'model', 'set', 'deepseek'], { cwd: work, env, input: KEY, encoding: 'utf8' })
    assert.equal(stored.status, 0, stored.stderr)
    assert.equal((stored.stdout + stored.stderr).includes(KEY), false)
    assert.equal(JSON.parse(readFileSync(join(home, '.acryl', 'model.json'), 'utf8')).deepseek, KEY)
    const status = spawnSync(process.execPath, [join(selector, 'bin.js'), 'model'], { cwd: work, env, encoding: 'utf8' })
    assert.match(status.stdout, /set \(sk-\.\.\.cdef\)/u)
    // The same at a real prompt: typing is hidden, so the key is not on the screen, only its tail in the answer.
    const typed = 'sk-fedcba9876543210fedcba9876543210'
    const prompt = pty.spawn(process.execPath, [join(selector, 'bin.js'), 'model', 'set', 'deepseek'], { name: 'xterm-256color', cols: 80, rows: 30, cwd: work, env })
    let asked = ''
    prompt.onData(data => { asked += data })
    const promptExit = new Promise(resolve => prompt.onExit(resolve))
    try {
      const until = Date.now() + 30_000
      while (!plain(asked).includes('typing is hidden')) {
        if (Date.now() > until) throw new Error(`no prompt; the screen shows:\n${plain(asked)}`)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      prompt.write(`${typed}\r`)
      assert.equal((await promptExit).exitCode, 0, plain(asked))
    } finally { prompt.kill() }
    assert.equal(plain(asked).includes(typed), false, 'the typed key is never echoed')
    assert.match(plain(asked), /Saved \(sk-\.\.\.3210\)/u)
    assert.equal(JSON.parse(readFileSync(join(home, '.acryl', 'model.json'), 'utf8')).deepseek, typed)
    writeFileSync(join(home, '.acryl', 'model.json'), JSON.stringify({ deepseek: KEY }))
    // An app the selector starts gets the stored key as DEEPSEEK_API_KEY (the stand-in create package writes what it saw).
    const seen = join(root, 'seen-key.txt')
    writeFileSync(join(create, 'bin.js'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ACRYL_TEST_SEEN, process.env.DEEPSEEK_API_KEY || "none")\n')
    const started = spawnSync(process.execPath, [join(selector, 'bin.js'), 'new', 'other-app'], { cwd: work, env: { ...env, ACRYL_TEST_SEEN: seen }, encoding: 'utf8' })
    assert.equal(started.status, 0, started.stderr)
    assert.equal(readFileSync(seen, 'utf8'), KEY)
    const noTerminal = spawnSync(process.execPath, [join(selector, 'bin.js'), '--tui'], { cwd: work, env, encoding: 'utf8' })
    assert.equal(noTerminal.status, 1)
    assert.match(noTerminal.stderr, /--tui needs a terminal/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
