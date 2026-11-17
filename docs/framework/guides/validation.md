# Validation

Acryl provides only a very thin Validator.
However, it can be powerful when combined with a third-party Validator.
In addition, the RPC feature allows you to share API specifications with your clients through types.

## Manual validator

First, introduce a way to validate incoming values without using the third-party Validator.

Import `validator` from `acrylblends/validator`.

```ts
import { validator } from 'acrylblends/validator'
```

To validate form data, specify `form` as the first argument and a callback as the second argument.
In the callback, validates the value and return the validated values at the end.
The `validator` can be used as middleware.

```ts
app.post(
  '/posts',
  validator('form', (value, c) => {
    const body = value['body']
    if (!body || typeof body !== 'string') {
      return c.text('Invalid!', 400)
    }
    return {
      body: body,
    }
  }),
  //...
```

Within the handler, you can get the validated value with `c.req.valid('form')`.

```ts
, (c) => {
  const { body } = c.req.valid('form')
  // ... do something
  return c.json(
    {
      message: 'Created!',
    },
    201
  )
}
```

Validation targets include `json`, `query`, `header`, `param` and `cookie` in addition to `form`.

**Warning.**

When you validate `json` or `form`, the request _must_ contain a matching `content-type` header (e.g. `Content-Type: application/json` for `json`). Otherwise, the request body will not be parsed and you will receive an empty object (`{}`) as value in the callback.

It is important to set the `content-type` header when testing using
[`app.request()`](../api/request.md).

Given an application like this.

```ts
const app = new Acryl()
app.post(
  '/testing',
  validator('json', (value, c) => {
    // pass-through validator
    return value
  }),
  (c) => {
    const body = c.req.valid('json')
    return c.json(body)
  }
)
```

Your tests can be written like this.

```ts
// ❌ this will not work
const res = await app.request('/testing', {
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
})
const data = await res.json()
console.log(data) // {}

// ✅ this will work
const res = await app.request('/testing', {
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
  headers: new Headers({ 'Content-Type': 'application/json' }),
})
const data = await res.json()
console.log(data) // { key: 'value' }
```

**Warning.**

When you validate `header`, you need to use **lowercase** name as the key.

If you want to validate the `Idempotency-Key` header, you need to use `idempotency-key` as the key.

```ts
// ❌ this will not work
app.post(
  '/api',
  validator('header', (value, c) => {
    // idempotencyKey is always undefined
    // so this middleware always return 400 as not expected
    const idempotencyKey = value['Idempotency-Key']

    if (idempotencyKey == undefined || idempotencyKey === '') {
      throw new HTTPException(400, {
        message: 'Idempotency-Key is required',
      })
    }
    return { idempotencyKey }
  }),
  (c) => {
    const { idempotencyKey } = c.req.valid('header')
    // ...
  }
)

// ✅ this will work
app.post(
  '/api',
  validator('header', (value, c) => {
    // can retrieve the value of the header as expected
    const idempotencyKey = value['idempotency-key']

    if (idempotencyKey == undefined || idempotencyKey === '') {
      throw new HTTPException(400, {
        message: 'Idempotency-Key is required',
      })
    }
    return { idempotencyKey }
  }),
  (c) => {
    const { idempotencyKey } = c.req.valid('header')
    // ...
  }
)
```

## Validating an HTML form

A browser posts a `<form>` as `application/x-www-form-urlencoded`, or as `multipart/form-data` when it has `enctype="multipart/form-data"` (needed
for file inputs). `validator('form', ...)` parses both. Each field arrives as a `string`, a file input as a `File`, and a name that appears more
than once (several checkboxes, or a name ending in `[]`) as an array, so the value has the type `Record<string, string | File | (string | File)[]>`.

This page shows a form and re-renders it with a message when a field is wrong:

```ts
import { Acryl } from 'acrylblends'
import { html } from 'acrylblends/html'
import { validator } from 'acrylblends/validator'

const page = (error?: string) => html`<!doctype html>
  <form method="post" action="/notes" enctype="multipart/form-data">
    <input name="title" required>
    <textarea name="body"></textarea>
    <input type="file" name="attachment">
    <button>Save</button>
    ${error === undefined ? '' : html`<p role="alert">${error}</p>`}
  </form>`

const app = new Acryl()
  .get('/notes/new', (c) => c.html(page()))
  .post(
    '/notes',
    validator('form', (form, c) => {
      const { title, body, attachment } = form
      if (typeof title !== 'string' || title.trim() === '') return c.html(page('Title is required'), 400)
      if (body !== undefined && typeof body !== 'string') return c.html(page('Body must be text'), 400)
      if (attachment !== undefined && !(attachment instanceof File)) return c.html(page('Attachment must be one file'), 400)
      return {
        title: title.trim(),
        body: body ?? '',
        // A file input left empty still sends a part: a File with no name and no bytes.
        attachment: attachment !== undefined && attachment.size > 0 ? attachment : undefined,
      }
    }),
    (c) => {
      const { title, attachment } = c.req.valid('form') // { title: string, body: string, attachment: File | undefined }
      return c.text(`Saved ${title}${attachment === undefined ? '' : ` with ${attachment.name}`}`, 201)
    }
  )
```

The messages are escaped by `html`, so a field value shown back in the page cannot inject markup.

### With a schema

`schemaValidator('form', schema)` takes the same value. It answers a failure with 400 and JSON issues, which suits a form your own script submits
with `fetch()`:

```ts
import * as z from 'zod'
import { schemaValidator } from 'acrylblends/schema-validator'

const NoteForm = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  body: z.string().default(''),
  attachment: z.instanceof(File).optional(),
})

app.post('/api/notes', schemaValidator('form', NoteForm), (c) => {
  const { title } = c.req.valid('form') // typed by the schema's output
  return c.json({ title }, 201)
})
```

For a plain HTML form, call the schema inside `validator('form', ...)` to re-render the page with the first message instead:

```ts
validator('form', (form, c) => {
  const result = NoteForm.safeParse(form)
  return result.success ? result.data : c.html(page(result.error.issues[0]?.message), 400)
})
```

To test a form route, send a `FormData`: `app.request` sets the `multipart/form-data` content type with its boundary itself.

```ts
const form = new FormData()
form.set('title', 'Groceries')
form.set('attachment', new File(['milk'], 'list.txt', { type: 'text/plain' }))
const res = await app.request('/notes', { method: 'POST', body: form })
// res.status === 201, await res.text() === 'Saved Groceries with list.txt'
```

## Multiple validators

You can also include multiple validators to validate different parts of request:

```ts
app.post(
  '/posts/:id',
  validator('param', ...),
  validator('query', ...),
  validator('json', ...),
  (c) => {
    //...
  }
)
```

## With Zod

You can use [Zod](https://zod.dev), one of third-party validators.
We recommend using a third-party validator.

Install from the Npm registry.

**npm**

```sh
npm i zod
```

**yarn**

```sh
yarn add zod
```

**pnpm**

```sh
pnpm add zod
```

**bun**

```sh
bun add zod
```

Import `z` from `zod`.

```ts
import * as z from 'zod'
```

Write your schema.

```ts
const schema = z.object({
  body: z.string(),
})
```

You can use the schema in the callback function for validation and return the validated value.

```ts
const route = app.post(
  '/posts',
  validator('form', (value, c) => {
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      return c.text('Invalid!', 400)
    }
    return parsed.data
  }),
  (c) => {
    const { body } = c.req.valid('form')
    // ... do something
    return c.json(
      {
        message: 'Created!',
      },
      201
    )
  }
)
```

## Standard Schema validator

[Standard Schema](https://standardschema.dev/) is a specification that gives TypeScript validation libraries a common interface, so a tool can accept Zod, Valibot, ArkType and
others without an adapter for each.

`schemaValidator` is part of acrylblends: it validates a request target with any Standard Schema and makes the parsed value available as `c.req.valid(target)`.

```ts
import { schemaValidator } from 'acrylblends/schema-validator'
```

A failed validation answers 400 with `{ "error": "invalid <target>", "issues": [{ "message", "path" }] }`. The failure shapes, the JSON `Content-Type` rule and a body that
is not JSON are described in [Validation with Standard Schema](../cordis/validation.md).

### With Zod

You can use Zod with the schema validator:

**npm**

```sh
npm i zod
```

**yarn**

```sh
yarn add zod
```

**pnpm**

```sh
pnpm add zod
```

**bun**

```sh
bun add zod
```

```ts
import * as z from 'zod'
import { schemaValidator } from 'acrylblends/schema-validator'

const schema = z.object({
  name: z.string(),
  age: z.number(),
})

app.post('/author', schemaValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json({
    success: true,
    message: `${data.name} is ${data.age}`,
  })
})
```

### With Valibot

[Valibot](https://valibot.dev/) is a lightweight alternative to Zod with a modular design:

**npm**

```sh
npm i valibot
```

**yarn**

```sh
yarn add valibot
```

**pnpm**

```sh
pnpm add valibot
```

**bun**

```sh
bun add valibot
```

```ts
import * as v from 'valibot'
import { schemaValidator } from 'acrylblends/schema-validator'

const schema = v.object({
  name: v.string(),
  age: v.number(),
})

app.post('/author', schemaValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json({
    success: true,
    message: `${data.name} is ${data.age}`,
  })
})
```

### With ArkType

[ArkType](https://arktype.io/) offers TypeScript-native syntax for runtime validation:

**npm**

```sh
npm i arktype
```

**yarn**

```sh
yarn add arktype
```

**pnpm**

```sh
pnpm add arktype
```

**bun**

```sh
bun add arktype
```

```ts
import { type } from 'arktype'
import { schemaValidator } from 'acrylblends/schema-validator'

const schema = type({
  name: 'string',
  age: 'number',
})

app.post('/author', schemaValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json({
    success: true,
    message: `${data.name} is ${data.age}`,
  })
})
```
