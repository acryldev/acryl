# Body Limit Middleware

The Body Limit Middleware can limit the file size of the request body.

This middleware first uses the value of the `Content-Length` header in the request, if present.
If it is not set, it reads the body in the stream and executes an error handler if it is larger than the specified file size.

## Import

```ts
import { Acryl } from 'acrylblends'
import { bodyLimit } from 'acrylblends/body-limit'
```

## Usage

```ts
const app = new Acryl()

app.post(
  '/upload',
  bodyLimit({
    maxSize: 50 * 1024, // 50kb
    onError: (c) => {
      return c.text('overflow :(', 413)
    },
  }),
  async (c) => {
    const body = await c.req.parseBody()
    if (body['file'] instanceof File) {
      console.log(`Got file sized: ${body['file'].size}`)
    }
    return c.text('pass :)')
  }
)
```

## Options

### **(required)** maxSize: `number`

The maximum file size of the file you want to limit. The default is `100 * 1024` - `100kb`.

### *(optional)* onError: `OnError`

The error handler to be invoked if the specified file size is exceeded.

## Usage with Bun for large requests

If the Body Limit Middleware is used explicitly to allow a request body larger than the default, it might be necessary to make changes to your `Bun.serve` configuration accordingly. [At the time of writing](https://github.com/oven-sh/bun/blob/f2cfa15e4ef9d730fc6842ad8b79fb7ab4c71cb9/packages/bun-types/bun.d.ts#L2191), `Bun.serve`'s default request body limit is 128MiB. If you set Acryl's Body Limit Middleware to a value bigger than that, your requests will still fail and, additionally, the `onError` handler specified in the middleware will not be called. This is because `Bun.serve()` will set the status code to `413` and terminate the connection before passing the request to Acryl.

If you want to accept requests larger than 128MiB with Acryl and Bun, you need to set the limit for Bun as well:

```ts
export default {
  port: process.env['PORT'] || 3000,
  fetch: app.fetch,
  maxRequestBodySize: 1024 * 1024 * 200, // your value here
}
```

or, depending on your setup:

```ts
Bun.serve({
  fetch(req, server) {
    return app.fetch(req, { ip: server.requestIP(req) })
  },
  maxRequestBodySize: 1024 * 1024 * 200, // your value here
})
```
