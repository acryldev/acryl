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

When the schema reports issues the handler does not run and the answer is 400:

```json
{ "error": "invalid json", "issues": [{ "message": "$.title expected string but got 1", "path": "title" }] }
```

Two cases fail before the schema runs:

- A `json` target reads the body only when the request's `Content-Type` is JSON (`application/json` or `application/*+json`). Without it
  the schema sees `{}`, so a required field fails.
- A body that is not valid JSON (or not a valid form) is a 400 `HTTPException`.

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
