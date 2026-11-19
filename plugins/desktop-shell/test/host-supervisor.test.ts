import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendHostLog, hostCrashed, nextRestart, RESTART_POLICY } from '../host-supervisor.ts'

test('a host that stops is restarted after a short wait that grows, and given up on when it keeps stopping', () => {
  const now = 1_000_000
  assert.deepEqual(nextRestart([], now, RESTART_POLICY), { restart: true, delayMs: 500 })
  assert.deepEqual(nextRestart([now - 1000], now, RESTART_POLICY), { restart: true, delayMs: 2000 })
  const crowded = Array.from({ length: RESTART_POLICY.maxInWindow }, (_, at) => now - 1000 * at)
  assert.deepEqual(nextRestart(crowded, now, RESTART_POLICY), { restart: false })
  // Old stops do not count: a host that ran for a day and stopped once is a first stop again.
  const old = Array.from({ length: 9 }, (_, at) => now - RESTART_POLICY.windowMs - 1000 * (at + 1))
  assert.deepEqual(nextRestart(old, now, RESTART_POLICY), { restart: true, delayMs: 500 })
})

test("the host's output is kept in a log of the app, one file a day, old ones removed", () => {
  const dir = mkdtempSync(join(tmpdir(), 'host-log-'))
  try {
    const stale = join(dir, 'host-2026-10-01.log')
    writeFileSync(stale, 'old')
    utimesSync(stale, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))
    appendHostLog(dir, 'first\n', new Date('2026-11-09T12:00:00Z'))
    appendHostLog(dir, 'second\n', new Date('2026-11-09T13:00:00Z'))
    assert.deepEqual(readdirSync(dir), ['host-2026-11-09.log'])
    assert.equal(readFileSync(join(dir, 'host-2026-11-09.log'), 'utf8'), 'first\nsecond\n')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the watcher's report that the host crashed is a death; its other lines are not", () => {
  const crashed =
    "Failed running '/app/scripts/ide-host.mjs'. Waiting for file changes before restarting..."
  assert.equal(hostCrashed(crashed), true)
  assert.equal(hostCrashed(`${crashed}\n`), true)
  // A restart the watcher does on a saved file is the live reload, not a death.
  assert.equal(
    hostCrashed("Restarting '/app/scripts/ide-host.mjs'\nacrylblends host: http://127.0.0.1:3325/"),
    false,
  )
  assert.equal(hostCrashed("Gracefully restarted '/app/scripts/ide-host.mjs'"), false)
})
