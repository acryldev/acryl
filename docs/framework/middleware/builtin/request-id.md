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

## Platform specific Request IDs

Some platform (such as AWS Lambda) already generate their own Request IDs per request.
Without any additional configuration, this middleware is unaware of these specific Request IDs
and generates a new Request ID. This can lead to confusion when looking at your application logs.

To unify these IDs, use the `generator` function to capture the platform specific Request ID and to use it in this middleware.

### Platform specific links

- AWS Lambda
  - [AWS documentation: Context object](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html)
  - Acryl: Access AWS Lambda Object
- Cloudflare
  - [Cloudflare Ray ID
    ](https://developers.cloudflare.com/fundamentals/reference/cloudflare-ray-id/)
- Deno
  - [Request ID on the Deno Blog](https://deno.com/blog/zero-config-debugging-deno-opentelemetry#:~:text=s%20automatically%20have-,unique%20request%20IDs,-associated%20with%20them)
- Fastly
  - [Fastly documentation: req.xid](https://www.fastly.com/documentation/reference/vcl/variables/client-request/req-xid/)
