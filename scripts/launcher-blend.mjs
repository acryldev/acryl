#!/usr/bin/env node
/**
 * `pnpm launcher gui` (alias `blend`): the ACRYL launcher inside the Blends frame (spec 050 T016), in a desktop window. Nothing is rebuilt from scratch: the frame,
 * its right panel (chat, Claude Code, Codex, Pi, terminal), its theme and its desktop window are a Blends app made by `create-acrylblends`; the launcher is its canvas.
 *   1. builds the launcher's page bundle (`plugins/acryl-launcher-desktop/lib/page.js`);
 *   2. makes the Blends app once, in `~/.acryl/launcher` (`ACRYL_LAUNCHER_APP` moves it), and on every run brings the launcher in it up to date: the page, the Host
 *      half (`blend/host` with the shared `src` sources and `plugins/acryl-launcher`), the page route and the app's `blend.yaml` row (a file is written only when it
 *      changed, so a launcher already open is not reloaded for nothing);
 *   3. opens it with the app's own `npm run desktop`, the Blends desktop window: it starts the app's server or joins the one running, keeps one window per app
 *      (a second start brings it forward), keeps its window data in the app, and stops the server when the window closes. The page itself closes the frame's left
 *      panel and opens the right one (`src/page/frame-panels.ts`), so the browser shows the same.
 * The launcher lists and makes apps in `~/.acryl` (`ACRYL_LAUNCHER_HOME` moves it), the same home the ACRYL app uses.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'plugins/acryl-launcher-desktop')
const userHome = process.env.HOME ?? process.env.USERPROFILE
if (!userHome) { console.error('launcher blend: no HOME'); process.exit(2) }
const launcherHome = process.env.ACRYL_LAUNCHER_HOME ?? join(userHome, '.acryl')
const app = process.env.ACRYL_LAUNCHER_APP ?? join(launcherHome, 'launcher')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) { console.error(`launcher blend: ${command} ${args.join(' ')} failed`); process.exit(result.status ?? 1) }
}
/** Write only what changed: the running frame host reloads on every write under src/ and plugins/. */
const put = (file, content) => {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(content))) return
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

console.log('launcher blend: building the launcher page')
run('node', ['scripts/with-build-lock.mjs', 'corepack', 'pnpm', '--filter', 'acryl-launcher-desktop', 'run', 'build'], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })

if (!existsSync(join(app, 'blend.yaml'))) {
  console.log(`launcher blend: making the Blends app in ${app} (once)`)
  mkdirSync(dirname(app), { recursive: true })
  run('npx', ['-y', 'create-acrylblends@latest', app.split(/[\\/]/u).pop(), 'blank', '--no-start'], { cwd: dirname(app), shell: process.platform === 'win32' })
}

// The Host half: the Blend entry and its package, the shared sources (imports rewritten to the names a Blends app has), the launcher journeys.
const host = join(app, 'plugins/acryl-launcher-host')
for (const file of ['index.ts', 'package.json']) put(join(host, file), readFileSync(join(pkg, 'blend/host', file)))
for (const file of ['contract.ts', 'door.ts', 'registry.ts', 'route.ts', 'runner.ts', 'service.ts']) {
  put(join(host, file), readFileSync(join(pkg, 'src', file), 'utf8')
    .replaceAll("from 'acryl-launcher'", "from './launcher-lib/index.js'")
    .replaceAll("from 'acryl-loopback-http/router'", "from '@acrylblends/loopback-http/router'")
    .replaceAll("from 'acryl-loopback-http'", "from '@acrylblends/loopback-http'"))
}
const lib = join(root, 'plugins/acryl-launcher')
for (const file of readdirSync(lib)) if (/\.(js|d\.ts)$/u.test(file)) put(join(host, 'launcher-lib', file), readFileSync(join(lib, file)))

// The page: the bundle, served at the app's root with its API under the frame's /app prefix.
put(join(app, 'public/launcher.js'), readFileSync(join(pkg, 'lib/page.js')))
const routesFile = join(app, 'src/routes.ts')
const routes = readFileSync(routesFile, 'utf8')
if (!routes.includes('launcherPage')) {
  const patched = routes
    .replace("import type { Context }", "import { readFileSync } from 'node:fs'\nimport type { Context }")
    .replace('/**\n * The app\'s own pages and routes', 'const launcherPage = (): string => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ACRYL</title><style>html,body{margin:0;background:#151517}</style></head><body><div id="acryl-launcher" data-base="/app"></div><script src="./launcher.js"></script></body></html>`\n\n/**\n * The app\'s own pages and routes')
    .replace(".get('/', async (c) =>", ".get('/', (c) => c.html(launcherPage()))\n      .get('/launcher.js', (c) => c.body(readFileSync(new URL('../public/launcher.js', import.meta.url)), 200, { 'content-type': 'text/javascript; charset=utf-8' }))\n      // The template's own first screen, kept at /home.\n      .get('/home', async (c) =>")
  if (!patched.includes('launcherPage()')) { console.error(`launcher blend: ${routesFile} is not the shape this script knows; the Blends template changed`); process.exit(1) }
  put(routesFile, patched)
}
const blendFile = join(app, 'blend.yaml')
const blend = readFileSync(blendFile, 'utf8')
if (!blend.includes('acryl-launcher-host')) {
  const row = '    - id: server\n      name: acryl-node-server'
  if (!blend.includes(row)) { console.error(`launcher blend: ${blendFile} has no server row; the Blends template changed`); process.exit(1) }
  put(blendFile, blend.replace(row, `    - id: acryl-launcher-host\n      name: acryl-launcher-host\n${row}`))
}
// The window, the Dock and the frame's header name the app after its package and draw its `assets/icon.png`: ACRYL, with ACRYL's icon.
const manifestFile = join(app, 'package.json')
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
if (manifest.name !== 'ACRYL') put(manifestFile, `${JSON.stringify({ ...manifest, name: 'ACRYL' }, null, 2)}\n`)
put(join(app, 'assets/icon.png'), readFileSync(join(root, 'apps/acryl-desktop/build/app-icon.png')))
// Saved, so the frame shows the app as saved rather than every copied file as a change (nothing to save when nothing changed).
spawnSync('git', ['add', '-A'], { cwd: app })
spawnSync('git', ['commit', '-qm', 'ACRYL launcher'], { cwd: app })

console.log('launcher blend: opening the window (npm run desktop)')
// npm run desktop passes Ctrl+C and stop signals to the window, which stops the app's server as it closes.
const desktop = spawn(npm, ['run', 'desktop'], { cwd: app, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ACRYL_LAUNCHER_HOME: launcherHome } })
desktop.on('exit', (code, signal) => process.exit(code ?? (signal === null ? 0 : 1)))
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { /* npm and the window end on the same signal; this waits for them */ })
