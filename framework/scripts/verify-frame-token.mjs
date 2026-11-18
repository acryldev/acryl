#!/usr/bin/env node
// The frame's stable launch token, end to end: boot an installed app twice, and check that the second boot prints the SAME address, that the address
// admits the page (303 and the auth cookie) and that the cookie admits the frame's WebSocket (/api/remote.mux). This is the restart that must keep an
// open page working; it needs an app whose dependencies are installed, so it takes the folder as its argument:
//
//   node scripts/verify-frame-token.mjs ~/acryl-workshop/my-app
//
// It boots the app twice (npm run dev, the address the launcher prints), and never uses a fixed port: the app's own stable port is the point.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, statSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { npmSpawn } from './lib/platform.mjs'

const app = process.argv[2]
if (app === undefined) throw new Error('usage: node scripts/verify-frame-token.mjs <app-dir>')
const require = createRequire(join(app, 'package.json'))
const WebSocket = require('ws')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/**
 * Progress written synchronously: a watchdog exit truncates buffered `console.log` lines, and the step a hang reached is exactly what its caller
 * needs in the failure message (the Ubuntu runner hung once and the message carried no progress at all, 2026-11-02).
 */
const step = (line) => writeSync(1, `${line}\n`)
// A watchdog: whatever the wait, the script names itself and exits instead of leaving a gate hanging. Unref'd so a clean run still exits on its own.
setTimeout(() => {
  console.error('verify-frame-token: gave up after 10 minutes')
  process.exit(2)
}, 600_000).unref()
const env = { ...process.env }
// The app's own home unless the caller pinned one (the page gate runs this inside its scratch home).
if (env.ACRYLBLENDS_HOME === undefined || env.ACRYLBLENDS_HOME === '')
  env.ACRYLBLENDS_HOME = join(app, '.acrylblends')
delete env.ACRYLBLENDS_PORT

async function boot() {
  // Windows cannot start npm's .cmd shim directly; the repo's helper names it the way each platform can.
  const npm = npmSpawn()
  const child = spawn(npm.command, ['run', 'dev'], {
    ...npm.options,
    cwd: app,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // `npm run dev` is a small tree (npm -> sh -> node). Signalling npm alone leaves the app holding the stable port on Linux, so the next boot lands
    // on another port and the address is no longer stable (found on the Ubuntu runner, 2026-11-02). A POSIX process group lets stop() signal the tree;
    // Windows uses taskkill /T instead.
    detached: process.platform !== 'win32',
  })
  let output = ''
  let spawnError
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  // A child that never starts (a missing shim, a bad path) names itself instead of hanging until the address timeout.
  child.on('error', (error) => {
    spawnError = error
    output += `\nspawn failed: ${error.message}`
  })
  for (let i = 0; i < 240 && spawnError === undefined; i += 1) {
    const match = /acrylblends host: (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/u.exec(
      output,
    )
    if (match !== null) return { child, url: match[1], output: () => output }
    await sleep(250)
  }
  throw new Error(
    `the frame did not print its address${spawnError === undefined ? '' : ` (${spawnError.message})`}:\n${output.slice(-800)}`,
  )
}

/** The address record the launcher writes: owner-only, the same address, its own token. */
function record(url) {
  const path = join(env.ACRYLBLENDS_HOME, 'frame-url.json')
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const mode = process.platform === 'win32' ? 0o600 : statSync(path).mode & 0o777
  const token = new URL(url).searchParams.get('token') ?? ''
  return { mode, url: data.url === url, token: data.token === token }
}

/**
 * Stop the app's whole tree, not just npm: the point of the second boot is that the first app really stopped and its port is free. On Windows the
 * shim tree is killed with taskkill; elsewhere the child leads its own process group (see boot).
 */
function stop(child) {
  const signalTree = (signal) => {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      return
    }
    try {
      process.kill(-(child.pid ?? 0), signal)
    } catch {
      // The group is already gone (or the pid never started): the direct child is the best that is left.
      child.kill(signal)
    }
  }
  return new Promise((done) => {
    child.once('exit', () => done())
    signalTree('SIGTERM')
    setTimeout(() => signalTree('SIGKILL'), 4000).unref()
  })
}

async function pageAndSocket(url) {
  // A server that accepts the connection and never answers must fail with a name, not hang the caller: on the Ubuntu runner this fetch once held the
  // whole page gate for over forty minutes (2026-11-02). The address is an exchange endpoint; thirty seconds is already a failure.
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
  const origin = new URL(url).origin
  const socket = await new Promise((done) => {
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/remote.mux`, {
      headers: { cookie },
    })
    const timer = setTimeout(() => done({ open: false, reason: 'timeout' }), 6000)
    ws.once('open', () => {
      clearTimeout(timer)
      ws.close()
      done({ open: true })
    })
    ws.once('error', (error) => {
      clearTimeout(timer)
      done({ open: false, reason: error.message })
    })
  })
  return { status: response.status, cookie: cookie !== '', socket }
}

/** The app that is booted right now; a failure must stop it before the script leaves - a thrown read once left a server on its port for hours. */
let current
let ok = false

try {
  step('boot 1: starting')
  current = await boot()
  const first = current
  step(`boot 1: address printed at ${first.url.replace(/token=.*/u, 'token=<redacted>')}`)
  const firstCheck = { ...(await pageAndSocket(first.url)), record: record(first.url) }
  step(
    `boot 1: page ${String(firstCheck.status)}, cookie ${String(firstCheck.cookie)}, socket ${String(firstCheck.socket.open)}`,
  )
  step(
    `FIRST ${JSON.stringify({ url: first.url.replace(/token=.*/u, 'token=<redacted>'), ...firstCheck })}`,
  )
  step('boot 1: stopping')
  await stop(first.child)
  current = undefined
  step('boot 1: stopped')
  await sleep(1200)
  step('boot 2: starting')
  current = await boot()
  const second = current
  step(`boot 2: address printed at ${second.url.replace(/token=.*/u, 'token=<redacted>')}`)
  const secondCheck = { ...(await pageAndSocket(second.url)), record: record(second.url) }
  step(
    `boot 2: page ${String(secondCheck.status)}, cookie ${String(secondCheck.cookie)}, socket ${String(secondCheck.socket.open)}`,
  )
  step(
    `SECOND ${JSON.stringify({ url: second.url.replace(/token=.*/u, 'token=<redacted>'), ...secondCheck })}`,
  )
  step(`STABLE ${String(first.url === second.url)}`)
  ok =
    first.url === second.url &&
    firstCheck.status === 303 &&
    firstCheck.cookie === true &&
    firstCheck.socket.open === true &&
    firstCheck.record.mode === 0o600 &&
    firstCheck.record.url === true &&
    firstCheck.record.token === true &&
    secondCheck.status === 303 &&
    secondCheck.cookie === true &&
    secondCheck.socket.open === true &&
    secondCheck.record.mode === 0o600 &&
    secondCheck.record.url === true &&
    secondCheck.record.token === true
  await stop(second.child)
  current = undefined
  step(ok ? 'verify-frame-token: OK' : 'verify-frame-token: FAILED')
} finally {
  if (current !== undefined) await stop(current.child)
}
// An explicit exit: a lingering pipe or socket would otherwise keep the process alive while the caller waits for it (the watchdog then turned a
// finished run into a ten-minute failure on the Ubuntu runner). Every line above is a synchronous write, so nothing is lost.
process.exit(ok ? 0 : 1)
