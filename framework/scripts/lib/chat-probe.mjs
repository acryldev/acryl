// The AI chat gate's probe: starts the finished app the way a user does (`npm start`, then the desktop window) against a fake OpenAI-compatible server that streams slowly,
// and checks that the answer arrives piece by piece, that Stop and a closed connection abort the upstream request, that history is kept, and that the window works.
// Every step names itself. Returns { ok, steps } and never throws.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { freePort } from './port.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(300)
  }
}

/** A fake chat completions service: streams `tok0 tok1 ...` (40 pieces, one per 150 ms), records the requests and the closed connections. */
function fakeLlm() {
  const state = { requests: [], closedEarly: 0, finished: 0, auth: [] }
  const server = createHttp((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        state.requests.push(JSON.parse(body))
      } catch {
        state.requests.push({})
      }
      state.auth.push(req.headers.authorization ?? '')
      let sent = 0
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const timer = setInterval(() => {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: `tok${sent++} ` } }] })}\n\n`,
        )
        if (sent >= 40) {
          clearInterval(timer)
          state.finished++
          res.end('data: [DONE]\n\n')
        }
      }, 150)
      res.on('close', () => {
        clearInterval(timer)
        if (sent < 40) state.closedEarly++
      })
    })
  })
  return { server, state }
}

export async function probeChat(app, env) {
  const steps = []
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? 'ok' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
    return ok
  }
  const llm = fakeLlm()
  const llmPort = await freePort()
  await new Promise((r) => llm.server.listen(llmPort, '127.0.0.1', r))
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const appEnv = {
    ...env,
    PORT: String(port),
    DEEPSEEK_API_KEY: 'gate-test-key',
    DEEPSEEK_BASE_URL: `http://127.0.0.1:${llmPort}`,
    DEEPSEEK_MODEL: 'gate-model',
  }
  spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: app, env, stdio: 'ignore' })
  const server = spawn('npm', ['start'], { cwd: app, env: appEnv, stdio: 'ignore' })
  const post = (message, extra = {}, signal) =>
    fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ message, ...extra }),
      signal,
    })
  try {
    const up = await until(() => fetch(`${base}/`).then((r) => r.status), 30_000)
    if (!step('npm start serves the port', up !== undefined)) return { ok: false, steps }
    step(
      'the home page is HTML',
      await fetch(`${base}/`).then(
        (r) => r.status === 200 && /html/.test(r.headers.get('content-type') ?? ''),
      ),
    )

    // 1. The answer streams: several chunks, spread over time.
    const started = Date.now()
    const res = await post('hello')
    step(
      'POST /api/chat answers 200 text/event-stream',
      res.status === 200 && /event-stream/.test(res.headers.get('content-type') ?? ''),
      `status ${res.status} ${res.headers.get('content-type')}`,
    )
    const chunks = []
    if (res.body)
      for await (const chunk of res.body)
        chunks.push({ at: Date.now() - started, text: Buffer.from(chunk).toString() })
    const all = chunks.map((c) => c.text).join('')
    step(
      'the answer arrives in several chunks over time, not at once',
      chunks.length >= 4 && chunks.at(-1).at - chunks[0].at > 1500,
      `${chunks.length} chunks over ${chunks.length ? chunks.at(-1).at - chunks[0].at : 0} ms`,
    )
    step('the pieces of the model are in the stream', all.includes('tok0') && all.includes('tok39'))
    step(
      'the model was asked with the chosen model, stream: true and the message, key only as a Bearer header',
      llm.state.requests[0]?.stream === true &&
        llm.state.requests[0]?.model === 'gate-model' &&
        JSON.stringify(llm.state.requests[0]?.messages ?? []).includes('hello') &&
        llm.state.auth[0] === 'Bearer gate-test-key',
    )

    // 2. History is kept and can be read back.
    const list = await fetch(`${base}/api/conversations`)
      .then((r) => r.json())
      .catch(() => undefined)
    const first = list?.conversations?.[0]
    step(
      'GET /api/conversations lists the conversation',
      Boolean(first?.id),
      JSON.stringify(list)?.slice(0, 120),
    )
    const one = first
      ? await fetch(`${base}/api/conversations/${first.id}`)
          .then((r) => r.json())
          .catch(() => undefined)
      : undefined
    const stored = JSON.stringify(one?.messages ?? [])
    step(
      'GET /api/conversations/:id has the question and the whole answer',
      stored.includes('hello') && stored.includes('tok39'),
    )
    // A follow-up in the same conversation sends the history to the model.
    const before = llm.state.requests.length
    const follow = await post('and then', { conversation: first?.id })
    if (follow.body) for await (const _ of follow.body); // drain
    const sent = JSON.stringify(llm.state.requests[before]?.messages ?? [])
    step(
      'a follow-up sends the earlier messages to the model too',
      sent.includes('hello') && sent.includes('tok0') && sent.includes('and then'),
    )

    // 3. A closed connection aborts the upstream request, and what arrived is kept.
    const closedBefore = llm.state.closedEarly
    const ctl = new AbortController()
    const live = await post('stop me', {}, ctl.signal)
    const reader = live.body.getReader()
    let seen = ''
    while (!seen.includes('tok2')) seen += Buffer.from((await reader.read()).value ?? []).toString()
    ctl.abort()
    const closed = await until(() => Promise.resolve(llm.state.closedEarly > closedBefore), 5000)
    step('closing the connection aborts the request to the model', Boolean(closed))
    await sleep(400)
    const list2 = await fetch(`${base}/api/conversations`)
      .then((r) => r.json())
      .catch(() => undefined)
    const stopped = list2?.conversations?.[0]
    const stoppedMessages = stopped
      ? JSON.stringify(
          (
            await fetch(`${base}/api/conversations/${stopped.id}`)
              .then((r) => r.json())
              .catch(() => ({}))
          ).messages ?? [],
        )
      : ''
    step(
      'the part of the answer that arrived is kept',
      stoppedMessages.includes('tok0') && !stoppedMessages.includes('tok39'),
    )
    const bad = await post('')
    step(
      'an empty message is refused with a 4xx',
      bad.status >= 400 && bad.status < 500,
      `status ${bad.status}`,
    )
  } finally {
    server.kill('SIGTERM')
    spawn('pkill', ['-f', `${app}`], { stdio: 'ignore' })
    await sleep(500)
  }

  // 4. The window: type, send, watch it grow, press Stop, see it stop and the upstream close.
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  if (!step('npm run desktop exists', typeof pkg.scripts?.desktop === 'string')) {
    llm.server.close()
    return { ok: false, steps }
  }
  const debug = await freePort()
  const args = (Object.values(pkg.scripts).find((s) => /electron/.test(s)) ?? '')
    .split(/\s+/)
    .slice(1)
  const closedBefore = llm.state.closedEarly
  const electron = spawn(
    join(app, 'node_modules', '.bin', 'electron'),
    [`--remote-debugging-port=${debug}`, ...args],
    {
      cwd: app,
      env: {
        ...appEnv,
        ACRYLBLENDS_PORT: '0',
        PORT: '0',
        ELECTRON_CACHE: join(homedir(), 'Library', 'Caches', 'electron'),
      },
      stdio: 'ignore',
    },
  )
  let launchError
  electron.on('error', (e) => {
    launchError = e.code ?? e.message
  })
  const target = await until(
    () =>
      fetch(`http://127.0.0.1:${debug}/json/list`)
        .then((r) => r.json())
        .then((l) =>
          l.find(
            (t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:') && t.title !== '',
          ),
        ),
    launchError ? 1 : 120_000,
  )
  if (
    step('the desktop window opens on the app', target !== undefined, launchError ?? 'no window')
  ) {
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let id = 0
    const pending = new Map()
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id) pending.get(m.id)?.(m.result)
    }
    const ev = (expression) =>
      new Promise((r) => {
        const i = ++id
        pending.set(i, r)
        ws.send(
          JSON.stringify({
            id: i,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true, awaitPromise: true },
          }),
        )
      }).then((x) => x?.result?.value)
    await sleep(2000)
    const buttons = () =>
      ev(
        `[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim()).join('|')`,
      )
    const text = () => ev('document.body.innerText')
    step(
      'the window has a text box and a Send button',
      (await ev(`!!document.querySelector('textarea, input[type=text], input:not([type])')`)) ===
        true && /Send/i.test((await buttons()) ?? ''),
    )
    await ev(
      `(() => { const t = document.querySelector('textarea, input[type=text], input:not([type])'); const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(t), 'value').set; set.call(t, 'window question'); t.dispatchEvent(new Event('input', {bubbles:true})); t.dispatchEvent(new Event('change', {bubbles:true})) })()`,
    )
    await sleep(300)
    await ev(
      `(() => { const f = document.querySelector('form'); if (f) f.requestSubmit(); else [...document.querySelectorAll('button')].find(b=>/^s*sends*$/i.test(b.textContent)).click() })()`,
    )
    await sleep(1300)
    const a = (await text()) ?? ''
    await sleep(700)
    const b = (await text()) ?? ''
    step(
      'in the window the answer grows while it streams',
      a.includes('tok0') && b.length > a.length && /(^|\|)Stop($|\|)/.test((await buttons()) ?? ''),
      `${a.length} then ${b.length}; buttons ${await buttons()}`,
    )
    await ev(
      `[...document.querySelectorAll('button')].find(b=>/^s*stops*$/i.test(b.textContent)).click()`,
    )
    await sleep(900)
    const c = (await text()) ?? ''
    await sleep(900)
    const d = (await text()) ?? ''
    step(
      'after Stop the answer stops growing and the Stop button goes',
      c === d && !/(^|\|)Stop($|\|)/.test((await buttons()) ?? ''),
      `buttons ${await buttons()}`,
    )
    step('Stop aborted the request to the model', llm.state.closedEarly > closedBefore)
    ws.close()
  }
  electron.kill('SIGTERM')
  llm.server.close()
  return { ok: steps.every((s) => s.startsWith('ok')), steps }
}
