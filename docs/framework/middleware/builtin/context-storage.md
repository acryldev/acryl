# Context Storage Middleware

The Context Storage Middleware stores the Acryl `Context` in the `AsyncLocalStorage`, to make it globally accessible.

> **Note.** This middleware uses `AsyncLocalStorage`. Node.js, the verified runtime, provides it; a host that embeds an app in a runtime without it cannot use this middleware.

## Import

```ts
import { Acryl } from 'acrylblends'
import {
  contextStorage,
  getContext,
  tryGetContext,
} from 'acrylblends/context-storage'
```

## Usage

The `getContext()` will return the current Context object if the `contextStorage()` is applied as a middleware.

```ts
type Env = {
  Variables: {
    message: string
  }
}

const app = new Acryl<Env>()

app.use(contextStorage())

app.use(async (c, next) => {
  c.set('message', 'Hello!')
  await next()
})

// You can access the variable outside the handler.
const getMessage = () => {
  return getContext<Env>().var.message
}

app.get('/', (c) => {
  return c.text(getMessage())
})
```

Anything a handler puts on the context can be read further down the call stack, without passing `c` through every function:

```ts
const app = new Acryl()

app.use(contextStorage())
app.use(async (c, next) => {
  c.set('user', 'ada')
  await next()
})

app.get('/', (c) => c.text(`Hello ${getUser()}`))

const getUser = () => getContext().get('user')
```

## tryGetContext

`tryGetContext()` works like `getContext()`, but returns `undefined` instead of throwing an error when the context is not available:

```ts
const context = tryGetContext<Env>()
if (context) {
  // Context is available
  console.log(context.var.message)
}
```
