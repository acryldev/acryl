/**
 * One build at a time in this checkout.
 *
 * Every package's build wipes its `lib/` and rewrites it in place, so a build that runs while another one reads that output sees it missing or half written
 * (`Cannot find module 'acryl-workspace/client'` in a package that depends on it, for a few seconds). It has happened between an owner's launch and a gate run in
 * the same tree three times. The launchers (`pnpm web`, `pnpm acryl`, Desktop `dev`) take this lock around their build, and a gate or any long build
 * runs through `scripts/with-build-lock.mjs`, so they wait for each other instead of colliding.
 *
 * The lock is a directory (`mkdir` is atomic) holding the owner's pid; a lock whose owner is gone is taken over.
 *
 * @module scripts/lib/build-lock
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCK_DIR = '.build-lock'
const POLL_MS = 1000
const REPORT_MS = 15_000
const WAIT_LIMIT_MS = 45 * 60_000

const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function holder(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) } catch { return undefined }
}

/** Wait for the lock, then hold it until the returned function is called. */
export async function acquireBuildLock(root, label, { log = message => process.stderr.write(`${message}\n`) } = {}) {
  const dir = join(root, LOCK_DIR)
  const started = Date.now()
  let reported = 0
  for (;;) {
    try {
      mkdirSync(dir)
      writeFileSync(join(dir, 'owner.json'), `${JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() })}\n`)
      let released = false
      const release = () => { if (!released) { released = true; rmSync(dir, { recursive: true, force: true }) } }
      process.once('exit', release)
      return release
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    const owner = holder(dir)
    // An owner that is gone (or a lock with no readable owner for a while) is stale: take it over.
    if (owner !== undefined && !alive(owner.pid)) { rmSync(dir, { recursive: true, force: true }); continue }
    if (owner === undefined && Date.now() - started > 10_000) { rmSync(dir, { recursive: true, force: true }); continue }
    if (Date.now() - started > WAIT_LIMIT_MS) throw new Error(`build lock: still held by ${owner?.label ?? 'another build'} (pid ${String(owner?.pid)}) after ${String(WAIT_LIMIT_MS / 60_000)} minutes`)
    if (Date.now() - reported >= REPORT_MS) {
      reported = Date.now()
      log(`waiting for another build in this checkout to finish (${owner?.label ?? 'unknown'}, pid ${String(owner?.pid)})...`)
    }
    await sleep(POLL_MS)
  }
}

/** Run `fn` while holding the lock. */
export async function withBuildLock(root, label, fn) {
  const release = await acquireBuildLock(root, label)
  try { return await fn() } finally { release() }
}
