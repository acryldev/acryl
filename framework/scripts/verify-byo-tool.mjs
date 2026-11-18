#!/usr/bin/env node
// Runs docs/framework/guides/bring-your-own-tool.md as written (spec 049 slice 15): the code blocks whose first line is a path comment are written to those files of a fresh
// `agent` app, the commands the guide lists are the ones this script runs, and the guide's promises are checked: the provider passes the port's suite, the app type-checks,
// the consumer of the port keeps working across the swap (pending while no provider exists, active again after), in the same process, and the swap survives a restart.
//
//   node scripts/verify-byo-tool.mjs [path to the guide]
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const guidePath = resolve(
  process.argv[2] ?? join(root, 'docs/framework/guides/bring-your-own-tool.md'),
)
const cli = join(root, 'packages/cli/bin/acrylblends.js')
const log = (message) => console.log(`verify-byo-tool: ${message}`)
const fail = (message) => {
  throw new Error(`verify-byo-tool: ${message}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const guide = readFileSync(guidePath, 'utf8')
const blocks = [...guide.matchAll(/```(\w+)[^\n]*\n([\s\S]*?)```/gu)].map((m) => ({
  lang: m[1],
  text: m[2],
}))
const files = new Map()
for (const { lang, text } of blocks) {
  const path = lang === 'ts' ? /^\/\/ ([\w./-]+\.ts)\n/u.exec(text)?.[1] : undefined
  if (path) files.set(path, text)
}
for (const need of [
  'plugins/kv-lowdb/index.ts',
  'test/kv-lowdb.spec.ts',
  'plugins/kv/index.ts',
  'plugins/visits/index.ts',
])
  if (!files.has(need)) fail(`the guide has no code block for ${need}`)
// The commands the guide lists are the ones that run.
const commands = blocks
  .filter((b) => b.lang === 'sh')
  .flatMap((b) =>
    b.text
      .split('\n')
      .map((l) => l.replace(/#.*$/u, '').trim())
      .filter(Boolean),
  )
for (const expected of [
  'npx acrylblends add kv --suite',
  'npm install lowdb',
  'npx vitest run test/kv-lowdb.spec.ts',
  '.acryl/bin/acryl plugin add plugins/kv',
  '.acryl/bin/acryl plugin add plugins/visits',
  '.acryl/bin/acryl plugin remove kv',
  '.acryl/bin/acryl plugin add plugins/kv-lowdb',
])
  if (!commands.includes(expected)) fail(`the guide no longer lists the command: ${expected}`)

const scratch = mkdtempSync(join(tmpdir(), 'byo-tool-'))
const env = { ...process.env, npm_config_loglevel: 'error' }
const run = (command, args, cwd) => {
  let r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  // npm 10 (Node 22) can crash while it reworks an existing tree ("Cannot read properties of null (reading 'edgesOut')"): a clean install of the same package.json works.
  if (r.status !== 0 && command === 'npm' && /edgesOut/u.test(r.stderr)) {
    rmSync(join(cwd, 'node_modules'), { recursive: true, force: true })
    rmSync(join(cwd, 'package-lock.json'), { force: true })
    r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  }
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}
let server
try {
  const app = join(scratch, 'app')
  run(process.execPath, [cli, 'init', app, '--template', 'agent', '--bare', '-y'], scratch)
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  // `npx acrylblends add ...` is this checkout's command in the scratch app.
  run(process.execPath, [cli, 'add', 'kv', '--suite'], app)
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  run('npm', ['install', 'lowdb', '--no-audit', '--no-fund'], app)
  for (const [path, text] of files) {
    mkdirSync(dirname(join(app, path)), { recursive: true })
    writeFileSync(join(app, path), text)
  }
  log('step 1 to 3: the port, its suite, the tool and the provider are in place')
  const suite = spawnSync('npx', ['vitest', 'run', 'test/kv-lowdb.spec.ts'], {
    cwd: app,
    env,
    encoding: 'utf8',
  })
  if (suite.status !== 0)
    fail(`the provider fails the conformance suite:\n${suite.stdout}${suite.stderr}`)
  log(`step 4: ${/Tests\s+(\d+) passed/u.exec(suite.stdout)?.[1] ?? '?'} conformance cases pass`)
  run('npm', ['run', 'check'], app)
  log('the app type-checks with the provider in it')

  const door = join(app, '.acryl', 'bin', 'acryl')
  const start = async () => {
    const port = await freePort()
    const child = startGroup('npm', ['start'], {
      cwd: app,
      env: { ...env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (c) => (output += c))
    child.stderr.on('data', (c) => (output += c))
    const end = Date.now() + 40_000
    let url
    while (Date.now() < end && !url) {
      url = /listening on (http:\/\/\S+)/u.exec(output)?.[1]
      if (!url) await sleep(300)
    }
    if (!url) fail(`the app did not start:\n${output}`)
    return { child, url, port }
  }
  const stop = async (child) => {
    await stopGroup(child)
  }
  const doorCall = (...args) => {
    const r = spawnSync(door, [...args, '--json'], { cwd: app, env, encoding: 'utf8' })
    if (r.status !== 0) fail(`.acryl/bin/acryl ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
    return JSON.parse(r.stdout)
  }
  const visits = async (url) => {
    const r = await fetch(`${url}/visits`)
    return r.status === 200 ? (await r.json()).visits : r.status
  }

  let running = await start()
  server = running.child
  const pid = running.child.pid
  if (!existsSync(door)) fail('the running app did not write .acryl/bin/acryl')
  for (const arg of ['kv', 'visits']) {
    const added = doorCall('plugin', 'add', `plugins/${arg}`)
    if (!added.ok || added.state !== 'active')
      fail(`plugin add plugins/${arg}: ${JSON.stringify(added)}`)
  }
  const first = [await visits(running.url), await visits(running.url), await visits(running.url)]
  if (first.join() !== '1,2,3') fail(`visits with the default provider: ${first.join()}`)
  log('step 5: the default provider and the consumer run as plugins; visits 1, 2, 3')

  // Two providers cannot run together; the refusal leaves everything as it was.
  const clash = spawnSync(door, ['plugin', 'add', 'plugins/kv-lowdb', '--json'], {
    cwd: app,
    env,
    encoding: 'utf8',
  })
  if (!/kv/u.test(clash.stdout + clash.stderr) || /"ok":true/u.test(clash.stdout))
    fail(`a second provider next to the first was not refused: ${clash.stdout}${clash.stderr}`)
  if ((await visits(running.url)) !== 4) fail('the refused install changed the running app')
  log('a second provider next to the first is refused and nothing changes')

  doorCall('plugin', 'remove', 'kv')
  const during = doorCall('plugin', 'list').find((p) => p.name === 'visits')
  if (during?.state !== 'pending' || !during.missing.includes('kv'))
    fail(`visits is not pending without a kv provider: ${JSON.stringify(during)}`)
  if ((await visits(running.url)) !== 404) fail('the consumer still answers without a provider')
  const swapped = doorCall('plugin', 'add', 'plugins/kv-lowdb')
  if (!swapped.ok || swapped.state !== 'active')
    fail(`plugin add plugins/kv-lowdb: ${JSON.stringify(swapped)}`)
  const after = [await visits(running.url), await visits(running.url)]
  if (after.join() !== '1,2') fail(`visits after the swap: ${after.join()}`)
  if (running.child.pid !== pid) fail('the process changed')
  log(
    "the swap: visits pending (no kv), active again on kv-lowdb, served by the same process, counting in lowdb's file",
  )

  // It survives a restart: the app remembers what was installed.
  await stop(running.child)
  running = await start()
  server = running.child
  await sleep(1500)
  const restarted = await visits(running.url)
  if (restarted !== 3)
    fail(`after a restart visits answered ${restarted}, expected 3 (lowdb's file kept 2)`)
  log('after a restart the app still runs on kv-lowdb and its data is there')
  await stop(running.child)
  server = undefined
  log('OK')
} finally {
  if (server) await stopGroup(server, 'SIGKILL', 1000)
  rmSync(scratch, { recursive: true, force: true })
}
