import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { WATCH_HOST } from '../frame.ts'
import { changed, snapshot } from '../watch-host.mjs'

test('an access-time change is not a change; a new size, modification time, file or removal is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-host-'))
  try {
    const blend = join(dir, 'blend.yaml')
    writeFileSync(blend, 'rows: []\n')
    // A whole-second modification time, so setting the access time below keeps it exactly (a Date has no sub-millisecond part).
    const mtime = new Date(Math.floor(Date.now() / 1000) * 1000)
    utimesSync(blend, mtime, mtime)
    mkdirSync(join(dir, 'src', 'node_modules'), { recursive: true })
    const before = snapshot([blend, join(dir, 'src')])
    utimesSync(blend, new Date(Date.now() + 60_000), mtime)
    assert.equal(changed(before, snapshot([blend, join(dir, 'src')])), false)
    // A file under node_modules is never the app's change.
    writeFileSync(join(dir, 'src', 'node_modules', 'x.js'), '')
    assert.equal(changed(before, snapshot([blend, join(dir, 'src')])), false)
    writeFileSync(join(dir, 'src', 'routes.ts'), 'export {}\n')
    assert.equal(changed(before, snapshot([blend, join(dir, 'src')])), true)
    const withRoutes = snapshot([blend, join(dir, 'src')])
    writeFileSync(blend, 'rows: [notes]\n')
    assert.equal(changed(withRoutes, snapshot([blend, join(dir, 'src')])), true)
    rmSync(join(dir, 'src', 'routes.ts'))
    assert.equal(changed(withRoutes, snapshot([blend, join(dir, 'src')])), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the watcher restarts the host once for one real edit, and never for an access-time change (spec 051 T013)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-host-run-'))
  const blend = join(dir, 'blend.yaml')
  const host = join(dir, 'host.mjs')
  const starts = join(dir, 'starts.log')
  writeFileSync(blend, 'rows: []\n')
  const mtime = new Date(Math.floor(Date.now() / 1000) * 1000)
  utimesSync(blend, mtime, mtime)
  writeFileSync(starts, '')
  // The host appends a line each time it starts, then stays up as a server does.
  writeFileSync(
    host,
    `import { appendFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(starts)}, 'start\\n')\nsetInterval(() => {}, 1_000_000)\n`,
  )
  const watcher = spawn(process.execPath, [WATCH_HOST, `--watch-path=${blend}`, '--', host], {
    stdio: 'ignore',
  })
  const count = () =>
    readFileSync(starts, 'utf8')
      .split('\n')
      .filter((line) => line === 'start').length
  const settle = async (want: number) => {
    for (let i = 0; i < 50 && count() < want; i += 1) await sleep(100)
    await sleep(1_500)
  }
  try {
    await settle(1)
    assert.equal(count(), 1)
    // What `git diff` does to a modified file: its access time moves, its content does not.
    utimesSync(blend, new Date(Date.now() + 60_000), mtime)
    await settle(1)
    assert.equal(count(), 1, 'an access-time change restarted the host')
    writeFileSync(blend, 'rows: [notes]\n')
    await settle(2)
    assert.equal(count(), 2, 'one edit is one restart')
  } finally {
    watcher.kill('SIGTERM')
    await new Promise((done) => watcher.once('exit', done))
    rmSync(dir, { recursive: true, force: true })
  }
})
