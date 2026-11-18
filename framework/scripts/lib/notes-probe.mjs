// The Notes gate's probe: starts the finished app the way a user does (`npm start`, then the desktop window) and walks it over HTTP like a browser.
// Every step names itself, so a failure says what did not work. Returns { ok, steps } and never throws.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { freePort } from './port.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function until(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    await sleep(500)
  }
}

export async function probeNotes(app, env, { tags = false } = {}) {
  const steps = []
  const step = (name, ok, detail = '') => {
    steps.push(`${ok ? 'ok' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`)
    return ok
  }
  // The agent may have been unable to install (a sandbox without network): a user runs `npm install` after it, so the gate does too.
  spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: app, env, stdio: 'ignore' })
  const port = await freePort()
  const server = spawn('npm', ['start'], {
    cwd: app,
    env: { ...env, PORT: String(port) },
    stdio: 'ignore',
  })
  const base = `http://127.0.0.1:${port}`
  try {
    const up = await until(
      () => fetch(`${base}/`, { redirect: 'manual' }).then((r) => r.status),
      30_000,
    )
    if (!step('npm start serves the port', up !== undefined)) return { ok: false, steps }
    let cookie = ''
    const call = async (path, init = {}) => {
      const r = await fetch(`${base}${path}`, {
        redirect: 'manual',
        ...init,
        headers: { origin: base, ...(cookie ? { cookie } : {}), ...init.headers },
      })
      const set = r.headers.get('set-cookie')
      if (set) cookie = set.split(';')[0]
      return r
    }
    // A refusal is a 4xx, or a page (not a redirect into the app) that says what is wrong; either way no session starts.
    const message =
      /invalid|incorrect|wrong|error|required|must|enter|valid|too short|at least|empty|blank|missing|taken|exists/i
    const refused = async (r) =>
      (r.status >= 400 && r.status < 500) || (r.status === 200 && message.test(await r.text()))
    const form = (data) => ({ method: 'POST', body: new URLSearchParams(data) })
    const email = `gate${Date.now()}@example.com`
    step(
      '/ or /notes sends a visitor to log in',
      (await call('/notes')).status >= 300 || (await call('/notes')).status === 401,
    )
    const bad = await call('/signup', form({ email: 'not-an-email', password: 'x' }))
    step('sign up refuses bad input with a message', await refused(bad), `status ${bad.status}`)
    const su = await call('/signup', form({ email, password: 'correct horse battery' }))
    step('sign up is accepted', su.status < 400, `status ${su.status}`)
    // An app may sign the new user in at once, or send them to the log in page: both are fine.
    if (cookie === '') await call('/login', form({ email, password: 'correct horse battery' }))
    step('a session cookie is set', cookie !== '')
    const notes = await call('/notes')
    step('the notes page shows after sign up', notes.status === 200, `status ${notes.status}`)
    const empty = await call('/notes', form({ title: '', body: 'x' }))
    step(
      'create refuses an empty title with a message',
      await refused(empty),
      `status ${empty.status}`,
    )
    const made = await call('/notes', form({ title: 'Gate note', body: 'findme body' }))
    step('create works', made.status >= 200 && made.status < 400, `status ${made.status}`)
    const list = await (await call('/notes')).text()
    step('the note is listed', list.includes('Gate note'))
    const found = await (await call('/notes?q=findme')).text()
    const missing = await (await call('/notes?q=zzznotthere')).text()
    step(
      'search finds it and only it',
      found.includes('Gate note') && !missing.includes('Gate note'),
    )
    if (tags) {
      await call('/notes', form({ title: 'Tagged note', body: 'about tags', tags: 'alpha, beta' }))
      await call('/notes', form({ title: 'Plain note', body: 'no tags here', tags: 'gamma' }))
      const shown = await (await call('/notes')).text()
      step("the list shows a note's tags", /alpha/.test(shown) && /beta/.test(shown))
      const byTag = await (await call('/notes?tag=alpha')).text()
      step(
        '?tag=alpha lists only notes with that tag',
        byTag.includes('Tagged note') && !byTag.includes('Plain note'),
      )
      const none = await (await call('/notes?tag=zzz')).text()
      step('?tag=zzz lists none', !none.includes('Tagged note') && !none.includes('Plain note'))
      const edit = (shown.match(/\/notes\/(\d+)\/edit[^>]*>Tagged note/) ?? [])[1]
      const editPage = edit ? await (await call(`/notes/${edit}/edit`)).text() : ''
      step('the edit form carries the tags', /alpha/.test(editPage) && /beta/.test(editPage))
      const apiTagged = await (await call('/api/notes')).text()
      step('the JSON API returns the tags', /alpha/.test(apiTagged) && /beta/.test(apiTagged))
    }
    const api = await call('/api/notes')
    const body = await api.json().catch(() => undefined)
    step(
      'the JSON API lists notes',
      api.status === 200 && JSON.stringify(body).includes('Gate note'),
      `status ${api.status}`,
    )
    const anon = await fetch(`${base}/api/notes`, { redirect: 'manual' })
    step(
      'the JSON API refuses a visitor',
      [301, 302, 303, 307, 401, 403].includes(anon.status),
      `status ${anon.status}`,
    )
    const id = (list.match(/\/notes\/(\d+)/) ?? [])[1]
    const edited = id
      ? await call(`/notes/${id}`, form({ title: 'Gate renamed', body: 'v2' }))
      : undefined
    step(
      'edit works',
      edited !== undefined && edited.status >= 200 && edited.status < 400,
      `status ${edited?.status}`,
    )
    step('the edit shows', (await (await call('/notes')).text()).includes('Gate renamed'))
    const del = id ? await call(`/notes/${id}/delete`, { method: 'POST' }) : undefined
    step(
      'delete works',
      del !== undefined && del.status >= 200 && del.status < 400,
      `status ${del?.status}`,
    )
    step('the note is gone', !(await (await call('/notes')).text()).includes('Gate renamed'))
    const out = await call('/logout', { method: 'POST' })
    cookie = ''
    step('log out works', out.status < 400)
    const login = await call('/login', form({ email, password: 'correct horse battery' }))
    step('log in works', login.status < 400 && cookie !== '', `status ${login.status}`)
    const wrong = await call('/login', form({ email, password: 'wrong wrong wrong' }))
    step(
      'log in refuses a wrong password with a message',
      await refused(wrong),
      `status ${wrong.status}`,
    )
    const counter = await (await call('/notes/new')).text().catch(() => '')
    step(
      'the form page carries client JS for a counter or filter',
      /<script/.test(counter) || /<script/.test(list),
    )
  } finally {
    server.kill('SIGTERM')
    spawn('pkill', ['-f', `${app}`], { stdio: 'ignore' })
    await sleep(500)
  }
  // The desktop window: the script exists, the window opens on the app, and closing it ends the process.
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  if (!step('npm run desktop exists', typeof pkg.scripts?.desktop === 'string'))
    return { ok: steps.every((s) => s.startsWith('ok')), steps }
  const debug = await freePort()
  const entry = Object.values(pkg.scripts).find((s) => /electron/.test(s))
  const args = (entry ?? '').split(/\s+/).slice(1)
  const electron = spawn(
    join(app, 'node_modules', '.bin', 'electron'),
    [`--remote-debugging-port=${debug}`, ...args],
    {
      cwd: app,
      env: {
        ...env,
        ACRYLBLENDS_PORT: '0',
        ELECTRON_CACHE: join(homedir(), 'Library', 'Caches', 'electron'),
      },
      stdio: 'ignore',
    },
  )
  let launchError
  electron.on('error', (error) => {
    launchError = error.code ?? error.message
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
  step(
    'the desktop window opens on the app',
    target !== undefined && /login|sign|notes/i.test(`${target.title} ${target.url}`),
    target ? `${target.title} ${target.url}` : `no window${launchError ? `: ${launchError}` : ''}`,
  )
  electron.kill('SIGTERM')
  return { ok: steps.every((s) => s.startsWith('ok')), steps }
}
