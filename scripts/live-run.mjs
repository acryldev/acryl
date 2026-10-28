#!/usr/bin/env node
/**
 * Run one ACRYL surface live (real model, real browser or window) without any chance of touching the machine's real app data.
 *
 *   node scripts/live-run.mjs web      [--port 3290] [--blueprint acryl.blank] [--key-file ~/.secure-storage/llmproviders/deepseek/deepseek.json] [--keep]
 *   node scripts/live-run.mjs desktop  [--port 3291] [--key-file ...] [--keep]
 *   node scripts/live-run.mjs tui      [--key-file ...] [--keep]      (runs in a detached tmux session; attach or send keys with tmux)
 *
 * Reproducing what a user saw: `--copy-home <dir>` starts from a copy of that app home (for example ~/.acryl-dev) with its stored sign-ins removed
 * (`.dsh/.credentials.yaml`), so the user's chats, worktrees, profile and plugins are there but no account of theirs can be used; `--no-key` starts
 * without the model key; `--inspect <port>` (desktop) opens Chromium's inspector on that port for `scripts/inspect-page.mjs`. The copied home is only
 * read; the real-home check still runs.
 *
 * The run gets an isolated environment (`scripts/lib/isolated-run.mjs`: its own HOME, ACRYL and engine homes, Electron user data, ACRYL_REQUIRE_ISOLATED_HOME
 * so the runtime refuses a real home) and the model key in its process environment only: it is read from the key file, never printed, never written.
 * The real homes are snapshotted first; on exit the run stops its processes, checks that its port is free, compares the real homes with the snapshot and
 * fails loudly if anything changed. `--keep` leaves the throwaway root for inspection (its path is printed).
 *
 * Stop it with Ctrl-C, SIGTERM (macOS, Linux) or Ctrl-Break (Windows), or from anywhere with `node scripts/live-run.mjs stop [root]`, which asks every
 * running live run (or the one in `root`) to stop and waits until it has. On Windows that command is the way to stop a run from another process:
 * Node cannot deliver a signal there, `process.kill` terminates at once, and the run would not stop its app or check anything.
 *
 * It runs the checkout's built `lib/` and never builds: in a checkout that is not built it stops before making anything, names the unbuilt package
 * and prints the build command (`scripts/lib/build-outputs.mjs`), because a build rewrites lib/ under any app running from the same checkout.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { osHomeDirectory } from './lib/instance-module.mjs'
import { findMissingBuildOutput, unbuiltMessage } from './lib/build-outputs.mjs'
import { assertRealHomesUntouched, isolatedEnvironment, relocateHome, snapshotRealHomes } from './lib/isolated-run.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [surface, ...rest] = process.argv.slice(2)
const option = (name, fallback) => { const at = rest.indexOf(`--${name}`); return at >= 0 ? rest[at + 1] : fallback }
const keep = rest.includes('--keep')
/** The file a run's root gets when `live-run.mjs stop` asks it to stop; the run looks for it four times a second. */
const STOP_FILE = 'stop'
const running = pid => { try { process.kill(pid, 0); return true } catch { return false } }
if (surface === 'stop') process.exit(await requestStop(rest[0]))

/** Ask the run in `root`, or every running live run under the temp folder, to stop, and wait until each has exited. */
async function requestStop(root) {
  const runs = (root === undefined ? readdirSync(tmpdir()).filter(name => name.startsWith('acryl-live-')).map(name => join(tmpdir(), name)) : [resolve(root)])
    .flatMap((dir) => { try { return [{ dir, ...JSON.parse(readFileSync(join(dir, 'live-run.json'), 'utf8')) }] } catch { return [] } })
    .filter(run => typeof run.livePid === 'number' && running(run.livePid))
  if (runs.length === 0) { console.error(`live-run: no running live run${root === undefined ? ` under ${tmpdir()}` : ` in ${root}`}`); return 1 }
  for (const run of runs) writeFileSync(join(run.dir, STOP_FILE), '')
  // A run stops its app within 15 s and then checks the port and the real homes; its own output says how that went.
  for (let waited = 0; waited < 30_000 && runs.some(run => running(run.livePid)); waited += 250) await new Promise(done => setTimeout(done, 250))
  const stuck = runs.filter(run => running(run.livePid))
  for (const run of runs) console.log(`live-run: ${run.dir} ${stuck.includes(run) ? 'did not stop within 30 s' : 'stopped (its output has the checks)'}`)
  return stuck.length === 0 ? 0 : 1
}

if (!['web', 'desktop', 'tui'].includes(surface)) { console.error('usage: live-run.mjs web|desktop|tui [--port N] [--key-file F | --no-key] [--copy-home DIR] [--inspect PORT] [--keep], or live-run.mjs stop [root]'); process.exit(2) }
// A checkout that was never built stops here, before any home is made or process spawned, with the package and the build command.
const SURFACE_OUTPUTS = { web: ['apps/acryl-web', ['lib/bin.js']], desktop: ['apps/acryl-desktop', ['lib/main.js']], tui: ['apps/acryl-cli', ['lib/bin.js']] }
const missingOutput = findMissingBuildOutput(root, ...SURFACE_OUTPUTS[surface])
if (missingOutput !== undefined) { console.error(unbuiltMessage(missingOutput)); process.exit(1) }

const realHome = osHomeDirectory()
const expand = path => path.replace(/^~/u, realHome)
let key
if (!rest.includes('--no-key')) {
  const keyFile = expand(option('key-file', join(realHome, '.secure-storage/llmproviders/deepseek/deepseek.json')))
  key = JSON.parse(readFileSync(keyFile, 'utf8')).deepseek_api_key
  if (typeof key !== 'string' || key === '') throw new Error(`live-run: no deepseek_api_key in ${keyFile}`)
}
const copyHome = option('copy-home', undefined)
const inspect = option('inspect', undefined)
if (inspect !== undefined && surface !== 'desktop') throw new Error('live-run: --inspect is for the desktop surface (open the web url in a browser instead)')

const port = Number(option('port', surface === 'desktop' ? '3291' : '3290'))
const isolated = isolatedEnvironment({ label: `live-${surface}`, port, extra: { ...(key === undefined ? {} : { DEEPSEEK_API_KEY: key }), ...(option('blueprint') === undefined ? {} : { ACRYL_BLUEPRINT: option('blueprint') }) } })
if (copyHome !== undefined) {
  rmSync(isolated.home, { recursive: true, force: true })
  cpSync(expand(copyHome), isolated.home, { recursive: true, verbatimSymlinks: true })
  // The user's chats and profile, never their accounts.
  rmSync(join(isolated.home, '.dsh', '.credentials.yaml'), { force: true })
  // ...and the copy's own paths: what the home records about itself points at the copy, so the run never reaches back into the source.
  const relocated = relocateHome(isolated.home, expand(copyHome))
  console.log(`live-run: started from a copy of ${copyHome} without its stored sign-ins (${relocated.length} file(s) re-pointed at the copy)`)
}
// Desktop takes its port from its home's settings (`dsh-desktop.port`, default 43120, the dev app's), not from ACRYL_WEB_PORT: a run that left it
// there took the owner's port when it started first, and the owner's app moved to the next one, with another origin's saved tabs.
if (surface === 'desktop') pinDesktopPort(join(isolated.home, 'acryl-settings.yaml'), port)

/** Set `dsh-desktop.port` in a settings file, keeping every other line. */
function pinDesktopPort(file, value) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
  const start = lines.findIndex(line => /^dsh-desktop:\s*$/u.test(line))
  if (start < 0) {
    writeFileSync(file, `${lines.join('\n').replace(/\n*$/u, '')}${lines.length > 0 ? '\n' : ''}dsh-desktop:\n  port: ${String(value)}\n`)
    return
  }
  let end = start + 1
  while (end < lines.length && (lines[end] === '' || /^\s/u.test(lines[end]))) end += 1
  const section = lines.slice(start + 1, end).filter(line => !/^\s+port:/u.test(line))
  writeFileSync(file, [...lines.slice(0, start + 1), `  port: ${String(value)}`, ...section, ...lines.slice(end)].join('\n'))
}
const before = snapshotRealHomes(realHome)
const portInUse = (probePort = port) => new Promise(done => { const probe = createConnection({ port: probePort, host: '127.0.0.1' }, () => { probe.destroy(); done(true) }); probe.on('error', () => { done(false) }) })
for (const busy of [port, ...(inspect === undefined ? [] : [Number(inspect)])]) {
  if (await portInUse(busy)) { isolated.dispose(); throw new Error(`live-run: port ${String(busy)} is already in use`) }
}

let child
let session
if (surface === 'web') {
  child = spawn(process.execPath, [join(root, 'apps/acryl-web/lib/bin.js'), '--no-open', '--port', String(port)], { cwd: root, env: isolated.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
} else if (surface === 'desktop') {
  child = spawn(process.execPath, [join(root, 'apps/acryl-desktop/scripts/launch-dev.mjs'), ...(inspect === undefined ? [] : [`--remote-debugging-port=${inspect}`])], { cwd: root, env: isolated.env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
} else {
  session = `acryl-live-${String(process.pid)}`
  const project = join(isolated.root, 'project')
  spawnSync('mkdir', ['-p', project])
  const envArgs = Object.entries(isolated.env).filter(([name]) => /^(HOME|ACRYL_|DSH_|DEEPSEEK_API_KEY|PATH|TERM|LANG)/u.test(name)).map(([name, value]) => `${name}=${value}`)
  spawnSync('tmux', ['new-session', '-d', '-s', session, '-x', '140', '-y', '40', '-c', project, 'env', ...envArgs, process.execPath, join(root, 'apps/acryl-cli/lib/bin.js')], { stdio: 'inherit' })
}

// The app's last output lines, printed if it exits by itself: otherwise a start that fails says nothing at all.
const recent = []
const announce = chunk => {
  for (const line of String(chunk).split('\n')) {
    if (line.trim() !== '') { recent.push(line); if (recent.length > 40) recent.shift() }
    const url = /(https?:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+)/u.exec(line)?.[1]
    if (url !== undefined) console.log(`live-run: ${surface} url ${url}`)
  }
}
child?.stdout.on('data', announce)
child?.stderr.on('data', announce)
writeFileSync(join(isolated.root, 'live-run.json'), `${JSON.stringify({ surface, pid: child?.pid, livePid: process.pid, session, port, root: isolated.root })}\n`)
console.log(`live-run: ${surface} started in ${isolated.root}${session === undefined ? '' : ` (tmux session ${session})`}; stop and verify with Ctrl-C, SIGTERM or \`node scripts/live-run.mjs stop ${isolated.root}\``)

let stopping = false
async function stop(code) {
  if (stopping) return
  stopping = true
  // The launcher starts the app as its own child (Desktop: Electron); signalling only the launcher left that app running. On macOS and Linux each
  // child leads its own process group (detached), so the whole group is signalled. Windows has no groups to signal and `process.kill` ends one
  // process at once, so the tree is stopped with taskkill /T: without /F it asks windows to close (Electron saves and quits), with /F it ends
  // the rest. A console app (Web) can only be ended with /F, so a Windows Web run is ended at once rather than waiting out the grace period.
  const windows = process.platform === 'win32'
  const signalGroup = (signal) => {
    if (child?.pid === undefined) return
    if (windows) { spawnSync('taskkill', ['/PID', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore', windowsHide: true }); return }
    try { process.kill(-child.pid, signal) } catch { /* already gone */ }
  }
  signalGroup(windows && surface === 'web' ? 'SIGKILL' : 'SIGTERM')
  if (session !== undefined) { spawnSync('tmux', ['send-keys', '-t', session, 'C-c']); spawnSync('sleep', ['2']); spawnSync('tmux', ['kill-session', '-t', session]) }
  // Electron shuts down gracefully (it saves state, stops the engine): give the group up to 15 s before forcing it.
  const groupAlive = () => { if (child?.pid === undefined) return false; try { process.kill(windows ? child.pid : -child.pid, 0); return true } catch { return false } }
  const pause = () => new Promise(done => setTimeout(done, 250))
  for (let waited = 0; waited < 15_000 && groupAlive(); waited += 250) await pause()
  let failure
  if (groupAlive()) { signalGroup('SIGKILL'); failure = 'the process did not stop within 15 s' }
  // A process that was just ended releases its listening socket a moment later.
  for (let waited = 0; waited < 5_000 && surface !== 'tui' && await portInUse(); waited += 250) await pause()
  if (surface !== 'tui' && await portInUse()) failure = `${failure ?? ''} port ${String(port)} is still in use`.trim()
  if (inspect !== undefined && await portInUse(Number(inspect))) failure = `${failure ?? ''} inspector port ${inspect} is still in use`.trim()
  try { assertRealHomesUntouched(before, `live-run ${surface}`) } catch (error) { failure = `${failure === undefined ? '' : `${failure}; `}${error.message}` }
  if (keep) console.log(`live-run: kept ${isolated.root}`)
  // dispose retries: Windows keeps the files of a just-ended app locked for a moment.
  else isolated.dispose()
  if (failure !== undefined) { console.error(`live-run: FAILED - ${failure}`); process.exit(1) }
  console.log('live-run: stopped, port free, real homes untouched')
  process.exit(code)
}
process.on('SIGINT', () => { void stop(0) })
process.on('SIGTERM', () => { void stop(0) })
if (process.platform === 'win32') process.on('SIGBREAK', () => { void stop(0) })
child?.on('exit', (code, signal) => {
  if (stopping) return
  console.error(`live-run: the ${surface} app exited by itself (${signal ?? `code ${String(code)}`}); its last output:\n${recent.map(line => `  ${line}`).join('\n')}`)
  void stop(1)
})
setInterval(() => { if (existsSync(join(isolated.root, STOP_FILE))) void stop(0) }, 250)
