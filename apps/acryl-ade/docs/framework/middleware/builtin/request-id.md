# Request ID Middleware

Request ID Middleware generates a unique ID for each request, which you can use in your handlers.

> **Note.** **Node.js**: This middleware uses `crypto.randomUUID()` to generate IDs. The global `crypto` was introduced in Node.js version 20 or later. Therefore, errors may occur in versions earlier than that. In that case, please specify `generator`. However, if you are using the Node.js adapter, it automatically sets `crypto` globally, so this is not necessary.

## Import

```ts
import { Acryl } from 'acrylblends'
import { requestId } from 'acrylblends/request-id'
```

## Usage

You can access the Request ID through the `requestId` variable in the handlers and middleware to which the Request ID Middleware is applied.

```ts
const app = new Acryl()

app.use('*', requestId())

app.get('/', (c) => {
  return c.text(`Your request id is ${c.get('requestId')}`)
})
```

If you want to explicitly specify the type, import `RequestIdVariables` and pass it in the generics of `new Acryl()`.

```ts
import type { RequestIdVariables } from 'acrylblends/request-id'

const app = new Acryl<{
  Variables: RequestIdVariables
}>()
```

### Set Request ID

You set a custom request ID in the header (default: `X-Request-Id`), the middleware will use that value instead of generating a new one:

```ts
const app = new Acryl()

app.use('*', requestId())

app.get('/', (c) => {
  return c.text(`${c.get('requestId')}`)
})

const res = await app.request('/', {
  headers: {
    'X-Request-Id': 'your-custom-id',
  },
})
console.log(await res.text()) // your-custom-id
```

If you want to disable this feature, set [`headerName` option](#headername-string) to an empty string.

## Options

### *(optional)* limitLength: `number`

The maximum length of the request ID. The default is `255`.

### *(optional)* headerName: `string`

The header name used for the request ID. The default is `X-Request-Id`.

### *(optional)* generator: `(c: Context) => string`

The request ID generation function. By default, it uses `crypto.randomUUID()`.

## An ID that came from earlier in the chain

A proxy, a load balancer or the host that starts the app may already put a request id on the request.
Without configuration this middleware is unaware of it and generates a new one, which makes the two logs hard to line up.
Use the `generator` function to read the incoming one and fall back to a fresh id:

```ts
app.use(
  requestId({
    generator: (c) => c.req.header('X-Request-Id') ?? crypto.randomUUID(),
  })
)
```
