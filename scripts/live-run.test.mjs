import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'

/**
 * A throwaway checkout with this repository's live-run and the instance module it loads, and a fake built `apps/acryl-web` in place of the app:
 * it starts a child of its own that holds the port, as the real app's engine does, so stopping only the launcher would leave the port taken.
 * On Windows that child is detached: Node puts a child it does not detach in a job that ends with its parent, so only a child outside it (detached,
 * or a terminal started through ConPTY) outlives a launcher ended on its own, and that is the case live-run's process-tree stop is for.
 */
function fakeCheckout(dir) {
  cpSync(join(repo, 'scripts', 'live-run.mjs'), join(dir, 'scripts', 'live-run.mjs'))
  cpSync(join(repo, 'scripts', 'lib'), join(dir, 'scripts', 'lib'), { recursive: true })
  cpSync(join(repo, 'runtime', 'acryl-harness-runtime', 'src', 'instance'), join(dir, 'runtime', 'acryl-harness-runtime', 'src', 'instance'), { recursive: true })
  writeFileSync(join(dir, 'runtime', 'acryl-harness-runtime', 'package.json'), JSON.stringify({ name: 'acryl-harness-runtime', type: 'module' }))
  mkdirSync(join(dir, 'apps', 'acryl-web', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'apps', 'acryl-web', 'package.json'), JSON.stringify({ name: 'acryl-web', type: 'module' }))
  writeFileSync(join(dir, 'apps', 'acryl-web', 'lib', 'bin.js'), `
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const port = process.argv[process.argv.indexOf('--port') + 1]
const server = "require('node:net').createServer(() => {}).listen(" + port + ", '127.0.0.1'); setInterval(() => {}, 1 << 30)"
const engine = spawn(process.execPath, ['-e', server], { stdio: 'inherit', detached: process.platform === 'win32', windowsHide: true })
writeFileSync(process.env.LIVE_RUN_TEST_PIDS, JSON.stringify({ app: process.pid, engine: engine.pid }))
setInterval(() => {}, 1 << 30)
`)
}

const freePort = () => new Promise((done, fail) => { const server = createServer(); server.on('error', fail); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => { done(port) }) }) })
const portInUse = port => new Promise(done => { const probe = createConnection({ port, host: '127.0.0.1' }, () => { probe.destroy(); done(true) }); probe.on('error', () => { done(false) }) })
const running = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const pause = ms => new Promise(done => setTimeout(done, ms))
async function until(condition, what, ms = 30_000) {
  for (let waited = 0; waited < ms; waited += 100) { if (await condition()) return; await pause(100) }
  throw new Error(`timed out waiting for ${what}`)
}
/** What a real home looks like to a later look: every file's path and modification time. */
function listing(dir) {
  return readdirSync(dir, { recursive: true }).sort().map(name => `${name} ${String(statSync(join(dir, name)).mtimeMs)}`)
}

/** Start live-run web on the fake app with its own "real" home, wait until the app holds the port, and hand back what the test needs. */
async function startRun(dir) {
  const checkout = join(dir, 'checkout'); fakeCheckout(checkout)
  const home = join(dir, 'real-home'); mkdirSync(join(home, '.acryl'), { recursive: true }); writeFileSync(join(home, '.acryl', 'settings.yaml'), 'mode: advanced\n')
  const pids = join(dir, 'pids.json')
  const port = await freePort()
  const run = spawn(process.execPath, [join(checkout, 'scripts', 'live-run.mjs'), 'web', '--no-key', '--port', String(port)], {
    env: { ...process.env, HOME: home, USERPROFILE: home, LIVE_RUN_TEST_PIDS: pids }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let output = ''
  run.stdout.on('data', chunk => { output += String(chunk) }); run.stderr.on('data', chunk => { output += String(chunk) })
  const exited = new Promise(done => { run.on('exit', (code, signal) => { done({ code, signal }) }) })
  await until(async () => existsSync(pids) && /started in /u.test(output) && await portInUse(port), 'the fake app to hold the port')
  const root = /started in (.+?);/u.exec(output)[1]
  return { run, script: join(checkout, 'scripts', 'live-run.mjs'), root, port, home, homeBefore: listing(home), app: JSON.parse(readFileSync(pids, 'utf8')), exited, output: () => output }
}

/** After a stop: live-run exited 0 with its verdict, the app and its child are gone, the port is free, the run's root is removed, the home is unchanged. */
async function assertStoppedCleanly(started) {
  let timer
  const { code, signal } = await Promise.race([started.exited, new Promise(done => { timer = setTimeout(() => { done({ code: 'timeout after 40 s' }) }, 40_000) })])
  clearTimeout(timer)
  assert.equal(code, 0, `live-run exited ${String(code ?? signal)}:\n${started.output()}`)
  assert.match(started.output(), /live-run: stopped, port free, real homes untouched/u)
  assert.equal(running(started.app.app), false, 'the app launcher is stopped')
  assert.equal(running(started.app.engine), false, 'the app\'s own child is stopped')
  assert.equal(await portInUse(started.port), false, 'the port is free')
  assert.equal(existsSync(started.root), false, 'the run root is removed')
  assert.deepEqual(listing(started.home), started.homeBefore, 'the real home is untouched')
}

async function withRun(stopRun) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'live-run-test-')))
  let started
  try {
    started = await startRun(dir)
    await stopRun(started)
    await assertStoppedCleanly(started)
  } finally {
    if (started !== undefined) { started.run.kill('SIGKILL'); for (const pid of [started.app.app, started.app.engine]) { try { process.kill(pid, 'SIGKILL') } catch { /* stopped */ } } }
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
}

// Windows cannot deliver SIGTERM or SIGINT to another process (Node ends it at once, with no handler run); Ctrl-C and Ctrl-Break come only from
// the console the run is in. There `live-run.mjs stop` is the way to stop a run, and it is tested below on every platform.
test('SIGTERM stops the app and its child, frees the port, removes the run and leaves the real home alone', { skip: windows && 'no signals between processes on Windows' }, async () => {
  await withRun(async (started) => { started.run.kill('SIGTERM') })
})

test('SIGINT (Ctrl-C) does the same', { skip: windows && 'no signals between processes on Windows' }, async () => {
  await withRun(async (started) => { started.run.kill('SIGINT') })
})

test('live-run.mjs stop <root> does the same from another process, on Windows by ending the app\'s whole process tree', async () => {
  await withRun(async (started) => {
    // Not spawnSync: the run is this process's child, and until this process's event loop reaps it, an exited run still answers kill(pid, 0).
    const stop = await new Promise(done => { execFile(process.execPath, [started.script, 'stop', started.root], { encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => { done({ status: error?.code ?? 0, stdout, stderr }) }) })
    assert.equal(stop.status, 0, `${stop.stdout}${stop.stderr}\nthe run said:\n${started.output()}`)
    assert.match(stop.stdout, /stopped \(its output has the checks\)/u)
  })
})
