#!/usr/bin/env node
// Manual gate (it uses models, so it is not part of `pnpm run check`): a headless coding agent works in a freshly generated app with a one-line task and
// only the docs inside the folder, and the task must end with the app's tests and type-check passing.
//
//   node scripts/verify-coding-agent.mjs <acrylblends tarball or version> [--agent claude|codex|pi|all] [--template blank] [--task "..."]
//
// Each agent gets its own fresh app, a scratch HOME and a PATH that holds only node, npm and npx (as links) plus the folder of that agent's own program,
// so no global `acryl` or `acrylblends` can reach the owner's real apps. `pi` is driven with DeepSeek: the key is read from
// ~/.secure-storage/llmproviders/deepseek/deepseek.json into that one process's environment and is never printed. Exit code 0 when every agent passed.
import './lib/scratch-home.mjs'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { probeByo, startByoApp } from './lib/byo.mjs'
import { probeChat } from './lib/chat-probe.mjs'
import { probeDoor } from './lib/door-probe.mjs'
import { probeNotes } from './lib/notes-probe.mjs'
import { part2 } from './lib/part2.mjs'
import { stopGroup } from './lib/proc.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    agent: { type: 'string', default: 'claude' },
    template: { type: 'string', default: 'blank' },
    task: { type: 'string', default: 'add a /customers/count route with a test' },
    setup: { type: 'string', default: 'blend' },
    preset: { type: 'string' },
    part2: { type: 'boolean', default: false },
  },
})
/** Named tasks, each with a probe of the finished app. */
const PRESETS = {
  contact: {
    task: 'add a server-rendered JSX page at /contact using acrylblends/jsx, with a test',
    path: '/contact',
  },
  about: {
    task: 'add a server-rendered JSX page at /about using acrylblends/jsx, with a test',
    path: '/about',
  },
}
PRESETS.tags = {
  task: 'Add tags to notes. A note has zero or more tags, entered in the note form as one text field named tags, comma separated (for example "alpha, beta"). The notes list shows each note\'s tags, the list can be filtered with the query string ?tag=alpha (only notes with that tag; it combines with the search ?q=), the edit form shows the current tags, and the JSON API returns and accepts tags too. Existing databases must keep working. Add tests for all of it. Finish when npm test and npm run check pass.',
  path: '/login',
  notes: true,
  tags: true,
}
// Spec 049 slice 15: an agent follows the guide alone and swaps a provider into a running app. The tool is not the guide's own (lowdb), so the agent has to apply the guide, not copy it.
PRESETS.byo = {
  task: 'The app in this folder is running right now (npm start is already running; do not start it again, and do not stop it). It uses the kv port, provided by the plugin in plugins/kv, and plugins/visits counts visits at GET /visits in that store. Read docs/framework/guides/bring-your-own-tool.md and follow it: wrap the npm package `conf` as a provider of the kv port in plugins/kv-conf (the `conf` package is not installed yet), make it pass the kv conformance suite, and then swap it in for the running app through the door (.acryl/bin/acryl), so that GET /visits keeps counting, served by kv-conf, without restarting the app. The old provider must be removed from the running app. Finish when the suite passes, npm run check passes, and the running app answers GET /visits from kv-conf.',
  byo: true,
}
PRESETS.chat = {
  task: 'Build a small AI chat app in this folder, using only what the docs in docs/framework and AGENTS.md say. A chat page (GET /) has a text box, a Send button and, while an answer is streaming, a Stop button. POST /api/chat takes JSON {"message": "...", "conversation": optional number} and answers a text/event-stream through acrylblends/streaming streamSSE: the answer streams token by token, as the model produces it. The server calls an OpenAI-compatible chat completions API with stream: true using fetch; the base URL comes from the environment variable DEEPSEEK_BASE_URL (default https://api.deepseek.com), the model from DEEPSEEK_MODEL (default deepseek-chat), and the key ONLY from the environment variable DEEPSEEK_API_KEY (never written to any file, never in a response or log). The browser side is a client component (acrylblends/jsx/dom, served by clientModules from src/client) that shows the answer as it arrives and whose Stop button aborts the request; the server must then abort its own request to the model (use the request signal, c.req.raw.signal), and keep what had arrived. Conversation history is stored in SQLite (the docs say how) and the earlier messages of a conversation are sent to the model with each new message. GET /api/conversations answers {"conversations":[{"id","title"}]} and GET /api/conversations/:id answers {"messages":[{"role","content"}]}; an empty message is refused with a 400 and a clear message. Tests use a mock model, never the network, and cover every route. It runs as a desktop window (npm run desktop) and `npm start` serves it on the port in the PORT environment variable. Finish when npm test and npm run check pass.',
  path: '/',
  chat: true,
}
PRESETS.notes = {
  task: 'Build a small multi-user notes app in this folder, using only what the docs in docs/framework and AGENTS.md say. Users sign up and log in with an email address and a password (form fields named email and password; password hashed with node:crypto scrypt, a cookie session). Notes are stored in SQLite (no native dependencies). A signed-in user can create, edit, delete and search their own notes with HTML forms (form fields named title and body; pages at /signup, /login, /notes, /notes/new, /notes/:id/edit, with POST /signup, /login, /logout, /notes, /notes/:id (edit) and /notes/:id/delete; server-side validation with clear error messages shown on the page). One part of the UI is interactive in the browser (a live character counter on the note field, or an instant filter on the list). There is a JSON API under /api/notes that a typed client is used on in a test. Every route has a test. The app runs as a desktop window (npm run desktop) and `npm start` serves it on the port in the PORT environment variable. Finish when npm test and npm run check pass.',
  path: '/login',
  notes: true,
}
if (values.preset) {
  if (!PRESETS[values.preset]) {
    console.error(`unknown preset "${values.preset}" (${Object.keys(PRESETS).join(', ')})`)
    process.exit(2)
  }
  values.task = PRESETS[values.preset].task
}
// nodejs, notes and chat are made by create-acrylblends; since 0.8 every one of them is a Cordis app, like the blend setups.
const CREATED_SETUPS = ['nodejs', 'notes', 'chat']
const SETUPS = ['blend', 'blend-desktop', 'nodejs', 'notes', 'chat', 'byo']
if (!SETUPS.includes(values.setup)) {
  console.error(`unknown setup "${values.setup}" (${SETUPS.join(', ')})`)
  process.exit(2)
}
const [spec] = positionals
const AGENTS = ['claude', 'codex', 'pi']
if (!spec || (values.agent !== 'all' && !AGENTS.includes(values.agent))) {
  console.error(
    'usage: node scripts/verify-coding-agent.mjs <tarball|version> [--agent claude|codex|pi|all] [--template t] [--task "..." | --preset about] [--setup blend|blend-desktop|nodejs]',
  )
  process.exit(2)
}
const base = resolve(process.env.GATE_DIR ?? '/tmp/acrylblends-coding-agent-gate')
const which = (program) => {
  const found = spawnSync('zsh', ['-lc', `whence -p ${program}`], {
    encoding: 'utf8',
  }).stdout.trim()
  if (found === '') throw new Error(`${program} is not installed`)
  return found
}
const run = (cmd, args, cwd, options = {}) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...options })

/** The real program of an agent where a wrapper script of the caller's own tooling shadows it on PATH. */
const PROGRAM_PATHS = {
  codex: ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'],
  claude: [
    join(homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ],
}

/** What each agent runs, and how its output says how much work it did. */
const DRIVERS = {
  claude: {
    args: (task) => [
      '-p',
      task,
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      '40',
      '--setting-sources',
      'project',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Read,Edit,Write,Glob,Grep,Bash(npm *),Bash(npx *),Bash(node *),Bash(ls *),Bash(cat *),Bash(.acryl/bin/acryl *),Bash(./.acryl/bin/acryl *),Bash(curl *)',
      '--disallowedTools',
      'WebFetch,WebSearch',
    ],
    steps: (out) => {
      const result = out
        .split('\n')
        .filter((line) => line.includes('"type":"result"'))
        .at(-1)
      return result ? `${JSON.parse(result).num_turns} turns` : 'no result'
    },
  },
  codex: {
    args: (task, app) => [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '-s',
      'workspace-write',
      // The byo task installs an npm package and talks to the running app on loopback.
      ...(values.preset === 'byo' ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
      '-C',
      app,
      task,
    ],
    steps: (out) =>
      `${(out.match(/"type":"turn.completed"/g) ?? []).length} turns, ${(out.match(/"type":"item.completed","item":\{"id":"item_\d+","type":"(command_execution|file_change)"/g) ?? []).length} commands and edits`,
  },
  pi: {
    args: (task) => [
      '-p',
      task,
      '--mode',
      'json',
      '--provider',
      'deepseek',
      '--model',
      'deepseek-v4-pro',
      '--no-session',
    ],
    steps: (out) => `${(out.match(/"type":"turn_start"/g) ?? []).length} turns`,
  },
}

const DEFAULT_TASK = 'add a /customers/count route with a test'

/** The last error the agent printed, without anything that looks like a key. */
function failureText(result) {
  const text = `${result.stderr}\n${result.stdout}`.replace(
    /(sk-|Bearer )[A-Za-z0-9._-]+/g,
    '$1<hidden>',
  )
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|unauthorized|login|auth|denied|not found/i.test(l))
    .at(-1)
  return (line ?? text.trim().split('\n').at(-1) ?? 'no output').slice(0, 220)
}

/** Start the generated app and ask the default task's route; `ok` when it answers 200 with a JSON count. */
/** The steps of the last Notes probe, printed with the result. */
let lastProbe = []
async function probeRoute(app, env) {
  const preset = values.preset ? PRESETS[values.preset] : undefined
  const path = preset?.path ?? '/customers/count'
  if (preset?.chat) {
    const probe = await probeChat(app, env)
    lastProbe = probe.steps
    return probe.ok ? 'ok' : 'FAIL'
  }
  if (preset?.notes) {
    const probe = await probeNotes(app, env, { tags: Boolean(preset.tags) })
    lastProbe = probe.steps
    return probe.ok ? 'ok' : 'FAIL'
  }
  const check = preset
    ? "reply.status === 200 && /html/.test(reply.headers.get('content-type') ?? '') && /</.test(await reply.clone().text())"
    : "reply.status === 200 && typeof (await reply.clone().json()).count === 'number'"
  const script = `import { createApp } from './src/app.ts'
import { pinnedInstance, withPort } from './plugins/instance/index.ts'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const home = mkdtempSync(join(tmpdir(), 'gate-probe-'))
const app = await createApp(withPort(pinnedInstance(home, { root: process.cwd() }), 0))
const reply = await fetch(app.url + '${path}')
const ok = ${check}
await app.stop()
process.exit(ok ? 0 : 1)
`
  const file = join(app, 'gate-probe.ts')
  writeFileSync(file, script)
  // The app is started the way its own scripts start it: with the register hook, so a .tsx page loads.
  const hook = './plugins/acryl-node-server/src/register.ts'
  const probe = run('node', ['--import', hook, file], app, { env, timeout: 60_000 })
  rmSync(file, { force: true })
  return probe.status === 0 ? 'ok' : 'FAIL'
}

/** The environment of one agent: the caller's, with a scratch HOME and a PATH that cannot reach a global `acryl` or `acrylblends`. */
function environment(dir, programDir) {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const nodeDir = dirname(which('node'))
  for (const tool of ['node', 'npm', 'npx']) symlinkSync(join(nodeDir, tool), join(bin, tool))
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  // Only what a program needs to run: nothing of the caller's session (its agent variables, hooks or credentials) is inherited.
  const env = {
    ...Object.fromEntries(
      ['TERM', 'LANG', 'USER', 'LOGNAME', 'TMPDIR']
        .filter((k) => process.env[k] !== undefined)
        .map((k) => [k, process.env[k]]),
    ),
    HOME: home,
    PATH: [bin, programDir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
  }
  delete env.ZDOTDIR
  for (const program of ['acryl', 'acrylblends']) {
    const reached = run('zsh', ['-lc', `command -v ${program}`], dir, { env })
    if (reached.stdout.trim() !== '')
      throw new Error(`${program} is reachable on the agent's PATH: ${reached.stdout.trim()}`)
  }
  return env
}

async function attempt(name) {
  const dir = join(base, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const program = PROGRAM_PATHS[name]?.find((path) => existsSync(path)) ?? which(name)
  const programDir = dirname(program)
  const env = environment(dir, programDir)
  const clean = { ...env }
  run('npm', ['init', '-y'], dir, { env: clean })
  run(
    'npm',
    [
      'install',
      spec.endsWith('.tgz') ? resolve(spec) : `acrylblends@${spec}`,
      '--no-audit',
      '--no-fund',
    ],
    dir,
    { env: clean },
  )
  const acrylblends = join(dir, 'node_modules/.bin/acrylblends')
  const created = CREATED_SETUPS.includes(values.setup)
    ? process.env.CREATE_ACRYLBLENDS_BIN
      ? // Before a release: the create package of this checkout instead of the published one.
        run(
          process.execPath,
          [process.env.CREATE_ACRYLBLENDS_BIN, 'app', '--template', values.setup, '-y'],
          dir,
          { env: clean },
        )
      : (() => {
          run('npm', ['install', 'create-acrylblends@latest', '--no-audit', '--no-fund'], dir, {
            env: clean,
          })
          return run(
            join(dir, 'node_modules/.bin/create-acrylblends'),
            ['app', '--template', values.setup, '-y'],
            dir,
            { env: clean },
          )
        })()
    : run(
        acrylblends,
        [
          'init',
          'app',
          '--template',
          values.setup === 'byo' ? 'agent' : values.template,
          ...(values.setup === 'blend-desktop' ? ['--desktop'] : []),
          '-y',
        ],
        dir,
        { env: clean },
      )
  if (created.status !== 0) return { name, pass: false, note: `init failed: ${created.stderr}` }
  if (CREATED_SETUPS.includes(values.setup))
    run(
      'npm',
      [
        'install',
        spec.endsWith('.tgz') ? resolve(spec) : `acrylblends@${spec}`,
        '--no-audit',
        '--no-fund',
      ],
      join(dir, 'app'),
      { env: clean },
    )
  const app = join(dir, 'app')
  // The notes starter is the app a user has after `add desktop`: the agent works on that.
  if (values.setup === 'notes')
    run(join(dir, 'app', 'node_modules/.bin/acrylblends'), ['add', 'desktop'], app, { env: clean })
  run('npm', ['install', '--no-audit', '--no-fund'], app, { env: clean })
  if (run('npm', ['test'], app, { env: clean }).status !== 0)
    return { name, pass: false, note: "the fresh app's own tests fail" }
  // The tests must also pass where the agent runs them: Codex's workspace-write sandbox forbids the system temp folder and listening on a port, so a template whose tests need either
  // would leave the agent unable to check its work (found 2026-10-27, notes on Cordis).
  if (name === 'codex') {
    const sandboxed = run(
      program,
      [
        'sandbox',
        '-c',
        'sandbox_mode="workspace-write"',
        // The same network setting the agent itself gets (the byo task installs a package and talks to the running app on loopback).
        ...(values.preset === 'byo' ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
        '--',
        'npm',
        'test',
      ],
      app,
      { env: clean },
    )
    if (sandboxed.status !== 0)
      return {
        name,
        pass: false,
        note: `the fresh app's tests fail inside Codex's sandbox: ${(sandboxed.stdout + sandboxed.stderr).trim().split('\n').slice(-6).join(' | ').slice(0, 400)}`,
      }
  }
  // The byo setup: the guide's own starting point, running. The port and its suite are in the app, the default provider and a consumer run as plugins.
  let byoApp
  if (values.preset === 'byo') {
    const started = await startByoApp(app, clean, acrylblends)
    if (!started.ok) return { name, pass: false, note: `byo setup: ${started.note}` }
    byoApp = started
  }
  const agentEnv = { ...env }
  const secrets = []
  let isolation = 'scratch HOME, minimal environment, PATH scrubbed'
  if (name === 'claude') {
    // Claude Code keeps its login in the operating system's keychain, bound to the real HOME: nothing is copied, so this agent runs with the real HOME
    // for authentication only, user and local settings are not loaded (--setting-sources project), and its tools are limited (see DRIVERS).
    agentEnv.HOME = homedir()
    isolation =
      'real HOME for login only, project settings only, tools npm/node/ls/cat + edits, PATH scrubbed'
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'])
      if (process.env[key]) agentEnv[key] = process.env[key]
  }
  if (name === 'codex') {
    // Codex keeps its login in a file: copy that one file into a scratch CODEX_HOME, and delete it afterwards.
    const source = join(homedir(), '.codex', 'auth.json')
    if (!existsSync(source)) return { name, pass: false, note: `no Codex login at ${source}` }
    const codexHome = join(env.HOME, '.codex')
    mkdirSync(codexHome, { recursive: true, mode: 0o700 })
    copyFileSync(source, join(codexHome, 'auth.json'))
    chmodSync(join(codexHome, 'auth.json'), 0o600)
    writeFileSync(join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\n')
    agentEnv.CODEX_HOME = codexHome
    secrets.push(codexHome)
  }
  if (name === 'pi') {
    const file = join(homedir(), '.secure-storage/llmproviders/deepseek/deepseek.json')
    if (!existsSync(file)) return { name, pass: false, note: `no DeepSeek key at ${file}` }
    agentEnv.DEEPSEEK_API_KEY = JSON.parse(readFileSync(file, 'utf8')).deepseek_api_key
  }
  run('git', ['init', '-q'], app)
  run('git', ['add', '-A'], app)
  run(
    'git',
    ['-c', 'user.name=gate', '-c', 'user.email=gate@example.com', 'commit', '-qm', 'base'],
    app,
  )
  const driver = DRIVERS[name]
  const started = Date.now()
  const result = run(program, driver.args(values.task, app), app, {
    env: agentEnv,
    timeout: values.preset === 'notes' || values.preset === 'chat' ? 2_400_000 : 900_000,
    input: '',
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  // Kept beside the app so a failed run can be read (the agent's own output; the key is never in it).
  writeFileSync(join(dir, 'agent-output.txt'), `${result.stdout}\n--- stderr\n${result.stderr}`)
  for (const path of secrets) rmSync(path, { recursive: true, force: true })
  const test = run('npm', ['test'], app, { env: clean })
  const check = run('npm', ['run', 'check'], app, { env: clean })
  // Tests that passed before the task prove nothing: the agent must have added a test and a source file, and the default task's route must answer.
  const changed = run('git', ['status', '--porcelain', '--untracked-files=all'], app)
    .stdout.split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
  const touchedTests = changed.some((file) => file.startsWith('test/'))
  const wroteTsx = changed.filter((file) => /\.tsx$/.test(file))
  const touchedSource = changed.some(
    (file) => file.startsWith('src/') || file.startsWith('plugins/') || file === 'blend.yaml',
  )
  let route
  if (byoApp) {
    const probe = await probeByo(app, clean, byoApp)
    console.log(`  byo (${name}):\n    ${probe.steps.join('\n    ')}`)
    route = probe.ok ? 'ok' : 'FAIL'
    await stopGroup(byoApp.child)
  } else {
    route =
      values.task === DEFAULT_TASK || values.preset ? await probeRoute(app, clean) : 'not probed'
  }
  // Part 2 of spec 049: restart, fresh clone, no secret in git status.
  let lifecycle = { ok: true, steps: [] }
  if (values.part2) {
    const install = (dir) => {
      const first = run('npm', ['install', '--no-audit', '--no-fund'], dir, { env: clean })
      if (first.status !== 0 || !spec.endsWith('.tgz')) return first.status
      return run('npm', ['install', resolve(spec), '--no-audit', '--no-fund'], dir, { env: clean })
        .status
    }
    lifecycle = await part2(app, clean, {
      probe: (dir) => probeRoute(dir, clean),
      door:
        values.preset === 'tags' || values.preset === 'notes'
          ? (dir) => probeDoor(dir, clean, { tags: Boolean(PRESETS[values.preset].tags) })
          : undefined,
      install,
      secrets: [agentEnv.DEEPSEEK_API_KEY ?? ''],
      clone: join(dir, 'clone'),
    })
    console.log(`  part 2 (${name}):\n    ${lifecycle.steps.join('\n    ')}`)
  }
  const pass =
    lifecycle.ok &&
    result.status === 0 &&
    test.status === 0 &&
    check.status === 0 &&
    touchedTests &&
    touchedSource &&
    route !== 'FAIL'
  const reason = result.status === 0 ? '' : ` [${failureText(result)}]`
  return {
    name,
    pass,
    note: `${driver.steps(result.stdout)}, ${seconds} s; agent exit ${result.status}${reason}; isolation: ${isolation}; tests ${test.status === 0 ? 'pass' : 'FAIL'}, type-check ${check.status === 0 ? 'pass' : 'FAIL'}, test added ${touchedTests}, source changed ${touchedSource}, tsx files ${wroteTsx.length === 0 ? 'none' : wroteTsx.join(' ')}, route ${route}${lastProbe.length > 0 ? `\n  ${lastProbe.join('\n  ')}` : ''}`,
    app,
  }
}

const results = []
for (const name of values.agent === 'all' ? AGENTS : [values.agent]) {
  results.push(
    await (async () => {
      try {
        return await attempt(name)
      } catch (error) {
        return { name, pass: false, note: error.message }
      }
    })(),
  )
}
for (const r of results)
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}: ${r.note}${r.app ? ` (${r.app})` : ''}`)
process.exit(results.every((r) => r.pass) ? 0 : 1)
