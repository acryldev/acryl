#!/usr/bin/env node
/**
 * The walk of an installed ACRYL Blends app: does the product keep the two promises of "one OS app per Blend" (specs/049-framework-architecture/app-storage.md
 * in ACRYL)? It launches the app the way a person does, on a scratch data folder, and checks:
 *
 *   1. encapsulation  - the app's bundle is never written (a hash of every file is the same at the end as at the start), and everything the person makes
 *                       lives in the app's own folder in the OS data folder.
 *   2. self-extension - a plugin written into the app's own `plugins/` folder (what the agent does) is served by the running app, with no restart asked for,
 *                       and an edit of it is served again.
 *   3. self-repair    - the host process killed from outside is started again by the app, on the same address, and the plugin is still served.
 *   4. persistence    - quit the app and start it again: the same app, the plugin and its edit are there.
 *   5. update         - the whole bundle replaced by a changed copy of itself (`--program`): the new Program is the one served (a marker in the framework's
 *                       home plugin shows on the page) and the app, its plugin and its history are untouched. The copy is made here, so the update is simulated;
 *                       it is a real replacement of the folder, not an in-place patch.
 *
 *   node scripts/walk-installed-app.mjs --exe <app executable> --bundle <the folder the update replaces> --scratch <empty folder> [--program <the Program's folder inside the bundle>]
 *
 * It never touches the real data folder: the child's home is `<scratch>/home` (macOS, Linux) or `<scratch>/local` (Windows). It needs a display where the OS
 * has one (a Linux server without one runs it under `xvfb-run`). Every line is `PASS`, `FAIL` or `INFO`; the exit code is the number of failures.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const args = process.argv.slice(2)
const option = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const exe = resolve(option('--exe') ?? '')
const bundle = resolve(option('--bundle') ?? '')
const scratch = resolve(option('--scratch') ?? '')
/** Where the framework's code is inside the bundle (`Contents/Resources/app` on macOS, `resources/app` elsewhere); naming it turns the update step on. */
const programDir = option('--program')
if (!existsSync(exe) || !existsSync(bundle) || option('--scratch') === undefined)
  throw new Error(
    'usage: walk-installed-app.mjs --exe <app executable> --bundle <bundle folder> --scratch <folder> [--program <Program folder inside the bundle>]',
  )
if (existsSync(scratch) && readdirSync(scratch).length > 0)
  throw new Error(
    `--scratch ${scratch} must be empty: the walk writes the app's whole data folder there`,
  )

const win = process.platform === 'win32'
const home = join(scratch, win ? 'local' : 'home')
mkdirSync(home, { recursive: true })
const dataRoot = join(
  home,
  ...(process.platform === 'darwin'
    ? ['Library', 'Application Support', 'ACRYL Blends']
    : win
      ? ['ACRYL Blends']
      : ['.local', 'share', 'ACRYL Blends']),
)
const childEnv = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  LOCALAPPDATA: home,
  APPDATA: home,
  XDG_DATA_HOME: join(home, '.local', 'share'),
  XDG_CONFIG_HOME: join(home, '.config'),
  XDG_CACHE_HOME: join(home, '.cache'),
  // The walk may itself run on the app's runtime as Node; the app it starts must start as an app.
  ELECTRON_RUN_AS_NODE: undefined,
}

let failures = 0
const say = (kind, line) => console.log(`${kind.padEnd(4)} ${line}`)
const check = (ok, line) => {
  if (!ok) failures += 1
  say(ok ? 'PASS' : 'FAIL', line)
  return ok
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** One hash for every file of a folder (names and bytes), so any write inside a bundle shows. */
function treeHash(root) {
  const hash = createHash('sha1')
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) hash.update(`${relative(root, path)}\n`).update(readFileSync(path))
    }
  }
  walk(root)
  return hash.digest('hex')
}

let child
function launch() {
  child = spawn(exe, process.platform === 'linux' ? ['--no-sandbox'] : [], {
    env: childEnv,
    stdio: 'ignore',
    detached: !win,
  })
  child.unref()
}
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
/**
 * Quit the app the way a person does: a SIGTERM to the main process (logout, `kill`), a close request to its windows on Windows. Never to the whole process
 * group: Chromium's own child processes would die under the main one and crash it (found on Ubuntu), which no person's quit does.
 */
function quitApp(pid) {
  if (win) spawnSync('taskkill', ['/PID', String(pid)], { stdio: 'ignore' })
  else
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone.
    }
}
function killTree(pid, force) {
  if (win) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  else
    try {
      process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM')
    } catch {
      // Already gone.
    }
}

const appsDir = join(dataRoot, 'apps')
const frameRecord = () => {
  try {
    const [id] = readdirSync(appsDir)
    if (id === undefined) return undefined
    const file = join(appsDir, id, 'data', 'frame-url.json')
    return { id, ...JSON.parse(readFileSync(file, 'utf8')) }
  } catch {
    return undefined
  }
}
/** The frame's address once something answers on it, or undefined. `not` is an address that must not be taken (the one the host just lost). */
async function served(waitMs, not) {
  const until = Date.now() + waitMs
  while (Date.now() < until) {
    const record = frameRecord()
    if (record !== undefined && record.url !== not) {
      const base = record.url.split('?')[0]
      const token = new URL(record.url).searchParams.get('token')
      try {
        const answer = await fetch(`${base}app/health?token=${token}`)
        if (answer.ok) return { ...record, base, token }
      } catch {
        // Not listening yet.
      }
    }
    await sleep(300)
  }
  return undefined
}
/** Poll a path of the app until `ok(text)` says so, or the time is out. @returns the seconds it took, or undefined. */
async function until(frame, path, ok, waitMs) {
  const started = Date.now()
  while (Date.now() - started < waitMs) {
    try {
      const answer = await fetch(`${frame.base}${path}?token=${frame.token}`, {
        headers: { accept: 'text/html' },
      })
      if (ok(await answer.text())) return (Date.now() - started) / 1000
    } catch {
      // The host is restarting.
    }
    await sleep(300)
  }
  return undefined
}

const plugin = (note) => `import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'

const items: string[] = ['${note}']

export const name = 'notes'
export const inject = ['router', 'home']

export function apply(ctx: Context): void {
  ctx.router.route('/notes', new Acryl().get('/items', (c) => c.json({ items })))
  ctx.effect(() =>
    ctx.home.widget({
      id: 'notes',
      title: 'Notes',
      render: () => \`<ul id="notes">\${items.map((n) => \`<li>\${n}</li>\`).join('')}</ul>\`,
    }),
  )
}
`

say('INFO', `platform ${process.platform}-${process.arch}, exe ${exe}`)
const bundleBefore = treeHash(bundle)
say('INFO', `bundle hash ${bundleBefore.slice(0, 12)}`)

// --- first start
launch()
let frame = await served(90_000)
if (!check(frame !== undefined, 'the app starts and its host serves the frame')) {
  console.log(`failures: ${String(failures)}`)
  process.exit(failures)
}
const source = join(appsDir, frame.id, 'source')
check(
  existsSync(join(source, '.git')) && existsSync(join(source, 'blend.yaml')),
  `the first app "${frame.id}" is made in the OS data folder with its own repository`,
)
check(
  (await until(frame, 'app/', (text) => text.includes('<h1>'), 5_000)) !== undefined,
  'the first page is served',
)
const fresh = spawnSync('git', ['status', '--short'], { cwd: source, encoding: 'utf8' })
check(
  fresh.status === 0 && fresh.stdout.trim() === '',
  `a new app's repository is clean before anyone changed it${fresh.stdout.trim() === '' ? '' : ` (${fresh.stdout.trim().replaceAll('\n', ' | ')})`}`,
)
check(
  (await until(frame, 'app/', (text) => text.includes('<h1>Blank</h1>'), 5_000)) !== undefined,
  "the first page's heading is the app's name (Blank), not the scaffold's folder name",
)

// --- self-extension: what the agent does, with no restart asked for
mkdirSync(join(source, 'plugins', 'notes'), { recursive: true })
writeFileSync(join(source, 'plugins', 'notes', 'index.ts'), plugin('first note'))
// The row the app's AGENTS.md asks for: a feature is a plugin folder and its row in blend.yaml, before the routes row.
const blend = join(source, 'blend.yaml')
const rows = readFileSync(blend, 'utf8')
const routesRow = '    - id: routes\n      name: routes\n'
if (!rows.includes(routesRow)) throw new Error('the walk cannot find the routes row in blend.yaml')
writeFileSync(blend, rows.replace(routesRow, `    - id: notes\n      name: notes\n${routesRow}`))
let took = await until(frame, 'app/notes/items', (text) => text.includes('first note'), 60_000)
check(
  took !== undefined,
  `a plugin (its folder and its row in blend.yaml) written into the running app is served${took === undefined ? ' (not within 60 s)' : ` after ${took.toFixed(1)} s`}`,
)
took = await until(frame, 'app/', (text) => text.includes('<ul id="notes">'), 5_000)
check(took !== undefined, "the plugin's widget is on the home page")
writeFileSync(join(source, 'plugins', 'notes', 'index.ts'), plugin('edited live'))
took = await until(frame, 'app/notes/items', (text) => text.includes('edited live'), 60_000)
check(
  took !== undefined,
  `an edit of the plugin is served${took === undefined ? ' (not within 60 s)' : ` after ${took.toFixed(1)} s`}`,
)

// --- self-repair: the host is killed from outside
const hostPid = frame.pid
killTree(hostPid, true)
await sleep(500)
const repaired = await served(40_000)
const again = repaired !== undefined && alive(repaired.pid) ? repaired : undefined
check(
  again !== undefined &&
    (await until(again, 'app/notes/items', (t) => t.includes('edited live'), 20_000)) !== undefined,
  'a host killed from outside is started again by the app and serves the plugin',
)
frame = again ?? frame

// --- persistence: quit, start again
quitApp(child.pid)
const gone = await (async () => {
  for (let i = 0; i < 40; i += 1) {
    if (!alive(frame.pid) && !alive(child.pid)) return true
    await sleep(500)
  }
  return false
})()
check(
  gone,
  `quitting the app ends the app and its host (nothing is left running)${
    gone
      ? ''
      : ` (still alive: ${[
          ['app', child.pid],
          ['host', frame.pid],
        ]
          .filter(([, pid]) => alive(pid))
          .map(([name, pid]) => `${name} ${pid}`)
          .join(', ')})`
  }`,
)
launch()
frame = await served(90_000)
check(
  frame !== undefined &&
    (await until(frame, 'app/notes/items', (t) => t.includes('edited live'), 20_000)) !== undefined,
  'started again: the same app, the plugin and its edit are there',
)
check(readdirSync(appsDir).length === 1, 'no second app was made')

// --- encapsulation: all of that was done with the bundle only read
check(
  treeHash(bundle) === bundleBefore,
  'the bundle is byte for byte what it was before the first start, after a live edit, a kill, a quit and a restart',
)

// --- update: the whole bundle is replaced, while the app is not running, by a changed copy of itself
if (programDir !== undefined && frame !== undefined) {
  quitApp(child.pid)
  for (let i = 0; i < 40 && (alive(frame.pid) || alive(child.pid)); i += 1) await sleep(500)
  const next = join(scratch, 'bundle-v2')
  cpSync(bundle, next, { recursive: true, verbatimSymlinks: true })
  const home = join(next, programDir, 'plugins', 'home', 'index.ts')
  const text = readFileSync(home, 'utf8')
  const marked = text.replace(
    '<section class="widget"',
    '<section class="widget" data-program="v2"',
  )
  if (marked === text) throw new Error(`the walk cannot mark the framework's home plugin (${home})`)
  writeFileSync(home, marked)
  // A macOS bundle is sealed: the changed copy is signed again, as a real update is signed by its maker.
  if (process.platform === 'darwin')
    spawnSync('codesign', ['--force', '--deep', '--sign', '-', next], { stdio: 'ignore' })
  rmSync(bundle, { recursive: true, force: true })
  cpSync(next, bundle, { recursive: true, verbatimSymlinks: true })
  rmSync(next, { recursive: true, force: true })
  launch()
  frame = await served(90_000)
  check(
    frame !== undefined &&
      (await until(frame, 'app/', (t) => t.includes('data-program="v2"'), 20_000)) !== undefined,
    'after the update the app starts on the new bundle: its framework code is the one served',
  )
  check(
    frame !== undefined &&
      (await until(frame, 'app/notes/items', (t) => t.includes('edited live'), 20_000)) !==
        undefined,
    "after the update the person's plugin and its edit are served by the same app",
  )
  check(readdirSync(appsDir).length === 1, 'the update made no second app')
  const log = spawnSync('git', ['status', '--short'], { cwd: source, encoding: 'utf8' })
  say(
    'INFO',
    `person's repository after the update: ${log.stdout.trim().replaceAll('\n', ' | ') || 'clean'}`,
  )
}

// --- the app's folder
quitApp(child.pid)
await sleep(2_000)
check(
  statSync(join(dataRoot, 'apps', readdirSync(appsDir)[0], 'source')).isDirectory() &&
    readdirSync(join(dataRoot, 'apps', readdirSync(appsDir)[0]))
      .sort()
      .join() === 'cache,data,source',
  "the app's folder holds source, data and cache, and nothing else",
)
console.log(`failures: ${String(failures)}`)
process.exit(failures)
