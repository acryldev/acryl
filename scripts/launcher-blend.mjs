#!/usr/bin/env node
/**
 * `pnpm launcher blend`: the ACRYL launcher inside the Blends frame (spec 050 T016), in a desktop window. Nothing is rebuilt from scratch: the frame, its right
 * panel (chat, Claude Code, Codex, Pi, terminal) and its theme are a Blends app made by `create-acrylblends`; the launcher is its canvas.
 *   1. builds the launcher's page bundle (`plugins/acryl-launcher-desktop/lib/page.js`);
 *   2. makes the Blends app once, in `~/.acryl/launcher` (`ACRYL_LAUNCHER_APP` moves it), and on every run copies the launcher into it: the page, the Host
 *      half (`blend/host` with the shared `src` sources and `plugins/acryl-launcher`), the page route and the app's `blend.yaml` row;
 *   3. starts the app and opens a window on it (`blend/window.cjs`: no left panel, the right panel open). Closing the window stops the app.
 * The launcher lists and makes apps in `~/.acryl` (`ACRYL_LAUNCHER_HOME` moves it), the same home the ACRYL app uses.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'plugins/acryl-launcher-desktop')
const userHome = process.env.HOME ?? process.env.USERPROFILE
if (!userHome) { console.error('launcher blend: no HOME'); process.exit(2) }
const launcherHome = process.env.ACRYL_LAUNCHER_HOME ?? join(userHome, '.acryl')
const app = process.env.ACRYL_LAUNCHER_APP ?? join(launcherHome, 'launcher')

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) { console.error(`launcher blend: ${command} ${args.join(' ')} failed`); process.exit(result.status ?? 1) }
}

console.log('launcher blend: building the launcher page')
run('node', ['scripts/with-build-lock.mjs', 'corepack', 'pnpm', '--filter', 'acryl-launcher-desktop', 'run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })

if (!existsSync(join(app, 'blend.yaml'))) {
  console.log(`launcher blend: making the Blends app in ${app} (once)`)
  mkdirSync(dirname(app), { recursive: true })
  run('npx', ['-y', 'create-acrylblends@latest', app.split(/[\\/]/u).pop(), 'blank', '--no-start'], { cwd: dirname(app) })
}

// The Host half: the Blend entry and its package, the shared sources (imports rewritten to the names a Blends app has), the launcher journeys.
const host = join(app, 'plugins/acryl-launcher-host')
mkdirSync(join(host, 'launcher-lib'), { recursive: true })
for (const file of ['index.ts', 'package.json']) copyFileSync(join(pkg, 'blend/host', file), join(host, file))
for (const file of ['contract.ts', 'door.ts', 'registry.ts', 'route.ts', 'runner.ts', 'service.ts']) {
  const text = readFileSync(join(pkg, 'src', file), 'utf8')
    .replaceAll("from 'acryl-launcher'", "from './launcher-lib/index.js'")
    .replaceAll("from 'acryl-loopback-http/router'", "from '@acrylblends/loopback-http/router'")
    .replaceAll("from 'acryl-loopback-http'", "from '@acrylblends/loopback-http'")
  writeFileSync(join(host, file), text)
}
const lib = join(root, 'plugins/acryl-launcher')
for (const file of readdirSync(lib)) if (/\.(js|d\.ts)$/u.test(file)) copyFileSync(join(lib, file), join(host, 'launcher-lib', file))

// The page: the bundle, served at the app's root with its API under the frame's /app prefix.
mkdirSync(join(app, 'public'), { recursive: true })
copyFileSync(join(pkg, 'lib/page.js'), join(app, 'public/launcher.js'))
const routesFile = join(app, 'src/routes.ts')
let routes = readFileSync(routesFile, 'utf8')
if (!routes.includes('launcherPage')) {
  routes = routes
    .replace("import type { Context }", "import { readFileSync } from 'node:fs'\nimport type { Context }")
    .replace('/**\n * The app\'s own pages and routes', 'const launcherPage = (): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ACRYL</title><style>html,body{margin:0;background:#151517}</style></head><body><div id="acryl-launcher" data-base="/app"></div><script src="./launcher.js"></script></body></html>`\n\n/**\n * The app\'s own pages and routes')
    .replace(".get('/', async (c) =>", ".get('/', (c) => c.html(launcherPage()))\n      .get('/launcher.js', (c) => c.body(readFileSync(new URL('../public/launcher.js', import.meta.url)), 200, { 'content-type': 'text/javascript; charset=utf-8' }))\n      // The template's own first screen, kept at /home.\n      .get('/home', async (c) =>")
  if (!routes.includes('launcherPage()')) { console.error(`launcher blend: ${routesFile} is not the shape this script knows; the Blends template changed`); process.exit(1) }
  writeFileSync(routesFile, routes)
}
const blendFile = join(app, 'blend.yaml')
const blend = readFileSync(blendFile, 'utf8')
if (!blend.includes('acryl-launcher-host')) {
  const row = '    - id: server\n      name: acryl-node-server'
  if (!blend.includes(row)) { console.error(`launcher blend: ${blendFile} has no server row; the Blends template changed`); process.exit(1) }
  writeFileSync(blendFile, blend.replace(row, `    - id: acryl-launcher-host\n      name: acryl-launcher-host\n${row}`))
}
// The window's own files and the app's log are not the app's.
const ignore = join(app, '.gitignore')
const ignored = existsSync(ignore) ? readFileSync(ignore, 'utf8') : ''
if (!ignored.includes('.acryl-window/')) writeFileSync(ignore, `${ignored}${ignored.endsWith('\n') || ignored === '' ? '' : '\n'}.acryl-window/\n.acryl-launcher.log\n`)
// Saved, so the frame shows the app as saved rather than every copied file as a change.
spawnSync('git', ['add', '-A'], { cwd: app })
spawnSync('git', ['commit', '-qm', 'ACRYL launcher'], { cwd: app })

console.log('launcher blend: starting the app')
const log = join(app, '.acryl-launcher.log')
const server = spawn('npm', ['run', 'dev'], { cwd: app, detached: true, stdio: ['ignore', openSync(log, 'w'), openSync(log, 'a')], env: { ...process.env, ACRYL_LAUNCHER_HOME: launcherHome } })
const stop = () => { try { process.kill(-server.pid, 'SIGTERM') } catch { /* already gone */ } }
process.on('exit', stop)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(130) })

let url
for (let waited = 0; waited < 180_000 && url === undefined; waited += 1000) {
  url = /acrylblends host: (\S+)/u.exec(readFileSync(log, 'utf8'))?.[1]
  if (url === undefined) await new Promise(done => setTimeout(done, 1000))
}
if (url === undefined) { console.error(`launcher blend: the app did not start, see ${log}`); process.exit(1) }
console.log(`launcher blend: ${url}`)

const electron = createRequire(join(root, 'apps/acryl-desktop/package.json'))('electron')
const window = spawnSync(electron, [`--user-data-dir=${join(app, '.acryl-window')}`, join(pkg, 'blend')], { stdio: 'inherit', env: { ...process.env, LAUNCHER_URL: url } })
process.exit(window.status ?? 0)
