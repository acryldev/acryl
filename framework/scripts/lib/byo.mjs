// The gate of spec 049 slice 15 ("bring your own tool"): an agent follows docs/framework/guides/bring-your-own-tool.md alone and swaps a provider of the kv port into a RUNNING app
// through the door. This module makes the guide's starting point (the port and its suite in the app, the default provider and a consumer running as plugins) and checks the result.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './port.mjs'
import { startGroup } from './proc.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The code blocks of the guide whose first line is a path comment, by path. */
function guideFiles() {
  const file = process.env.BYO_GUIDE ?? join(root, 'docs/framework/guides/bring-your-own-tool.md')
  const text = readFileSync(file, 'utf8')
  const files = new Map()
  for (const m of text.matchAll(/```ts[^\n]*\n([\s\S]*?)```/gu)) {
    const path = /^\/\/ ([\w./-]+\.ts)\n/u.exec(m[1])?.[1]
    if (path) files.set(path, m[1])
  }
  return files
}

const door = (app, env, ...args) => {
  const r = spawnSync(join(app, '.acryl', 'bin', 'acryl'), [...args, '--json'], {
    cwd: app,
    env,
    encoding: 'utf8',
  })
  try {
    return { status: r.status, value: JSON.parse(r.stdout) }
  } catch {
    return { status: r.status, value: undefined, text: r.stdout + r.stderr }
  }
}

export async function startByoApp(app, env, acrylblends) {
  try {
    const run = (cmd, args) => {
      const r = spawnSync(cmd, args, { cwd: app, env, encoding: 'utf8' })
      if (r.status !== 0)
        throw new Error(`${cmd} ${args.join(' ')}: ${(r.stdout + r.stderr).slice(-300)}`)
    }
    run(acrylblends, ['add', 'kv', '--suite'])
    run('npm', ['install', '--no-audit', '--no-fund'])
    const files = guideFiles()
    for (const path of ['plugins/kv/index.ts', 'plugins/visits/index.ts']) {
      if (!files.has(path)) throw new Error(`the guide has no block for ${path}`)
      mkdirSync(dirname(join(app, path)), { recursive: true })
      writeFileSync(join(app, path), files.get(path))
    }
    const port = await freePort()
    const child = startGroup('npm', ['start'], {
      cwd: app,
      env: { ...env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (c) => (output += c))
    child.stderr.on('data', (c) => (output += c))
    let url
    for (let i = 0; i < 100 && !url; i++) {
      url = /listening on (http:\/\/\S+)/u.exec(output)?.[1]
      if (!url) await sleep(300)
    }
    if (!url) throw new Error(`the app did not start: ${output.slice(-300)}`)
    for (const name of ['kv', 'visits']) {
      const added = door(app, env, 'plugin', 'add', `plugins/${name}`)
      if (!added.value?.ok) throw new Error(`plugin add plugins/${name}: ${JSON.stringify(added)}`)
    }
    const first = await (await fetch(`${url}/visits`)).json()
    if (first.visits !== 1) throw new Error(`visits answered ${JSON.stringify(first)}`)
    return { ok: true, child, url, pid: child.pid }
  } catch (error) {
    return { ok: false, note: error.message }
  }
}

/** What the guide promises, checked on the app the agent worked on. Returns { ok, steps }. */
export async function probeByo(app, env, running) {
  const steps = []
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? 'ok' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
    return ok
  }
  let alive = true
  try {
    process.kill(running.pid, 0)
  } catch {
    alive = false
  }
  step(
    'the running app was not restarted or stopped (same process)',
    alive && running.child.exitCode === null,
  )
  const list = door(app, env, 'plugin', 'list').value
  const plugins = Array.isArray(list) ? list : []
  const visits = plugins.find((p) => p.name === 'visits')
  step('the consumer (visits) is active', visits?.state === 'active', JSON.stringify(visits))
  step('the old provider is out of the running app', !plugins.some((p) => p.name === 'kv'))
  const providers = plugins.filter(
    (p) => !['kv', 'visits'].includes(p.name) && p.state === 'active',
  )
  step(
    "a provider of the agent's own is installed and active",
    providers.length >= 1,
    plugins.map((p) => `${p.name}:${p.state}`).join(', '),
  )
  const a = await fetch(`${running.url}/visits`).then(
    (r) => (r.status === 200 ? r.json() : r.status),
    () => 'unreachable',
  )
  const b = await fetch(`${running.url}/visits`).then(
    (r) => (r.status === 200 ? r.json() : r.status),
    () => 'unreachable',
  )
  step(
    'GET /visits counts, served by the new provider',
    typeof a?.visits === 'number' && b?.visits === a.visits + 1,
    `${JSON.stringify(a)} ${JSON.stringify(b)}`,
  )
  // The provider wraps `conf`, and a spec runs the port's conformance suite on it.
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  step('the tool (conf) is a dependency of the app', Boolean(pkg.dependencies?.conf))
  const specs = existsSync(join(app, 'test'))
    ? readdirSync(join(app, 'test')).filter((f) => /\.spec\.ts$/u.test(f))
    : []
  const suiteSpec = specs.find((f) =>
    /describeKvConformance/u.test(readFileSync(join(app, 'test', f), 'utf8')),
  )
  step('a spec runs describeKvConformance', suiteSpec !== undefined, specs.join(', '))
  if (suiteSpec) {
    const r = spawnSync('npx', ['vitest', 'run', `test/${suiteSpec}`], {
      cwd: app,
      env,
      encoding: 'utf8',
    })
    step(
      'the provider passes the conformance suite',
      r.status === 0,
      (r.stdout + r.stderr)
        .split('\n')
        .filter((l) => /FAIL|×|failed/u.test(l))
        .slice(0, 2)
        .join(' | '),
    )
  }
  return { ok: steps.every((line) => line.startsWith('ok ')), steps }
}
