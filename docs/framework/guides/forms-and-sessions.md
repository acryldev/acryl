# Forms, sessions and a database

This page shows the parts a small multi-user app needs, in the order an app uses them: a database, passwords, a cookie session, HTML forms with server-side validation, and a JSON API that shares the same rules.
It is the shape of a "Notes" app built from these docs alone (sign up, log in, create, edit, delete and search notes, a typed test client for the API).

## A database with `node:sqlite`

Node.js 22.19 and later include SQLite, so there is nothing to install. `DatabaseSync` is synchronous, which suits a small app.

```ts
import { DatabaseSync } from 'node:sqlite'

export function openDb(path = process.env.NOTES_DB ?? 'notes.db'): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  return db
}
```

Take the database as an argument (`createApp(db)`) instead of opening it at import time. A test then passes `openDb(':memory:')`, and importing the app module does not create a file.

## Passwords with `node:crypto`

Never store a password. Store a salted `scrypt` hash and compare in constant time.

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, 64)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const expected = Buffer.from(key, 'hex')
  return timingSafeEqual(await scryptAsync(password, Buffer.from(salt, 'hex'), expected.length), expected)
}
```

## A cookie session

The simplest session is a random token in an `httpOnly` cookie and a `sessions` row that maps it to a user. Log out deletes the row, so a stolen cookie stops working.
`getCookie`, `setCookie` and `deleteCookie` are in [the Cookie helper](../helpers/cookie.md).

```ts
import { Acryl } from 'acrylblends'
import { createMiddleware } from 'acrylblends/factory'
import { deleteCookie, getCookie, setCookie } from 'acrylblends/cookie'
import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

type Env = { Variables: { user: { id: number; email: string } } }

export function createApp(db: DatabaseSync) {
  const userFor = (token: string | undefined) =>
    token
      ? (db
          .prepare('SELECT users.id AS id, users.email AS email FROM sessions JOIN users ON users.id = sessions.user_id WHERE token = ?')
          .get(token) as { id: number; email: string } | undefined)
      : undefined

  const requireUser = createMiddleware<Env>(async (c, next) => {
    const user = userFor(getCookie(c, 'sid'))
    if (!user) return c.redirect('/login')
    c.set('user', user)
    await next()
  })

  const app = new Acryl<Env>()
  app.use('/notes', requireUser)
  app.use('/notes/*', requireUser)
  app.get('/notes', (c) => c.text(`Hello ${c.get('user').email}`))

  app.post('/login-example', (c) => {
    const token = randomBytes(32).toString('hex')
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, 1)
    setCookie(c, 'sid', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60 * 60 * 24 * 30 })
    return c.redirect('/notes', 303)
  })

  app.post('/logout', (c) => {
    const token = getCookie(c, 'sid')
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    deleteCookie(c, 'sid', { path: '/' })
    return c.redirect('/login', 303)
  })
  return app
}
```

A middleware registered with `use('/notes', ...)` does not cover `/notes/…`: register both `'/notes'` and `'/notes/*'`.
After a form POST redirect with status **303** so the browser follows with a GET.

## Forms and server-side validation

`await c.req.parseBody()` reads an HTML form (`application/x-www-form-urlencoded` or multipart). Each value is a `string` or a `File`, so convert with `String(...)` or check `typeof`.
Keep the rules in one function that both the form routes and the JSON API call, and answer an invalid form with **status 400 and the same page**, with the messages and the typed values filled in:

```ts
export interface NoteInput {
  title: string
  body: string
}

export function checkNote(value: unknown): { value: NoteInput } | { issues: { message: string; path: string[] }[] } {
  const input = (value ?? {}) as Record<string, unknown>
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body : ''
  const issues: { message: string; path: string[] }[] = []
  if (title === '') issues.push({ message: 'Give the note a title.', path: ['title'] })
  if (body.length > 2000) issues.push({ message: 'The note is at most 2000 characters.', path: ['body'] })
  return issues.length > 0 ? { issues } : { value: { title, body } }
}
```

```tsx
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.post('/notes', async (c) => {
  const form = await c.req.parseBody()
  const checked = checkNote(form)
  if ('issues' in checked) {
    const messages = checked.issues.map((issue) => issue.message)
    return c.html(
      <form method="post" action="/notes">
        <ul role="alert">
          {messages.map((message) => (
            <li>{message}</li>
          ))}
        </ul>
        <input name="title" value={String(form.title ?? '')} />
        <textarea name="body">{String(form.body ?? '')}</textarea>
        <button type="submit">Save</button>
      </form>,
      400,
    )
  }
  return c.redirect('/notes', 303)
})
```

Escaping is automatic in JSX: `{String(form.title)}` is safe to put in a page. Use `dangerouslySetInnerHTML` only for text you wrote yourself, such as a `<style>` or `<script>` block.

## A JSON API that shares the rules

Wrap `checkNote` as a Standard Schema (an object with a `~standard.validate` function) and give it to `schemaValidator`. A failure answers 400 with `{ error, issues: [{ message, path }] }`.
Build the API app by **chaining** the routes on `new Acryl()`, because the typed client and `testClient` only know chained routes:

```ts
import { Acryl } from 'acrylblends'
import { schemaValidator, type StandardSchema } from 'acrylblends/schema-validator'

const NoteSchema: StandardSchema<NoteInput> = {
  '~standard': { validate: (value) => checkNote(value) },
}

export const api = new Acryl()
  .get('/', (c) => c.json({ notes: [] as NoteInput[] }, 200))
  .post('/', schemaValidator('json', NoteSchema), (c) => c.json({ note: c.req.valid('json') }, 201))
  .get('/:id', (c) => (c.req.param('id') === '1' ? c.json({ note: { title: 't', body: '' } }, 200) : c.json({ error: 'No such note.' }, 404)))
```

Mount it below the pages with `app.route('/api/notes', api)`.

## Testing every route

Call the app with `app.request`. A form POST needs a body and the cookie of a signed-in user, which a test reads from the sign-up response's `set-cookie` header:

```ts
const response = await app.request('/signup', {
  method: 'POST',
  body: new URLSearchParams({ email: 'a@example.com', password: 'correct horse' }),
})
const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
await app.request('/notes', { headers: { cookie } })
```

For the typed API use `testClient` ([Testing helper](../helpers/testing.md)); the cookie goes in the second argument of each call:

```ts
import { testClient } from 'acrylblends/testing'

const client = testClient(api)
const created = await client.index.$post({ json: { title: 'First', body: 'hello' } }, { headers: { cookie } })
const { note } = await created.json()
const one = await client[':id'].$get({ param: { id: '1' } }, { headers: { cookie } })
```

A route mounted at `'/'` is `client.index` and `'/:id'` is `client[':id']`.

## A part of the page that reacts in the browser

A live character counter or an instant filter needs a little JavaScript in the page. The simplest way, with no build step, is a `<script>` in the server-rendered page:

```tsx
const counter = `
  const area = document.getElementById('body')
  const out = document.getElementById('count')
  const show = () => { out.textContent = area.value.length + ' / ' + area.maxLength }
  area.addEventListener('input', show)
  show()
`

export const Field = () => (
  <>
    <textarea id="body" name="body" maxlength={2000} />
    <small id="count" aria-live="polite" />
    <script dangerouslySetInnerHTML={{ __html: counter }} />
  </>
)
```

[Client Components](jsx-dom.md) (`acrylblends/jsx/dom`) are for pages that need components and state in the browser; on Node, [Client components without a bundler](client-modules.md) serves them to the browser with one script tag, or bundle them with Vite or esbuild.
