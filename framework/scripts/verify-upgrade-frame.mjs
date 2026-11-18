#!/usr/bin/env node
// The upgrade gate of the IDE port: every distinct scaffold the published acrylblends releases shipped gets `acrylblends upgrade`, and the result is checked.
//
//   node --import ./scripts/workspace-source.mjs scripts/verify-upgrade-frame.mjs [--keep]
//
// The fixtures are the `packages/cli/legacy` files (built from the release tags by `scripts/build-legacy-layouts.mjs`). Each app is scaffolded by this
// checkout's CLI, so it carries the current plugin copies, and then its scaffold is replaced by the released files; the upgrade must replace only the
// template's own files and none of the app's code or blend.yaml. Releases before 0.7.8 wrote an entry module importing './plugins/...' that cannot start,
// so their apps are built with that main.ts and the gate asserts the precise report instead of a frame. The oldest release whose layout can be carried
// forward per template is installed and booted (the frame page and /app answer), and the newest agent layout is upgraded and then runs the full page gate.
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frameSpecsEnv } from './lib/ide-specs.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const legacy = join(root, 'packages/cli/legacy')
const keep = process.argv.includes('--keep')
const log = (message) => console.log(`verify-upgrade-frame: ${message}`)
const fail = (message) => {
  throw new Error(`verify-upgrade-frame: ${message}`)
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const DSH_VERSION = process.env.IDE_PROFILE_DSH_VERSION ?? '0.2.0-rc.2'
const frameEnv = {
  ACRYLBLENDS_FRAME_PACKAGES: frameSpecsEnv(root, { dshVersion: DSH_VERSION }),
}
if (!existsSync(join(root, 'packages', 'cli', 'dist', 'index.js')))
  fail('the CLI is not built (run pnpm run build)')
if (!existsSync(join(legacy, 'layouts.json')))
  fail('the legacy fixtures are missing (run node scripts/build-legacy-layouts.mjs)')

const FRAMED = ['blank', 'nodejs', 'notes', 'chat', 'todo', 'agent']
/** The first release whose scaffold an upgrade can carry forward: 0.7.8 fixed the entry module's plugin imports. */
const FIXED_FROM = '0.7.8'
const compare = (a, b) => {
  const pa = a.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  const pb = b.split(/[.-]/u).map((part) => (Number.isNaN(Number(part)) ? part : Number(part)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

const index = JSON.parse(readFileSync(join(legacy, 'layouts.json'), 'utf8'))
const releasesFor = (template, id) =>
  index.releases.filter((release) => release.layouts[template] === id)
const fromBrokenEra = (template, id) => {
  const users = releasesFor(template, id)
  return users.length > 0 && users.every((release) => compare(release.version, FIXED_FROM) < 0)
}
const variantFiles = (template, id) => {
  const files = new Map()
  const walk = (at, base) => {
    for (const entry of readdirSync(at)) {
      const path = join(at, entry)
      if (statSync(path).isDirectory()) walk(path, `${base}${entry}/`)
      else files.set(`${base}${entry}`, readFileSync(path, 'utf8'))
    }
  }
  walk(join(legacy, template, id), '')
  return files
}
const variants = (template) =>
  readdirSync(join(legacy, template))
    .filter((entry) => statSync(join(legacy, template, entry)).isDirectory())
    .sort()

const scratch = mkdtempSync(join(tmpdir(), 'upgrade-frame-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
const run = (command, args, cwd, extraEnv = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...env, ...extraEnv } })
  if (result.status !== 0)
    fail(
      `${command} ${args.join(' ')} failed (exit ${String(result.status)}):\n${result.stdout}${result.stderr}`,
    )
  return result.stdout
}

/**
 * An app of a released scaffold: scaffolded now (so it carries the plugin copies), then the released files, no frame row, no host plugins, and a file of the
 * app's own. `broken` writes the entry module the releases before 0.7.8 had (`./plugins/...`), which cannot start.
 */
function fixture(name, template, files, broken) {
  const app = join(scratch, name)
  const initEnv = { ...env }
  delete initEnv.ACRYLBLENDS_FRAME_PACKAGES
  spawnSync(
    process.execPath,
    [cli, 'init', app, '--name', name, '--template', template, '--bare', '--yes', '--no-next'],
    { cwd: scratch, encoding: 'utf8', env: initEnv },
  )
  if (!existsSync(join(app, 'blend.yaml'))) fail(`${name}: init did not scaffold the fixture`)
  if (existsSync(join(app, 'cordis.patch.yml')))
    fail(`${name}: the fixture was scaffolded with a frame profile`)
  for (const [file, text] of files)
    writeFileSync(join(app, file), text.replaceAll('__APP_NAME__', name))
  rmSync(join(app, 'src', 'frame.ts'))
  rmSync(join(app, 'frame'), { recursive: true, force: true })
  for (const plugin of ['acryl-page', 'acryl-web-server'])
    rmSync(join(app, 'plugins', plugin), { recursive: true, force: true })
  writeFileSync(join(app, 'src', 'mine.txt'), 'a file of the app\n')
  if (broken)
    writeFileSync(
      join(app, 'src', 'main.ts'),
      readFileSync(join(app, 'src', 'main.ts'), 'utf8').replaceAll(
        "from '../plugins/",
        "from './plugins/",
      ),
    )
  return app
}

/** Check a safe layout's upgrade: every changed file reported, the rows and the composition root right. */
function checkUpgraded(app, template, report) {
  for (const expected of [
    'cordis.patch.yml added',
    'cordis.yml added',
    'scripts/ide-host.mjs added',
    'app/runtime.mjs added',
    'src/frame.ts added',
    'plugins/acryl-web-server added',
    'plugins/acryl-page added',
    'package.json merged',
  ])
    if (!report.includes(expected))
      fail(`${app}: the upgrade did not report "${expected}":\n${report}`)
  const overlay = readFileSync(join(app, 'cordis.patch.yml'), 'utf8')
  for (const row of ['- id: app-routes', 'name: ./src/frame.ts'])
    if (!overlay.includes(row)) fail(`${app}: the overlay is missing ${JSON.stringify(row)}`)
  if (template !== 'blank' && !overlay.includes('- id: app-plugins'))
    fail(`${app}: the ${template} overlay has no app-plugins row:\n${overlay}`)
  const appTs = readFileSync(join(app, 'src', 'app.ts'), 'utf8')
  if (template !== 'blank' && !appTs.includes('export async function composeInto'))
    fail(`${app}: src/app.ts was not brought up to date`)
  if (template === 'agent' && !appTs.includes("'agent-panel': { mount: FRAME_MOUNT_PREFIX }"))
    fail(`${app}: src/app.ts does not pass the mount to the panel`)
}

try {
  // 1. Every distinct scaffold: the safe ones upgrade and settle, the ones before 0.7.8 are reported precisely.
  let upgraded = 0
  let refused = 0
  for (const template of FRAMED) {
    for (const id of variants(template)) {
      const name = `${template}-${id}`
      const broken = fromBrokenEra(template, id)
      const app = fixture(name, template, variantFiles(template, id), broken)
      const blendBefore = readFileSync(join(app, 'blend.yaml'), 'utf8')
      const versions = releasesFor(template, id).map((release) => release.version)
      if (broken) {
        const report = run(process.execPath, [cli, 'upgrade'], app, frameEnv)
        if (
          !/src\/main\.ts imports '\.\/plugins\/\.\.\.', as acrylblends 0\.3\.0 through 0\.7\.7/u.test(
            report,
          )
        )
          fail(`${name} (${versions.join(', ')}): the pre-0.7.8 entry was not reported:\n${report}`)
        if (existsSync(join(app, 'cordis.patch.yml')) || existsSync(join(app, 'src', 'frame.ts')))
          fail(`${name}: a frame was written for an app that cannot start`)
        if (readFileSync(join(app, 'blend.yaml'), 'utf8') !== blendBefore)
          fail(`${name}: the upgrade changed blend.yaml`)
        refused += 1
        continue
      }
      const report = run(process.execPath, [cli, 'upgrade'], app, frameEnv)
      checkUpgraded(app, template, report)
      if (readFileSync(join(app, 'blend.yaml'), 'utf8') !== blendBefore)
        fail(`${name}: the upgrade changed blend.yaml`)
      if (readFileSync(join(app, 'src', 'mine.txt'), 'utf8') !== 'a file of the app\n')
        fail(`${name}: the upgrade changed a file of the app`)
      const second = run(process.execPath, [cli, 'upgrade'], app, frameEnv)
      if (!/everything is up to date/u.test(second))
        fail(`${name}: a second upgrade did not settle:\n${second}`)
      upgraded += 1
    }
  }
  log(
    `every distinct scaffold is handled: ${String(upgraded)} upgrade and settle, ${String(refused)} (before 0.7.8) are reported as unable to start`,
  )

  // 2. The oldest scaffold that can be carried forward, per template: install, boot the frame on a free port, the frame page and /app answer, stop.
  for (const template of FRAMED) {
    const oldest = variants(template)
      .map((id) => ({ id, users: releasesFor(template, id) }))
      .filter(({ users }) => users.every((release) => compare(release.version, FIXED_FROM) >= 0))
      .sort((a, b) => compare(a.users[0].version, b.users[0].version))[0]
    if (oldest === undefined) fail(`no releasable ${template} layout`)
    const version = oldest.users[0].version
    const app = fixture(`boot-${template}`, template, variantFiles(template, oldest.id), false)
    run(process.execPath, [cli, 'upgrade'], app, frameEnv)
    run('npm', ['install', '--no-audit', '--no-fund'], app)
    const bootEnv = {
      ...process.env,
      ACRYLBLENDS_HOME: join(app, '.acrylblends'),
      DSH_HOME: join(app, '.acrylblends'),
      ACRYLBLENDS_PORT: '0',
    }
    const server = startGroup('npm', ['run', 'dev'], {
      cwd: app,
      env: bootEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    server.stdout.on('data', (chunk) => (output += chunk))
    server.stderr.on('data', (chunk) => (output += chunk))
    try {
      let url
      for (let waited = 0; waited < 180_000 && url === undefined; waited += 500) {
        url = /acrylblends host: (http:\/\/127\.0\.0\.1:\d+\/?\S*)/u.exec(output)?.[1]
        if (url === undefined) await sleep(500)
      }
      if (url === undefined)
        fail(`${version} ${template} did not boot the frame:\n${output.slice(-2000)}`)
      const origin = new URL(url).origin
      // The launch URL answers 303 and sets the session cookie; fetch does not carry cookies across redirects, so take it and ask again with it.
      const auth = await fetch(url, { redirect: 'manual' })
      const cookie = auth.headers
        .getSetCookie()
        .map((entry) => entry.split(';')[0])
        .join('; ')
      let page
      for (let waited = 0; waited < 60_000 && page === undefined; waited += 500) {
        page = await fetch(`${origin}/`, { headers: cookie === '' ? {} : { cookie } })
          .then((response) => response.text())
          .catch(() => undefined)
        if (page !== undefined && !page.includes('__DSH_BOOT__')) page = undefined
        if (page === undefined) await sleep(500)
      }
      if (page === undefined)
        fail(`${version} ${template}: the frame page did not answer:\n${output.slice(-2000)}`)
      const appPage = await fetch(`${origin}/app`, {
        headers: cookie === '' ? {} : { cookie },
      }).catch(() => undefined)
      if (appPage === undefined || appPage.status !== 200)
        fail(`${version} ${template}: /app answered ${String(appPage?.status)}`)
      log(`the ${version} ${template} layout boots the frame and answers at /app`)
      await stopGroup(server)
      await sleep(500)
      const port = new URL(url).port
      const holder = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
        encoding: 'utf8',
      }).stdout.trim()
      if (holder !== '') fail(`${template}: port ${port} is still held after stopping`)
    } finally {
      await stopGroup(server).catch(() => {})
    }
  }

  // 3. The newest layout through the full page gate: a 1.1.0 agent app, upgraded, then checked in Chrome (composition, /app, the panel run, the PTY, the chat).
  const revised = index.releases.find((release) => release.version === '1.1.0')
  if (revised === undefined || revised.layouts.agent === undefined)
    fail('the 1.1.0 agent layout is not in the fixtures')
  const gateApp = fixture(
    'upgrade-page-gate',
    'agent',
    variantFiles('agent', revised.layouts.agent),
    false,
  )
  run(process.execPath, [cli, 'upgrade'], gateApp, frameEnv)
  log('running the page gate on an upgraded 1.1.0 agent app (--existing)')
  const gate = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/workspace-source.mjs',
      'scripts/verify-ide-template.mjs',
      'agent',
      '--existing',
      gateApp,
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, ...frameEnv } },
  )
  if (gate.status !== 0)
    fail(`the page gate failed (exit ${String(gate.status)}):\n${gate.stdout}${gate.stderr}`)
  for (const line of gate.stdout.split('\n'))
    if (line.startsWith('verify-ide-template(agent): '))
      log(`page gate: ${line.replace('verify-ide-template(agent): ', '')}`)
  log('OK')
} finally {
  if (keep) log(`kept ${scratch}`)
  else rmSync(scratch, { recursive: true, force: true })
}
