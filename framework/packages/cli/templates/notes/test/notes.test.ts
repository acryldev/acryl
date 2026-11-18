import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type {} from '../plugins/acryl-db/src/cordis.ts'
import type { Db } from '../plugins/acryl-db/src/index.ts'
import { testClient } from '../plugins/acryl-router/src/helpers/index.ts'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { createApp as boot } from '../src/app.ts'
import { createApi, createApp } from '../src/notes-app.ts'

/** Throwaway homes and databases live inside the project (`.acrylblends/` is ignored by git), because a sandboxed agent may not write to the system temp folder. */
const scratch = join(fileURLToPath(new URL('..', import.meta.url)), '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/**
 * A fresh database file in a throwaway home with the real migrations, opened by the app's own `db` row (the whole Cordis app boots, so the test exercises the same
 * composition as production). Every app is stopped, and its home removed, when the tests end.
 */
const stops: (() => Promise<void>)[] = []
after(() => Promise.all(stops.map((stop) => stop())))
async function booted(options: { prefix?: string } = {}) {
  const home = await mkdtemp(join(scratch, 'notes-test-'))
  const app = await boot(withPort(pinnedInstance(home, { root: projectRoot }), 0), {
    database: join(home, 'test.sqlite'),
    listen: false,
    ...options,
  })
  stops.push(async () => {
    await app.stop()
    await rm(home, { recursive: true, force: true })
  })
  return app
}
async function memoryDb(): Promise<Db> {
  return (await booted()).root.db
}

const form = (data: Record<string, string>, cookie = ''): RequestInit => ({
  method: 'POST',
  body: new URLSearchParams(data),
  headers: { origin: 'http://localhost', ...(cookie ? { cookie } : {}) },
})

async function signedUp(app: ReturnType<typeof createApp>, email = 'a@example.com') {
  const res = await app.request('/signup', form({ email, password: 'correct horse' }))
  assert.equal(res.status, 303)
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

test('the home page sends a visitor to the notes, which send them to log in', async () => {
  const app = createApp(await memoryDb())
  assert.equal((await app.request('/')).headers.get('location'), '/notes')
  const res = await app.request('/notes')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login')
})

test('sign up validates, refuses a duplicate, and starts a session', async () => {
  const app = createApp(await memoryDb())
  assert.match(await (await app.request('/signup')).text(), /Create account/)
  const bad = await app.request('/signup', form({ email: 'nope', password: 'no way' }))
  assert.equal(bad.status, 400)
  const text = await bad.text()
  assert.match(text, /valid email/)
  assert.match(text, /at least 8 characters/)
  const cookie = await signedUp(app)
  assert.match(cookie, /^sid=/)
  const again = await app.request(
    '/signup',
    form({ email: 'a@example.com', password: 'correct horse' }),
  )
  assert.equal(again.status, 400)
  assert.match(await again.text(), /already has an account/)
})

test('log in checks the password; log out ends the session', async () => {
  const app = createApp(await memoryDb())
  const first = await signedUp(app)
  assert.match(await (await app.request('/login')).text(), /Log in/)
  const wrong = await app.request(
    '/login',
    form({ email: 'a@example.com', password: 'nope nope nope' }),
  )
  assert.equal(wrong.status, 401)
  assert.match(await wrong.text(), /Wrong email or password/)
  const empty = await app.request('/login', form({ email: '', password: '' }))
  assert.equal(empty.status, 400)
  const ok = await app.request(
    '/login',
    form({ email: 'a@example.com', password: 'correct horse' }),
  )
  assert.equal(ok.status, 303)
  const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  assert.equal((await app.request('/notes', { headers: { cookie } })).status, 200)
  const out = await app.request('/logout', form({}, cookie))
  assert.equal(out.headers.get('location'), '/login')
  assert.equal((await app.request('/notes', { headers: { cookie } })).status, 302)
  assert.equal((await app.request('/notes', { headers: { cookie: first } })).status, 200)
})

test('create, search, edit and delete a note through the forms', async () => {
  const app = createApp(await memoryDb())
  const cookie = await signedUp(app)
  assert.match(
    await (await app.request('/notes/new', { headers: { cookie } })).text(),
    /data-island="counter"/,
  )

  const invalid = await app.request('/notes', form({ title: ' ', body: 'x' }, cookie))
  assert.equal(invalid.status, 400)
  assert.match(await invalid.text(), /Give the note a title/)

  assert.equal(
    (await app.request('/notes', form({ title: 'Groceries', body: 'milk and eggs' }, cookie)))
      .status,
    303,
  )
  assert.equal(
    (await app.request('/notes', form({ title: 'Ideas', body: 'a framework' }, cookie))).status,
    303,
  )

  const list = await (await app.request('/notes', { headers: { cookie } })).text()
  assert.match(list, /Groceries/)
  assert.match(list, /Ideas/)
  const found = await (await app.request('/notes?q=eggs', { headers: { cookie } })).text()
  assert.match(found, /Groceries/)
  assert.doesNotMatch(found, /Ideas/)
  assert.match(
    await (await app.request('/notes?q=zzz', { headers: { cookie } })).text(),
    /No note matches/,
  )

  const edit = await app.request('/notes/1/edit', { headers: { cookie } })
  assert.match(await edit.text(), /milk and eggs/)
  const toolong = await app.request('/notes/1', form({ title: 'x'.repeat(81), body: '' }, cookie))
  assert.equal(toolong.status, 400)
  assert.match(await toolong.text(), /at most 80/)
  assert.equal(
    (await app.request('/notes/1', form({ title: 'Shopping', body: 'oat milk' }, cookie))).status,
    303,
  )
  assert.match(await (await app.request('/notes', { headers: { cookie } })).text(), /Shopping/)
  assert.equal((await app.request('/notes/99', form({ title: 'x', body: '' }, cookie))).status, 404)
  assert.equal((await app.request('/notes/99/edit', { headers: { cookie } })).status, 404)

  assert.equal((await app.request('/notes/1/delete', form({}, cookie))).status, 303)
  assert.equal((await app.request('/notes/1/delete', form({}, cookie))).status, 404)
  assert.doesNotMatch(
    await (await app.request('/notes', { headers: { cookie } })).text(),
    /Shopping/,
  )
})

test("one user cannot read or change another user's notes", async () => {
  const app = createApp(await memoryDb())
  const alice = await signedUp(app, 'alice@example.com')
  const bob = await signedUp(app, 'bob@example.com')
  await app.request('/notes', form({ title: 'Secret', body: 'alice only' }, alice))
  assert.equal((await app.request('/notes/1/edit', { headers: { cookie: bob } })).status, 404)
  assert.equal((await app.request('/notes/1/delete', form({}, bob))).status, 404)
  assert.match(await (await app.request('/notes', { headers: { cookie: alice } })).text(), /Secret/)
})

test('the JSON API needs a session and validates input', async () => {
  const db = await memoryDb()
  const app = createApp(db)
  const cookie = await signedUp(app)
  const res = await app.request('/api/notes')
  assert.equal(res.status, 401)
  const bad = await app.request('/api/notes', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  })
  assert.equal(bad.status, 400)
  const body = (await bad.json()) as { issues: { message: string }[] }
  assert.match(body.issues[0]?.message ?? '', /title/)
})

test('the typed client covers every API route', async () => {
  const db = await memoryDb()
  const app = createApp(db)
  const cookie = await signedUp(app)
  const client = testClient(createApi(db))
  const as = { headers: { cookie } }

  const created = await client.index.$post({ json: { title: 'First', body: 'hello' } }, as)
  assert.equal(created.status, 201)
  const { note } = await created.json()
  assert.equal(note.title, 'First')

  const listed = await client.index.$get({ query: { q: 'hel' } }, as)
  assert.equal((await listed.json()).notes.length, 1)

  const got = await client[':id'].$get({ param: { id: String(note.id) } }, as)
  assert.equal(got.status, 200)
  const missing = await client[':id'].$get({ param: { id: '99' } }, as)
  assert.equal(missing.status, 404)

  const updated = await client[':id'].$put(
    { param: { id: String(note.id) }, json: { title: 'Renamed', body: '' } },
    as,
  )
  assert.equal(updated.status, 200)

  const gone = await client[':id'].$delete({ param: { id: String(note.id) } }, as)
  assert.equal(gone.status, 200)
  assert.equal((await client[':id'].$delete({ param: { id: String(note.id) } }, as)).status, 404)
})

test('csrf refuses a form POST from another site', async () => {
  const app = createApp(await memoryDb())
  const res = await app.request('/signup', {
    method: 'POST',
    body: new URLSearchParams({ email: 'a@example.com', password: 'correct horse' }),
    headers: { origin: 'https://evil.example' },
  })
  assert.equal(res.status, 403)
})

test('the session cookie is Secure over HTTPS, and behind a proxy only when the proxy is trusted', async () => {
  const body = new URLSearchParams({ email: 'a@example.com', password: 'correct horse' })
  const flags = async (url: string, headers: Record<string, string>, trustProxy: boolean) => {
    const app = createApp(await memoryDb(), { trustProxy })
    const origin = new URL(url).origin
    const res = await app.request(url, { method: 'POST', body, headers: { origin, ...headers } })
    assert.equal(res.status, 303)
    return res.headers.get('set-cookie') ?? ''
  }
  assert.doesNotMatch(await flags('http://localhost/signup', {}, false), /Secure/i)
  assert.match(await flags('https://localhost/signup', {}, false), /Secure/i)
  const forwarded = { 'x-forwarded-proto': 'https' }
  assert.doesNotMatch(await flags('http://localhost/signup', forwarded, false), /Secure/i)
  assert.match(await flags('http://localhost/signup', forwarded, true), /Secure/i)
})

test('behind a proxy csrf accepts the public origin and still refuses others', async () => {
  const app = createApp(await memoryDb(), { publicOrigin: 'https://notes.example.com' })
  const post = (origin: string) =>
    app.request('/signup', {
      method: 'POST',
      body: new URLSearchParams({ email: 'a@example.com', password: 'correct horse' }),
      headers: { origin },
    })
  assert.equal((await post('https://notes.example.com')).status, 303)
  assert.equal((await post('https://evil.example')).status, 403)
})

test('an error answers a plain 500 with no stack and no detail', async () => {
  const fail = async (): Promise<never> => {
    throw new Error('secret detail at /srv/app/db.ts:1')
  }
  const broken: Db = { exec: fail, run: fail, get: fail, all: fail, transaction: fail }
  const app = createApp(broken)
  const res = await app.request('/notes', { headers: { cookie: 'sid=anything' } })
  assert.equal(res.status, 500)
  assert.equal(await res.text(), 'Internal Server Error')
})

test('the note form loads the character counter, a client component compiled for the browser and served by the running app', async () => {
  const running = await booted()
  const app = createApp(running.root.db)
  const cookie = await signedUp(app)
  assert.match(
    await (await app.request('/notes/new', { headers: { cookie } })).text(),
    /src="\/client\/counter\.tsx"/,
  )
  // Through the router and the server, as a browser asks: the client folder is mounted by src/routes.ts.
  const module = await running.root.router.request('/client/counter.tsx')
  assert.equal(module.status, 200)
  assert.match(module.headers.get('content-type') ?? '', /javascript/)
  assert.doesNotMatch(await module.text(), /<Count/)
  assert.equal((await running.root.router.request('/client/@acrylblends/jsx-dom.js')).status, 200)
  assert.equal((await running.root.router.request('/client/../src/db.ts')).status, 404)
})

test('the frame mounts the app at /app: the login page, its links and redirects follow the prefix, and the client module is served there', async () => {
  const running = await booted({ prefix: '/app' })
  const root = running.root
  const home = await root.router.request('/app')
  assert.equal(home.status, 302)
  assert.equal(home.headers.get('location'), '/app/notes')
  const notes = await root.router.request('/app/notes')
  assert.equal(notes.status, 302)
  assert.equal(notes.headers.get('location'), '/app/login')
  const login = await root.router.request('/app/login')
  assert.equal(login.status, 200)
  const loginHtml = await login.text()
  assert.match(loginHtml, /action="\/app\/login"/u)
  assert.match(loginHtml, /href="\/app\/signup"/u)
  assert.match(loginHtml, /src="\/app\/client\/counter\.tsx"/u)
  // Signing up through the framed path lands on the framed notes page, and its links stay under the prefix.
  const signup = await root.router.request(
    '/app/signup',
    form({ email: 'framed@example.com', password: 'correct horse' }),
  )
  assert.equal(signup.status, 303)
  assert.equal(signup.headers.get('location'), '/app/notes')
  const cookie = (signup.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  const list = await root.router.request('/app/notes', { headers: { cookie } })
  assert.equal(list.status, 200)
  const listHtml = await list.text()
  assert.match(listHtml, /href="\/app\/notes\/new"/u)
  assert.match(listHtml, /action="\/app\/notes"/u)
  // The client component is compiled and served below the app's prefix.
  const module = await root.router.request('/app/client/counter.tsx')
  assert.equal(module.status, 200)
  assert.match(module.headers.get('content-type') ?? '', /javascript/u)
  assert.equal((await root.router.request('/app/client/@acrylblends/jsx-dom.js')).status, 200)
  // The app's own URLs are not mounted in the frame; its own server keeps them (the tests above).
  assert.equal((await root.router.request('/login')).status, 404)
})
