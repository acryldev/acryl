# Validation

Validate untrusted input at the route boundary. `schemaValidator` takes any [Standard Schema](https://standardschema.dev): Schemastery
(the schema library Cordis already uses for plugin config), Zod and Valibot all implement it, so a route needs no extra dependency.

## Validate JSON

```ts
import z from '@deepseek-ai/schemastery'
import { App } from 'acryl-router'
import { schemaValidator } from 'acryl-router/helpers'

const NewTodo = z.object({
  title: z.string().required(),
  done: z.boolean().default(false),
})

const app = new App().post('/todos', schemaValidator('json', NewTodo), c => {
  const todo = c.req.valid('json')   // typed by the schema's output
  return c.json({ todo }, 201)
})
```

A validated route has three parts: a schema for one input target, the validator middleware for that target, and a handler that reads
`c.req.valid(target)` instead of the raw body.

## Failures

When the schema reports issues the handler does not run and the answer is 400 with `Content-Type: application/json` and exactly this
shape:

```ts
{ error: `invalid ${target}`, issues: Array<{ message: string, path: string }> }
```

```json
{ "error": "invalid json", "issues": [{ "message": "title must be 1 to 200 characters", "path": "title" }] }
```

- `error` names the target: `invalid json`, `invalid query`, `invalid param`, ...
- There is one entry per issue the schema reported, in its order, with the schema's own `message`.
- `path` is the issue's path joined with dots: `["items", 0, "title"]` becomes `"items.0.title"`, and a path segment given as
  `{ key }` (as Standard Schema allows) contributes its `key`.
- An issue without a path, which a hand-written Standard Schema often reports for a whole-value check, gets `"path": ""`.
  `{ issues: [{ message: 'not allowed' }] }` answers `{ "error": "invalid json", "issues": [{ "message": "not allowed", "path": "" }] }`.
  Give issues a path when a client should point at a field.

### A JSON body without a JSON content type

A `json` target reads the body only when the request's `Content-Type` is JSON (`application/json`, with or without parameters such as
`; charset=utf-8`, or `application/*+json`). Any other content type, or none, is not an error by itself: the schema sees `{}`. So a
client that forgets the header gets a misleading field error for a field it did send:

```sh
curl -X POST -d '{"title":"milk"}' http://127.0.0.1:<port>/todo/api      # no content type: curl sends a form type
# 400 {"error":"invalid json","issues":[{"message":"title must be 1 to 200 characters","path":"title"}]}
```

If you see a field error for a field the request clearly carries, check the request's `Content-Type` first. A route that wants to say so
explicitly can refuse other content types before the validator:

```ts
import type { MiddlewareHandler } from 'acryl-router'

const jsonOnly: MiddlewareHandler = async (c, next) => {
  // The same types the json target reads: application/json and application/*+json, parameters allowed.
  const type = c.req.header('content-type')?.split(';', 1)[0]?.trim() ?? ''
  if (!/^application\/([a-z.-]+\+)?json$/i.test(type)) return c.json({ error: 'content type must be JSON' }, 415)
  await next()
}

app.post('/todos', jsonOnly, schemaValidator('json', NewTodo), createTodo)
```

### A body that is not JSON

A JSON content type with a body that does not parse fails before the schema runs: the answer is 400 with the text body
`Malformed JSON in request body` (a thrown `HTTPException`, so an `onError` handler can reshape it). The `form` target does the same for
a form body that does not parse, with the text `Malformed FormData request.`

Keep the public failure shape consistent across the application and do not leak internals in messages. An application that needs a
different body writes its own check with the core `validator` (below). Valid input is not proof that the caller may use it:
authentication and authorization stay separate checks.

## Targets

| Target | Read from |
| --- | --- |
| `json` | the JSON body |
| `form` | a `multipart/form-data` or `application/x-www-form-urlencoded` body |
| `query` | the query string |
| `param` | route parameters |
| `header` | request headers (names in lowercase) |
| `cookie` | cookies |

Validate only the targets the route uses, and chain one validator per target:

```ts
app.get('/todos/:id', schemaValidator('param', z.object({ id: z.natural() })), schemaValidator('query', Paging), handler)
```

## The core validator

`validator` (also from `acryl-router/helpers`) takes a function instead of a schema. Return the value the handler should see, or a
response to refuse:

```ts
import { validator } from 'acryl-router/helpers'

app.post('/posts', validator('form', (value, c) => {
  const body = value['body']
  if (typeof body !== 'string') return c.text('Invalid!', 400)
  return { body }
}), c => c.json({ body: c.req.valid('form').body }, 201))
```

## Limit the body first

Validation reads the whole body. Put `bodyLimit` in front of a validator on any route open to untrusted callers:

```ts
import { bodyLimit } from 'acryl-router/middleware'

app.post('/todos', bodyLimit({ maxSize: 16 * 1024 }), schemaValidator('json', NewTodo), createTodo)
```

## Typed clients

The validated input types flow into the route types, so the typed `testClient` and `acryl-router/client` check the request a caller sends.
See [Helpers](./helpers.md#testing).

## What not to validate twice

Validate shape at the HTTP boundary, then enforce domain rules in the domain service. The route checks that `title` is a string; the
todo service decides whether that title is allowed.
