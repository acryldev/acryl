# Building with Cordis

Cordis already is the framework. Everything below is plain Cordis, the same code the templates use. Each example is a
complete module; the docs test runs every one of them.

## Plugins and services

A plugin is a function, or an object with `name`, `inject` and `apply`. A plugin offers a capability by providing a
service; another plugin asks for it by name in `inject`.

```js
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()

function greeter(ctx) {
  ctx.provide('greeter', { greet: (who) => `Hello, ${who}!` })
}

const welcome = {
  name: 'welcome',
  inject: ['greeter'],
  apply(ctx) {
    ctx.provide('welcome', ctx.get('greeter').greet('Cordis'))
  },
}

await root.plugin(greeter).await()
await root.plugin(welcome).await()
assert.equal(root.get('welcome'), 'Hello, Cordis!')
```

## `inject` waits for the service

A plugin whose injected service does not exist yet stays pending. It starts the moment the service appears, so the
order you call `plugin` in does not matter.

```js
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
const started = []

root.plugin({ name: 'consumer', inject: ['db'], apply: () => void started.push('consumer') })
assert.deepEqual(started, [])

await root.plugin((ctx) => ctx.provide('db', { query: () => [] })).await()
await new Promise((resolve) => setTimeout(resolve, 0))
assert.deepEqual(started, ['consumer'])
```

Await fibers in dependency order: `fiber.await()` on a fiber that is still pending returns before it has started. The
templates' `plugins/manifest` (`compose`) awaits each fiber after the plugins it injects.

## Effects clean up after the plugin

Anything a plugin acquires goes in `ctx.effect`: the function returns its own disposer, and Cordis calls it when the
plugin is disposed. A disposer returned from `apply` works the same way.

```js
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
const routes = new Set()

const fiber = root.plugin((ctx) => {
  ctx.effect(() => {
    routes.add('GET /')
    return () => routes.delete('GET /')
  })
})
await fiber.await()
assert.deepEqual([...routes], ['GET /'])

await fiber.dispose()
assert.deepEqual([...routes], [])
```

## Events

`ctx.on` subscribes and `ctx.emit` dispatches. A listener belongs to the plugin that added it and is removed with it.

```js
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
const seen = []

const fiber = root.plugin((ctx) => {
  ctx.on('order/placed', (id) => void seen.push(id))
})
await fiber.await()
root.emit('order/placed', 'a1')

await fiber.dispose()
root.emit('order/placed', 'b2')
assert.deepEqual(seen, ['a1'])
```

Cordis also has `parallel`, `serial`, `bail` and `waterfall` dispatch for listeners that return values.

## A scope per task

A plugin can open a child plugin for one piece of work and dispose it when the work ends. Whatever the child provides
or registers is gone afterwards. The agent template runs every question this way, with the step budget held in the
child.

```js
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()
let result

const task = root.plugin({
  name: 'task-1',
  apply(scope) {
    const budget = { steps: 0, limit: 3 }
    scope.provide('budget', budget)
    while (budget.steps < budget.limit) budget.steps += 1
    result = budget.steps
  },
})
await task.await()
await task.dispose()
assert.equal(result, 3)
```

## HTTP without a library

Cordis has no HTTP server, and needs none: Node has one. The templates split HTTP into three plugins. `http` provides a
router service, `routes` adds routes inside `ctx.effect`, and `server` serves the router over `node:http` and closes the
server when it is disposed.

```js
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'

const root = new Context()

function http(ctx) {
  const routes = new Map()
  ctx.provide('http', {
    route(method, path, handler) {
      routes.set(`${method} ${path}`, handler)
      return () => routes.delete(`${method} ${path}`)
    },
    handle: (method, path) => routes.get(`${method} ${path}`)?.() ?? { status: 404, body: { error: 'not found' } },
  })
}

const routes = {
  name: 'routes',
  inject: ['http'],
  apply(ctx) {
    ctx.effect(() => ctx.get('http').route('GET', '/', () => ({ status: 200, body: { ok: true } })))
  },
}

const server = {
  name: 'server',
  inject: ['http'],
  async apply(ctx) {
    const router = ctx.get('http')
    const listener = createServer((request, response) => {
      const { status, body } = router.handle(request.method, request.url)
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    })
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve))
    ctx.provide('url', `http://127.0.0.1:${listener.address().port}`)
    return () => new Promise((resolve) => listener.close(resolve))
  },
}

const fibers = [root.plugin(http), root.plugin(routes), root.plugin(server)]
for (const fiber of fibers) await fiber.await()

const response = await fetch(`${root.get('url')}/`)
assert.deepEqual(await response.json(), { ok: true })

for (const fiber of fibers.reverse()) await fiber.dispose()
```

If an app outgrows this, put a full web framework inside the server plugin. Nothing else changes: routes still come from
the `http` service.

## Testing

Test what a user sees: boot the app on port 0, request a route, stop it. The templates' `test/app.test.ts` does
exactly that, with no mocks of Cordis.

## Further reading

- Cordis: <https://github.com/cordiverse/cordis>
