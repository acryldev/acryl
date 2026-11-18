#!/usr/bin/env node
/**
 * A rehearsal of the workshop on this computer, with the installed app: several people each start their own app, write one small plugin, share it to a
 * GitHub account, and one more app (the host's) pulls every one of those plugins by a single list and serves them all together.
 *
 *   node scripts/rehearse-workshop.mjs --bundle <ACRYL Blends.app> --owner <test account or organization> --scratch <empty folder>
 *        [--people ana,ben,cleo] [--keep]      (macOS: the bundle is copied into the scratch folder and the copy is run; the installed one is not touched)
 *
 * What it stands in for, and what it does not:
 *   - Each person is a copy of the app with its own home folder (HOME), so their apps, data and git settings never meet. It never touches the real
 *     data folder of the person running it.
 *   - The plugin is written by this script, where at the workshop the app's agent writes it. The share is the frame's own: the plan the person would be
 *     asked about (`share-plan`, public), then the share of exactly that plan. It goes to `--owner` through `shareOwner` in a scratch copy of the bundle's
 *     frame row, and it refuses to run when `--owner` is the signed-in `gh` account: a rehearsal never publishes under a person's own name.
 *   - The host's app takes the pulled list through the door's `plugin pull --from`, as a person (or the host's agent) would.
 *
 * Needs `gh` signed in (the shares are real repositories and releases in `--owner`; delete them there when done).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}
const bundleArg = option('--bundle')
const owner = option('--owner')
const scratch = option('--scratch')
const people = (option('--people', 'ana,ben,cleo') ?? '').split(',').filter((name) => name !== '')
const keep = args.includes('--keep')
if (!bundleArg || !owner || !scratch) {
  console.error(
    'usage: rehearse-workshop.mjs --bundle <ACRYL Blends.app> --owner <account> --scratch <empty folder> [--people a,b] [--keep]',
  )
  process.exit(2)
}

let failed = 0
const say = (tag, text) => console.log(`${tag} ${text}`)
const check = (ok, text) => {
  if (!ok) failed += 1
  say(ok ? 'PASS' : 'FAIL', text)
  return ok
}

const login = execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' }).trim()
if (login.toLowerCase() === owner.toLowerCase()) {
  console.error(
    `refusing: --owner ${owner} is the signed-in account. A rehearsal publishes to a test organization, never under a person's own name.`,
  )
  process.exit(2)
}
if (existsSync(scratch) && readdirSync(scratch).length > 0) {
  console.error(`refusing: ${scratch} is not empty`)
  process.exit(2)
}
mkdirSync(scratch, { recursive: true })

// --- one copy of the bundle's Program per run, with the share going to the test account (the frame row's own option)
const bundle = join(scratch, 'ACRYL Blends.app')
execFileSync('ditto', [resolve(bundleArg), bundle])
const exe = join(bundle, 'Contents', 'MacOS', 'ACRYL Blends')
const patchFile = join(bundle, 'Contents', 'Resources', 'app', 'cordis.patch.yml')
const patch = readFileSync(patchFile, 'utf8')
if (!patch.includes('appPage: /app\n'))
  throw new Error('the frame row has no appPage line to put shareOwner after')
writeFileSync(
  patchFile,
  patch.replace('appPage: /app\n', `appPage: /app\n        shareOwner: ${owner}\n`),
)

const gitconfig = join(scratch, 'gitconfig')
writeFileSync(
  gitconfig,
  '[user]\n\tname = Workshop Rehearsal\n\temail = rehearsal@example.invalid\n[credential "https://github.com"]\n\thelper =\n\thelper = !gh auth git-credential\n[init]\n\tdefaultBranch = main\n',
)
const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()

const children = []
const environmentOf = (home) => {
  const env = { ...process.env, HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GH_TOKEN: token }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

/** Start one person's app (the scratch copy of the bundle, with their own home folder) and answer where its host listens. */
async function startApp(who) {
  const home = join(scratch, who)
  mkdirSync(home, { recursive: true })
  const child = spawn(exe, [], { env: environmentOf(home), stdio: 'ignore', detached: true })
  children.push(child)
  const apps = join(home, 'Library', 'Application Support', 'ACRYL Blends', 'apps')
  for (let i = 0; i < 120; i += 1) {
    await sleep(500)
    if (!existsSync(apps)) continue
    const id = readdirSync(apps).find((name) =>
      existsSync(join(apps, name, 'data', 'frame-url.json')),
    )
    if (id === undefined) continue
    const frame = JSON.parse(readFileSync(join(apps, id, 'data', 'frame-url.json'), 'utf8'))
    return {
      who,
      home,
      child,
      source: join(apps, id, 'source'),
      url: frame.url.split('?')[0].replace(/\/$/u, ''),
      token: frame.token,
    }
  }
  throw new Error(`${who}: the app did not start`)
}

/** The page's own session: what the frame's page holds after it opens, and what its own calls carry. */
async function session(app) {
  const response = await fetch(`${app.url}/?token=${app.token}`, { redirect: 'manual' })
  const cookie = (response.headers.getSetCookie?.() ?? [])
    .map((line) => line.split(';')[0])
    .join('; ')
  return async (path, init = {}) =>
    fetch(`${app.url}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        cookie,
        origin: app.url,
        'content-type': 'application/json',
      },
    })
}

const plugin = (who) => `import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'hello-${who}'
export const inject = ['router', 'home']

/** ${who}'s workshop plugin: a greeting route and a widget on the home page. */
export function apply(ctx: Context): void {
  ctx.router.route('/hello-${who}', new Acryl().get('/', (c) => c.json({ from: '${who}', says: 'hello from the workshop' })))
  ctx.effect(() =>
    ctx.home.widget({ id: 'hello-${who}', title: 'Hello from ${who}', render: () => '<p>Hello from ${who}</p>' }),
  )
}
`

function addPlugin(app, folder) {
  mkdirSync(join(app.source, 'plugins', folder.name), { recursive: true })
  writeFileSync(join(app.source, 'plugins', folder.name, 'index.ts'), folder.text)
  const blend = join(app.source, 'blend.yaml')
  const rows = readFileSync(blend, 'utf8')
  const routes = '    - id: routes\n      name: routes\n'
  if (!rows.includes(routes))
    throw new Error('blend.yaml has no routes row to put the plugin before')
  writeFileSync(
    blend,
    rows.replace(routes, `    - id: ${folder.name}\n      name: ${folder.name}\n${routes}`),
  )
}

async function served(app, path, want, ms = 40_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    try {
      const response = await fetch(`${app.url}${path}`)
      const text = await response.text()
      if (response.ok && text.includes(want)) return text
    } catch {
      // the host is restarting
    }
    await sleep(500)
  }
  return undefined
}

const stop = (app) => {
  try {
    process.kill(app.child.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

const shared = []
try {
  // --- each person: an app, a plugin, a share
  for (const who of people) {
    const app = await startApp(who)
    addPlugin(app, { name: `hello-${who}`, text: plugin(who) })
    check(
      (await served(app, `/app/hello-${who}/`, who)) !== undefined,
      `${who}: the plugin they wrote is served in their app`,
    )
    const call = await session(app)
    const planResponse = await call('/api/acryl-blends-frame/plugins/share-plan', {
      method: 'POST',
      body: JSON.stringify({ name: `hello-${who}`, visibility: 'public' }),
    })
    const plan = await planResponse.json()
    check(
      planResponse.ok && plan.owner === owner && plan.visibility === 'public',
      `${who}: the plan they are asked about names ${owner}/hello-${who}, public (${JSON.stringify(plan)})`,
    )
    if (!planResponse.ok) continue
    const shareResponse = await call('/api/acryl-blends-frame/plugins/share', {
      method: 'POST',
      body: JSON.stringify({ name: `hello-${who}`, confirm: plan }),
    })
    const result = await shareResponse.json()
    check(
      shareResponse.ok && typeof result.url === 'string',
      `${who}: the share they confirmed is published (${result.url ?? result.error})`,
    )
    if (shareResponse.ok)
      shared.push({
        who,
        version: result.version,
        repo: `${result.owner}/${result.repo}`,
        url: result.url,
      })
    stop(app)
  }
  await sleep(3_000)

  // --- the host: one list, every plugin pulled, all served in one app
  if (shared.length > 0) {
    const host = await startApp('host')
    const list = shared.map((entry) => `github:${entry.repo}@${entry.version}`).join('\n')
    writeFileSync(join(host.source, 'group.txt'), `${list}\n`)
    say('INFO', `the list:\n${list}`)
    const door = join(host.source, '.acryl', 'bin', 'acryl')
    for (let i = 0; i < 60 && !existsSync(join(host.source, '.acryl', 'door.json')); i += 1)
      await sleep(500)
    const pulled = spawnSync(door, ['plugin', 'pull', '--from', 'group.txt'], {
      cwd: host.source,
      encoding: 'utf8',
      env: environmentOf(host.home),
      timeout: 180_000,
    })
    say('INFO', `${pulled.stdout}${pulled.stderr}`.trim())
    check(pulled.status === 0, 'the host pulls the whole list with one command')
    for (const entry of shared) {
      check(
        (await served(host, `/app/hello-${entry.who}/`, entry.who, 60_000)) !== undefined,
        `the host's app serves ${entry.who}'s plugin, pulled from ${entry.repo}`,
      )
    }
    const home = await served(host, '/app/', 'Hello from', 30_000)
    check(
      home !== undefined && shared.every((entry) => home.includes(`Hello from ${entry.who}`)),
      "the host's home page shows every participant's widget",
    )
    stop(host)
  }
} finally {
  for (const child of children) {
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
  await sleep(2_000)
  if (!keep) rmSync(scratch, { recursive: true, force: true })
}
say(
  'INFO',
  `shared: ${shared.map((entry) => `${entry.repo}@${entry.version}`).join(', ') || 'nothing'}`,
)
process.exit(failed === 0 ? 0 : 1)
