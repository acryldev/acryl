# CORS Middleware

A web API is often called from a page served by another origin. For that we have to implement CORS, and this middleware does it.

## Import

```ts
import { Acryl } from 'acrylblends'
import { cors } from 'acrylblends/cors'
```

## Usage

```ts
const app = new Acryl()

// CORS should be called before the route
app.use('/api/*', cors())
app.use(
  '/api2/*',
  cors({
    origin: 'http://example.com',
    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
    credentials: true,
  })
)

app.all('/api/abc', (c) => {
  return c.json({ success: true })
})
app.all('/api2/abc', (c) => {
  return c.json({ success: true })
})
```

Multiple origins:

```ts
app.use(
  '/api3/*',
  cors({
    origin: ['https://example.com', 'https://example.org'],
  })
)

// Or you can use "function"
app.use(
  '/api4/*',
  cors({
    // `c` is a `Context` object
    origin: (origin, c) => {
      return origin.endsWith('.example.com')
        ? origin
        : 'http://example.com'
    },
  })
)
```

Dynamic allowed methods based on origin:

```ts
app.use(
  '/api5/*',
  cors({
    origin: (origin) =>
      origin === 'https://example.com' ? origin : '*',
    // `c` is a `Context` object
    allowMethods: (origin, c) =>
      origin === 'https://example.com'
        ? ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']
        : ['GET', 'HEAD'],
  })
)
```

## Options

### *(optional)* origin: `string` | `string[]` | `(origin:string, c:Context) => string`

The value of "_Access-Control-Allow-Origin_" CORS header. You can also pass the callback function like `origin: (origin) => (origin.endsWith('.example.com') ? origin : 'http://example.com')`. The default is `*`.

### *(optional)* allowMethods: `string[]` | `(origin:string, c:Context) => string[]`

The value of "_Access-Control-Allow-Methods_" CORS header. You can also pass a callback function to dynamically determine allowed methods based on the origin. The default is `['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'QUERY']`.

### *(optional)* allowHeaders: `string[]`

The value of "_Access-Control-Allow-Headers_" CORS header. The default is `[]`.

### *(optional)* maxAge: `number`

The value of "_Access-Control-Max-Age_" CORS header.

### *(optional)* credentials: `boolean`

The value of "_Access-Control-Allow-Credentials_" CORS header.

### *(optional)* exposeHeaders: `string[]`

The value of "_Access-Control-Expose-Headers_" CORS header. The default is `[]`.

## Environment-dependent CORS configuration

If you want to adjust CORS configuration according to the execution environment, such as development or production, injecting values from environment variables is convenient as it eliminates the need for the application to be aware of its own execution environment. See the example below for clarification.

```ts
app.use('*', async (c, next) => {
  const corsMiddlewareHandler = cors({
    origin: c.env.CORS_ORIGIN,
  })
  return corsMiddlewareHandler(c, next)
})
```

## Using with Vite

When using Acryl with Vite, you should disable Vite's built-in CORS feature by setting `server.cors` to `false` in your `vite.config.ts`. This prevents conflicts with Acryl's CORS middleware.

```ts
// vite.config.ts
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    cors: false, // disable Vite's built-in CORS setting
  },
  plugins: [cloudflare()],
})
```
