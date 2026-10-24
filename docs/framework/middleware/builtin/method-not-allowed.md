# Method Not Allowed Middleware

The Method Not Allowed middleware returns a `405 Method Not Allowed` response with an `Allow` header when the request path matches a registered route but the request method is not supported. Without this middleware, Acryl returns a `404 Not Found` in that case.

## Import

```ts
import { Acryl } from 'acrylblends'
import { methodNotAllowed } from 'acrylblends/method-not-allowed'
```

## Usage

```ts
const app = new Acryl()

app.use(methodNotAllowed({ app }))

app.get('/hello', (c) => c.text('Hello!'))
app.post('/hello', (c) => c.text('Posted!'))

// PUT /hello -> 405 Method Not Allowed
// Allow: GET, HEAD, POST
```

You can customize the response with the `onMethodNotAllowed` option:

```ts
app.use(
  methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) =>
      c.json({ error: 'Method Not Allowed' }, 405, {
        Allow: methods.join(', '),
      }),
  })
)
```

## Options

### **(required)** app: `Acryl`

The Acryl instance used by the application. The middleware collects the allowed methods for each path from its registered routes.

### *(optional)* onMethodNotAllowed: `(c: Context, allowedMethods: string[]) => Response | Promise<Response>`

Generates the response, including its `Allow` header. By default, the middleware returns a `405 Method Not Allowed` response with the `Allow` header set to the allowed methods.
