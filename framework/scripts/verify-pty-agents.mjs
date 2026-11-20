#!/usr/bin/env node
// Manual gate of M8 (it uses real models, so it is not part of `pnpm run check`): in one fresh agent app made by the PUBLISHED acrylblends, with agent-panel and driver-pty
// added, a real (headless) Chrome opens the panel's terminal tab for each of claude, codex and pi in turn. Each agent runs interactively in the PTY with one small task, builds
// the feature through the door and checks it. For each agent the script records the time to a working feature, the door commands it ran (read off its own terminal output),
// the plugins that ended up active, and a screenshot of the terminal tab; the whole terminal output is kept as a log.
//
//   node scripts/verify-pty-agents.mjs [--version 0.10.0] [--agent claude,codex,pi] [--out folder]
//
// pi is driven with DeepSeek: its key is read from ~/.secure-storage/llmproviders/deepseek/deepseek.json into the app's environment and never printed or written.
import './lib/scratch-home.mjs'
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromeFlags, devtools, findChrome } from './lib/door-probe.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const { values } = parseArgs({
  options: {
    version: { type: 'string', default: 'latest' },
    agent: { type: 'string', default: 'claude,codex,pi' },
    out: { type: 'string', default: 'pty-agents-evidence' },
  },
})
const agents = values.agent.split(',')
const out = resolve(values.out)
mkdirSync(out, { recursive: true })
const log = (message) => console.log(`verify-pty-agents: ${message}`)
const fail = (message) => {
  throw new Error(`verify-pty-agents: ${message}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms, every = 500) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined)
    if (value) return value
    await sleep(every)
  }
}
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ANSI = [
  new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'gu'),
  new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'gu'),
  new RegExp(`${ESC}[()][A-Z0-9]`, 'gu'),
  /\r/gu,
]
const strip = (text) => ANSI.reduce((rest, pattern) => rest.replace(pattern, ''), text)

const chrome = findChrome()
if (!chrome) fail('no Chrome or Chromium on this machine (set CHROME_BIN)')
const scratch = mkdtempSync(join(tmpdir(), 'pty-agents-'))
// No global `acryl` or `acrylblends` may reach the agent: a PATH with node, npm and the folders of the agents' own programs only.
const whichReal = (program) => {
  const found = spawnSync('zsh', ['-lc', `whence -p ${program}`], {
    encoding: 'utf8',
  }).stdout.trim()
  if (found === '') fail(`${program} is not installed`)
  return found
}
const programDirs = new Set(agents.map((agent) => join(whichReal(agent), '..')))
// A minimal environment, not the caller's: a Claude Code session's own variables (CLAUDECODE, its bridge and socket) would make a nested claude hang. The real HOME is for the
// agents' own logins (Claude Code keeps its login in the keychain, Codex in ~/.codex); ANTHROPIC_* is passed on as the headless gate does.
const env = {
  HOME: homedir(),
  USER: process.env.USER,
  LOGNAME: process.env.LOGNAME,
  SHELL: process.env.SHELL,
  LANG: process.env.LANG ?? 'en_US.UTF-8',
  TMPDIR: process.env.TMPDIR,
  TERM: 'xterm-256color',
  npm_config_loglevel: 'error',
  PATH: [dirname(process.execPath), ...programDirs, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(
    ':',
  ),
  ...Object.fromEntries(
    ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  ),
}
delete env.ACRYL_DOOR
if (agents.includes('codex')) {
  // Codex keeps its login in a file: that one file is copied into a scratch CODEX_HOME (removed with the scratch folder), so the owner's own Codex settings and skills do not steer the run.
  const source = join(homedir(), '.codex', 'auth.json')
  if (!existsSync(source)) fail(`no Codex login at ${source}`)
  const codexHome = join(scratch, 'codex-home')
  mkdirSync(codexHome, { recursive: true, mode: 0o700 })
  copyFileSync(source, join(codexHome, 'auth.json'))
  chmodSync(join(codexHome, 'auth.json'), 0o600)
  writeFileSync(join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\n')
  env.CODEX_HOME = codexHome
}
if (agents.includes('pi')) {
  const keyFile = join(homedir(), '.secure-storage/llmproviders/deepseek/deepseek.json')
  if (!existsSync(keyFile)) fail(`no DeepSeek key at ${keyFile}`)
  env.DEEPSEEK_API_KEY = JSON.parse(readFileSync(keyFile, 'utf8')).deepseek_api_key
}
const run = (command, args, cwd) => {
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  if (r.status !== 0) fail(`${command} ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`)
  return r.stdout
}

/** One small feature per agent: a plugin that answers a route, installed through the door, checked through the door. */
const FEATURES = {
  claude: { plugin: 'greet', path: '/greet', json: { text: 'hello from claude' } },
  codex: { plugin: 'ping', path: '/ping', json: { pong: true, by: 'codex' } },
  pi: { plugin: 'about', path: '/about-json', json: { app: 'agent-app', by: 'pi' } },
}
const taskOf = (agent) => {
  const { plugin, path, json } = FEATURES[agent]
  return `The app in this folder is running right now: do not start, stop or restart it. Add one feature: GET ${path} answers the JSON ${JSON.stringify(json)}. Write it as a plugin in plugins/${plugin} (AGENTS.md and docs/framework say how a plugin mounts a route), install it into the running app with .acryl/bin/acryl plugin add plugins/${plugin}, and check through the door that it works (.acryl/bin/acryl plugin list, or curl on the app's own address from .acryl/bin/acryl brief). Say DONE when it works, and in that last message list each door command you ran and what it showed.`
}
/** How each agent is started in the PTY: its interactive mode with the task as its first message. */
const PROGRAMS = {
  // The prompt comes first: `--allowedTools` and `--disallowedTools` take every word after them.
  claude: (task) => [
    task,
    '--setting-sources',
    'project',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'Read,Edit,Write,Glob,Grep,Bash(npm *),Bash(npx *),Bash(node *),Bash(ls *),Bash(cat *),Bash(.acryl/bin/acryl *),Bash(./.acryl/bin/acryl *),Bash(curl *)',
    '--disallowedTools',
    'WebFetch,WebSearch',
  ],
  codex: (task) => [
    '-s',
    'workspace-write',
    '-a',
    'never',
    '-c',
    'sandbox_workspace_write.network_access=true',
    task,
  ],
  pi: (task) => ['--provider', 'deepseek', '--model', 'deepseek-v4-pro', '--no-session', task],
}
/** First-run questions of the programs, and the keys that answer them. */
const DIALOGS = [
  [/trust (the files|this folder|the contents)|Do you trust/iu, '\r'],
  [/Press Enter to continue/iu, '\r'],
  [/Trust project folder/iu, '\r'],
]

let server
let browser
try {
  const app = join(scratch, 'app')
  const specifier = `acrylblends@${values.version}`
  run('npm', ['exec', '--yes', specifier, '--', 'init', app, '--template', 'agent', '-y'], scratch)
  run('npm', ['exec', '--yes', specifier, '--', 'add', 'driver-pty'], app)
  const installed = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  const yaml = join(app, 'blend.yaml')
  const programs = Object.fromEntries(agents.map((a) => [a, PROGRAMS[a](taskOf(a))]))
  writeFileSync(
    yaml,
    readFileSync(yaml, 'utf8').replace(
      '    - id: routes\n',
      `    - id: agent-panel\n      name: agent-panel\n    - id: driver-pty\n      name: driver-pty\n      config:\n        programs: ${JSON.stringify(programs)}\n    - id: routes\n`,
    ),
  )
  const appTs = join(app, 'src', 'app.ts')
  writeFileSync(
    appTs,
    readFileSync(appTs, 'utf8')
      .replace(
        'import * as door from',
        "import * as panel from '../plugins/agent-panel/index.ts'\nimport * as driverPty from '../plugins/driver-pty/index.ts'\nimport * as door from",
      )
      .replace(
        "  'acryl-door': door,",
        "  'acryl-door': door,\n  'agent-panel': panel,\n  'driver-pty': driverPty,",
      ),
  )
  run('npm', ['install', '--no-audit', '--no-fund'], app)
  run('npm', ['run', 'check'], app)
  const version = run('npm', ['view', specifier, 'version'], scratch).trim().split('\n').at(-1)
  log(
    `a fresh agent app from acrylblends ${version} (${installed.name}) with agent-panel and driver-pty`,
  )

  const port = await freePort()
  server = startGroup('npm', ['start'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (c) => (output += c))
  server.stderr.on('data', (c) => (output += c))
  const base = await until(async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1], 40_000)
  if (!base) fail(`the app did not start:\n${output}`)

  const devPort = await freePort()
  let cdp
  for (let attempt = 0; attempt < 2 && cdp === undefined; attempt++) {
    browser = spawn(chrome, [...chromeFlags(join(scratch, 'chrome'), devPort)], { stdio: 'ignore' })
    cdp = await until(() => devtools(devPort), 30_000)
    if (cdp === undefined) browser.kill('SIGKILL')
  }
  if (!cdp) fail('headless Chrome did not open')
  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.result?.exceptionDetails)
      fail(
        `in the page: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`,
      )
    return r.result?.result?.value
  }
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const shadow = "document.querySelector('#agent-panel')?.shadowRoot"
  const door = join(app, '.acryl', 'bin', 'acryl')

  const report = []
  for (const agent of agents) {
    const feature = FEATURES[agent]
    await cdp.send('Page.navigate', { url: `${base}/` })
    if (!(await until(() => evaluate(`Boolean(${shadow}?.querySelector('button.open'))`), 20_000)))
      fail('the panel did not appear')
    const started = Date.now()
    // The script also reads the terminal's whole output, as a second client of the same stream (the page shows it; this keeps all of it).
    const session = await (
      await fetch(`${base}/api/agent-panel/session`, {
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    ).json()
    await evaluate(
      `sessionStorage.removeItem('driver-pty-session'); const s = ${shadow}; s.querySelector('button.open').click(); const d = s.querySelector('select'); d.value = ${JSON.stringify(`pty:${agent}`)}; if (d.value !== ${JSON.stringify(`pty:${agent}`)}) throw new Error('not offered'); d.dispatchEvent(new Event('change')); true`,
    )
    const id = await until(
      async () =>
        JSON.parse((await evaluate("sessionStorage.getItem('driver-pty-session')")) ?? 'null')?.id,
      30_000,
    )
    if (!id) fail(`${agent}: the terminal did not start\n${output}`)
    let transcript = ''
    const reader = fetch(`${base}/api/driver-pty/${id}/output`, {
      headers: { 'sec-fetch-site': 'same-origin', 'x-agent-panel-token': session.token },
    })
      .then(async (response) => {
        const r = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await r.read()
          if (done) return
          buffer += decoder.decode(value, { stream: true })
          for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            if (/^event: data$/mu.test(block))
              transcript += JSON.parse(/^data: (.*)$/mu.exec(block)?.[1] ?? '""')
          }
        }
      })
      .catch(() => {})
    const answered = new Set()
    let lastApproval = 0
    let approvals = 0
    const send = (data) =>
      fetch(`${base}/api/driver-pty/${id}/input`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
          'x-agent-panel-token': session.token,
        },
        body: JSON.stringify({ data }),
      })
    const working = async () => {
      const res = await fetch(`${base}${feature.path}`)
      if (res.status !== 200) return false
      const body = await res.json().catch(() => undefined)
      return JSON.stringify(body) === JSON.stringify(feature.json)
    }
    const deadline = Date.now() + 8 * 60_000
    let done = false
    while (Date.now() < deadline && !done) {
      // A tool-approval question comes up whenever an agent wants something its flags do not allow; a person would press Enter on "Yes" (the scratch app is this script's own folder).
      // The screen is redrawn constantly, so the same question is not answered again within 8 s.
      if (
        /Do you want to proceed\?|requires approval/u.test(strip(transcript).slice(-1200)) &&
        Date.now() - lastApproval > 8000
      ) {
        lastApproval = Date.now()
        approvals += 1
        await send('\r')
      }
      // Each first-run question is answered once (the scratch app is this script's own folder).
      for (const [pattern, keys] of DIALOGS) {
        if (answered.has(String(pattern))) continue
        if (pattern.test(strip(transcript).slice(-1500))) {
          answered.add(String(pattern))
          await send(keys)
        }
      }
      done = await working()
      if (!done) await sleep(2000)
    }
    const working_s = Math.round((Date.now() - started) / 1000)
    if (!done)
      fail(`${agent}: the feature did not work within 8 minutes\n${strip(transcript).slice(-3000)}`)
    // Let the agent finish its turn (its page reloads when the plugin changes; the terminal comes back).
    let quiet = 0
    let last = transcript.length
    while (quiet < 20_000 && Date.now() - started < 20 * 60_000) {
      await sleep(2000)
      if (transcript.length === last) quiet += 2000
      else {
        quiet = 0
        last = transcript.length
      }
    }
    const total_s = Math.round((Date.now() - started) / 1000)
    await until(
      async () => (await evaluate(`${shadow}?.querySelector('.xterm-rows')`)) !== null,
      15_000,
    )
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(out, `${agent}-terminal.png`), Buffer.from(shot.result.data, 'base64'))
    const plain = strip(transcript)
    writeFileSync(join(out, `${agent}-terminal.log`), plain)
    // The terminal redraws its screen over and over, so occurrences say nothing; what each agent reports in its last message, and the screen at the end, are the evidence.
    const finalScreen = await evaluate(`${shadow}?.querySelector('.xterm-rows')?.innerText ?? ''`)
    writeFileSync(join(out, `${agent}-final-screen.txt`), finalScreen)
    const verbs = [
      ...new Set(
        [...finalScreen.matchAll(/acryl\/bin\/acryl\s+(brief|look|act|plugin|tool)\b/gu)].map(
          (m) => m[1],
        ),
      ),
    ].sort()
    const list = spawnSync(door, ['plugin', 'list', '--json'], { cwd: app, env, encoding: 'utf8' })
    const active = JSON.parse(list.stdout)
      .filter((p) => p.state === 'active')
      .map((p) => p.name)
    await evaluate(`${shadow}.querySelector('.termstop').click(); true`)
    await sleep(1500)
    await reader
    report.push({
      agent,
      plugin: feature.plugin,
      working_s,
      total_s,
      verbs,
      active: active.includes(feature.plugin),
      shown: JSON.stringify(feature.json),
    })
    log(
      `${agent}: ${feature.path} answered ${JSON.stringify(feature.json)} after ${working_s} s; agent idle after ${total_s} s; door verbs on its final screen: ${verbs.join(',')}; plugin ${feature.plugin} active: ${active.includes(feature.plugin)}; tool approvals pressed: ${approvals}`,
    )
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify({ version, report }, null, 2))
  cdp.close()
  log(`OK, evidence in ${out}`)
} finally {
  browser?.kill('SIGKILL')
  if (server) await stopGroup(server)
  await sleep(500)
  rmSync(scratch, { recursive: true, force: true })
}
