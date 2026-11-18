#!/usr/bin/env node
// The production Assistant, used by two visitors at once (mockup scenario 10):
//
//   node scripts/verify-assistant.mjs [--url <a running Assistant app>] [--shots <folder>]
//
// Without --url, an app is made from the agent template of this checkout, the Team Board plugin (scripts/fixtures/assistant/team-board) is put in its plugins/, and
// it starts with NODE_ENV=production and ACRYL_ASSISTANT=on, its model a local OpenAI-compatible mock that plays look, click My tasks, look, select, look and answers what
// the page shows (no network, no key). With --url, the app given is used as it runs, with whatever model it has: that is how a real model is checked.
//
// Two headless Chromes are two visitors, each with its own cookies. Both open /board. Visitor A asks for its tasks due this week; while A's run goes, visitor B
// asks for its tasks due later. Then:
// - each page was driven to /my-tasks with its own filter (A: This week, B: Later), and each Assistant answered under its own question, with its steps;
// - neither panel shows the other's question; B's GET /run replays only B's run, B cannot read A's run with A's token, and B's Stop did not stop A's run;
// - B's ask was not refused while A's run went (each visitor has their own run).
// Screenshots of both pages at 1440x900 go to --shots when it is given.
import './lib/scratch-home.mjs'
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { devtools, startChrome } from './lib/door-probe.mjs'
import { npmSpawn } from './lib/platform.mjs'
import { freePort } from './lib/port.mjs'
import { startGroup, stopGroup } from './lib/proc.mjs'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const option = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
const given = option('--url')
const shots = option('--shots')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const log = (line) => console.log(`verify-assistant: ${line}`)
const fail = (message) => {
  throw new Error(message)
}

async function until(what, fn, ms, every = 300) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn().catch((error) => ({ error: String(error) }))
    if (last && !last.error) return last
    await sleep(every)
  }
  fail(`${what} did not happen within ${String(ms / 1000)} s (last: ${JSON.stringify(last)})`)
}

/**
 * The mock model: an OpenAI-compatible `/v1/chat/completions` that drives the page the way a model would, from the tool results it is sent. It looks, clicks the link to
 * My tasks, looks, selects the option the question asks for in the Due list, looks, and answers with the count the page shows.
 */
const MOCK_STEP_MS = 400

function startMockModel() {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const request = JSON.parse(body)
      const messages = request.messages ?? []
      const question = messages.find((m) => m.role === 'user')?.content ?? ''
      const calls = messages.filter((m) => m.role === 'assistant').length
      const lastTool = [...messages].reverse().find((m) => m.role === 'tool')?.content ?? ''
      const wanted = /later/iu.test(question) ? 'Later' : 'This week'
      const call = (name, input) => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `c${String(calls)}`,
                  type: 'function',
                  function: { name, arguments: JSON.stringify(input) },
                },
              ],
            },
          },
        ],
      })
      const text = (content) => ({ choices: [{ message: { role: 'assistant', content } }] })
      // A look comes as the page's lines; the Due list's line reads `- combobox "Due" value="Any time" options=[...] [ref=3.10]`.
      const refOf = (snapshot, pattern) => {
        const line = snapshot.split('\n').find((entry) => pattern.test(entry))
        return line === undefined ? undefined : /\[ref=(\d+\.\d+)\]/u.exec(line)?.[1]
      }
      let answer
      if (calls === 0) answer = call('door_look', {})
      else if (calls === 1) {
        const ref = refOf(lastTool, /^\s*- link "My tasks"/u)
        answer =
          ref === undefined
            ? text('I could not find My tasks on the page.')
            : call('door_act', { op: 'click', ref })
      } else if (calls === 2) answer = call('door_look', {})
      else if (calls === 3) {
        const ref = refOf(lastTool, /^\s*- combobox "Due"/u)
        answer =
          ref === undefined
            ? text('I could not find the Due filter on the page.')
            : call('door_act', { op: 'select', ref, option: wanted })
      } else if (calls === 4) answer = call('door_look', {})
      else {
        const count = /status "(\d+ tasks?)"/u.exec(lastTool)?.[1] ?? 'the tasks'
        answer = text(
          `Opened My tasks and filtered to ${wanted === 'Later' ? 'later' : 'this week'}: ${count}.`,
        )
      }
      // A model takes a moment per step, so the two visitors' runs overlap as they would.
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(answer))
      }, MOCK_STEP_MS)
    })
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () =>
      done({
        url: `http://127.0.0.1:${String(server.address().port)}/v1`,
        close: () => server.close(),
      }),
    )
  })
}

/** Make the app from this checkout's agent template, with the Team Board plugin, and start it as the Assistant. */
async function startApp(scratch) {
  const app = join(scratch, 'team-board')
  const cli = join(root, 'packages', 'cli', 'bin', 'acrylblends.js')
  const init = spawn(
    process.execPath,
    [
      cli,
      'init',
      app,
      '--name',
      'team-board',
      '--template',
      'agent',
      '--bare',
      '--yes',
      '--no-next',
    ],
    { stdio: 'inherit' },
  )
  if ((await new Promise((done) => init.on('exit', done))) !== 0) fail('init failed')
  cpSync(
    join(root, 'scripts', 'fixtures', 'assistant', 'team-board'),
    join(app, 'plugins', 'team-board'),
    { recursive: true },
  )
  const npm = npmSpawn()
  const install = spawn(npm.command, ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: app,
    stdio: 'inherit',
    ...npm.options,
  })
  if ((await new Promise((done) => install.on('exit', done))) !== 0) fail('npm install failed')
  const model = await startMockModel()
  // The model is kept in the app's home, as an owner would keep it: no flag names it.
  mkdirSync(join(app, '.acrylblends'), { recursive: true })
  writeFileSync(
    join(app, '.acrylblends', 'model.json'),
    JSON.stringify({ baseUrl: model.url, model: 'mock' }),
    { mode: 0o600 },
  )
  const port = await freePort()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ACRYL_ASSISTANT: 'on',
    ACRYLBLENDS_PORT: String(port),
  }
  delete env.ACRYLBLENDS_MODEL_URL
  delete env.ACRYLBLENDS_MODEL
  delete env.ACRYLBLENDS_MODEL_KEY
  const child = startGroup(
    process.execPath,
    ['--import', './plugins/acryl-node-server/src/register.ts', 'src/main.ts'],
    { cwd: app, env },
  )
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
  })
  const url = await until(
    'the app to listen',
    async () => /listening on (http:\/\/\S+)/u.exec(output)?.[1],
    60_000,
  )
  if (!/model: mock at /u.test(output))
    fail(`the app did not take the model from model.json:\n${output}`)
  return {
    url,
    stop: async () => {
      await stopGroup(child)
      model.close()
    },
    output: () => output,
  }
}

/** One visitor: a headless Chrome of its own (its own cookies), on one page of the app. */
async function visitor(name, profile, url) {
  const chrome = await startChrome(profile, { args: ['--window-size=1440,900'] })
  const page = await devtools(chrome.port)
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const evaluate = async (expression) => {
    const answer = await page.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    const details = answer.result?.exceptionDetails
    if (details !== undefined) throw new Error(details.exception?.description ?? details.text)
    return answer.result?.result?.value
  }
  const ready = () =>
    until(
      `${name}'s Assistant to be ready`,
      () => evaluate(`document.getElementById('agent-panel')?.dataset.ready === '1' || undefined`),
      30_000,
    )
  await page.send('Page.navigate', { url: `${url}/board` })
  await ready()
  return {
    name,
    evaluate,
    ready,
    async ask(message) {
      await evaluate(
        `(() => { const s = document.getElementById('agent-panel').shadowRoot; const t = s.querySelector('textarea'); t.value = ${JSON.stringify(message)}; s.querySelector('form').requestSubmit(); return true })()`,
      )
    },
    /** What the panel shows: each message, its kind, and the steps line under an answer. */
    panel: () =>
      evaluate(
        `(() => { const s = document.getElementById('agent-panel')?.shadowRoot; if (!s) return undefined; return [...s.querySelectorAll('#log .msg')].map(m => ({ kind: m.className, text: m.textContent.trim() })) })()`,
      ),
    state: () =>
      evaluate(
        `({ path: location.pathname, due: document.getElementById('due')?.value ?? null, count: document.getElementById('count')?.textContent ?? null, following: document.getElementById('agent-panel')?.dataset.following === '1' })`,
      ),
    /** The panel's own calls, made from this page with this visitor's cookie (again when the page was replaced under the call: a run moves its page). */
    call: (path, init = {}) =>
      until(
        `${name}'s ${path}`,
        () =>
          evaluate(
            `(async () => { const s = await (await fetch('/api/agent-panel/session')).json(); const token = ${init.token === undefined ? 's.token' : JSON.stringify(init.token)}; const r = await fetch(${JSON.stringify(path)}, { method: ${JSON.stringify(init.method ?? 'GET')}, headers: { 'x-agent-panel-token': token } }); return { status: r.status, token: s.token, text: (await r.text()).slice(0, 4000) } })()`,
          ),
        20_000,
      ),
    async shot(file) {
      const { data } = (await page.send('Page.captureScreenshot', { format: 'png' })).result
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
    stop: async () => {
      page.close()
      await chrome.stop()
    },
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'verify-assistant-'))
let app
const visitors = []
let failure
try {
  app =
    given === undefined
      ? await startApp(scratch)
      : { url: given.replace(/\/+$/u, ''), stop: async () => {}, output: () => '' }
  log(`the Assistant app is at ${app.url}`)
  const a = await visitor('A', join(scratch, 'chrome-a'), app.url)
  visitors.push(a)
  const b = await visitor('B', join(scratch, 'chrome-b'), app.url)
  visitors.push(b)
  const QA = 'Show me only my tasks that are due this week.'
  const QB = 'Show me my tasks that are due later.'
  await a.ask(QA)
  // B asks while A's run goes: B's run is its own, never refused because of A's.
  await until("A's run to start", async () => (await a.state()).following || undefined, 20_000, 100)
  await b.ask(QB)
  const refusedB = await until(
    "B's question to be taken",
    async () => {
      const shown = await b.panel()
      return shown?.some((m) => m.text === QB) ? shown : undefined
    },
    10_000,
  )
  if (refusedB.some((m) => /already going/u.test(m.text)))
    fail(`B's ask was refused while A's run went: ${JSON.stringify(refusedB)}`)
  // B presses Stop through the panel's own route, with B's own token: only B's run may stop, A's goes on.
  const stopped = await b.call('/api/agent-panel/stop', { method: 'POST' })
  if (stopped.status !== 200) fail(`B's stop answered ${String(stopped.status)}`)
  // B cannot read A's run, even holding A's token: the token belongs to A's cookie.
  const tokenA = (await a.call('/api/agent-panel/run')).token
  const stolen = await b.call('/api/agent-panel/run', { token: tokenA })
  if (stolen.status !== 403)
    fail(`B read the run with A's token: ${String(stolen.status)} ${stolen.text}`)
  log("B's ask was taken while A's run went; B's Stop answered; A's token is refused on B's cookie")

  // The answer to the question asked after the panel showed `before` messages (an earlier ask of the same question and its answer are not it).
  const answered = async (v, question, before = 0) => {
    await until(
      `${v.name}'s answer`,
      async () => {
        const all = await v.panel()
        // A panel that starts over for a new run shows fewer messages than before: then all of them are the new run's.
        const shown = all?.slice(all.length > before ? before : 0)
        const at = shown?.findIndex((m) => m.text === question) ?? -1
        const after = at === -1 ? [] : shown.slice(at + 1)
        return after.some((m) => /\bmd\b/u.test(m.kind) && m.text !== '') &&
          !(await v.state()).following
          ? shown
          : undefined
      },
      240_000,
      500,
    )
    return v.panel()
  }
  const shownA = await answered(a, QA)
  const stateA = await a.state()
  const shownB = await b.panel()
  const stateB = await b.state()
  log(`A: ${JSON.stringify(stateA)}; ${JSON.stringify(shownA)}`)
  log(`B: ${JSON.stringify(stateB)}; ${JSON.stringify(shownB)}`)
  if (stateA.path !== '/my-tasks' || stateA.due !== 'week')
    fail(`A's page is not My tasks filtered to this week: ${JSON.stringify(stateA)}`)
  if (shownA.some((m) => m.text === QB)) fail("A's panel shows B's question")
  if (shownB?.some((m) => m.text === QA)) fail("B's panel shows A's question")
  const answerA = shownA.find((m) => /\bmd\b/u.test(m.kind))?.text ?? ''
  // The steps read as the mockup's do: what was done, named as the page names it.
  if (!answerA.includes('ui.open("My tasks") · ui.fill("Due", "This week")'))
    fail(`A's answer does not show its steps on the page: ${answerA}`)
  // B's run was stopped by B, so its page may be anywhere along the way, but never where A's run went (My tasks, filtered to this week).
  if (stateB.due === 'week')
    fail(`B's page was filtered to this week, A's filter: ${JSON.stringify(stateB)}`)
  // B's replay of the latest run is B's own.
  const replayB = await b.call('/api/agent-panel/run')
  if (replayB.text.includes(QA)) fail(`B's GET /run replays A's run: ${replayB.text}`)
  if (!replayB.text.includes(QB)) fail(`B's GET /run does not replay B's own run: ${replayB.text}`)
  log(
    "A's run finished on A's page (My tasks, this week) though B pressed Stop; B's replay is B's own",
  )

  // B asks again, and this run goes to its end: B's page, B's filter.
  const shownBefore = (await b.panel())?.length ?? 0
  await b.ask(QB)
  const shownB2 = await answered(b, QB, shownBefore)
  const stateB2 = await b.state()
  const stateA2 = await a.state()
  if (stateB2.path !== '/my-tasks' || stateB2.due !== 'later')
    fail(`B's page is not My tasks filtered to later: ${JSON.stringify(stateB2)}`)
  if (stateA2.due !== 'week')
    fail(`A's page changed while B's run went: ${JSON.stringify(stateA2)}`)
  log(`B: ${JSON.stringify(stateB2)}; ${JSON.stringify(shownB2.slice(-2))}`)
  log("B's run drove B's page alone (Later); A's page kept This week")
  if (shots !== undefined) {
    mkdirSync(shots, { recursive: true })
    await a.shot(join(shots, 'visitor-a.png'))
    await b.shot(join(shots, 'visitor-b.png'))
    log(`screenshots in ${shots}`)
  }
  log('OK')
} catch (error) {
  failure = error
  console.error(
    `verify-assistant: FAILED: ${error instanceof Error ? error.message : String(error)}`,
  )
  if (app !== undefined) console.error(app.output().slice(-3000))
} finally {
  for (const v of visitors) await v.stop().catch(() => {})
  await app?.stop().catch(() => {})
  if (!args.includes('--keep')) rmSync(scratch, { recursive: true, force: true })
}
if (failure !== undefined) process.exit(1)
