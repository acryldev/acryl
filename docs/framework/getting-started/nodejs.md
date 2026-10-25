# Node.js

[Node.js](https://nodejs.org/) is an open-source, cross-platform JavaScript runtime environment.

On Node.js, Acryl runs through the Node.js adapter, `acrylblends/node-server`.

> **Note.** Verified on Node.js 22.19 and newer, which runs TypeScript files directly.

## 1. Setup

A starter for Node.js is available.
Start your project with "create-acrylblends" command.
Select `nodejs` template for this example.

**npm**

```sh
npm create acrylblends@latest my-app
```

**yarn**

```sh
yarn create acrylblends my-app
```

**pnpm**

```sh
pnpm create acrylblends my-app
```

**bun**

```sh
bun create acrylblends@latest my-app
```

Move to `my-app` and install the dependencies.

**npm**

```sh
cd my-app
npm i
```

**yarn**

```sh
cd my-app
yarn
```

**pnpm**

```sh
cd my-app
pnpm i
```

**bun**

```sh
cd my-app
bun i
```

## 2. Hello World

Edit `src/index.ts`:

```ts
import { serve } from 'acrylblends/node-server'
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Hello Node.js!'))

serve(app)
```

`serve()` listens on `127.0.0.1` unless you pass `hostname`, so a development server is reachable from this machine only, not from the rest
of the network. See [Listen on another interface](#listen-on-another-interface).

To shut the server down gracefully, stop taking requests, let the ones in flight finish, and exit after a bounded time, so a connection
that never ends cannot keep the process alive:

```ts
const server = serve(app)

function shutdown(): void {
  server.close(() => process.exit(0))
  // Keep-alive connections with no request in flight would otherwise hold close() open until they time out.
  server.closeIdleConnections()
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
```

`serve(app)` and `serve({ fetch, ... })` return an `http.Server`, which has `closeIdleConnections()`. With `createServer` from
`node:https` the result is an `https.Server`, and with `node:http2` an `Http2Server` or `Http2SecureServer`, which has no such method;
there, `server.close()` waits for the open sessions.

> **Note.** On Node.js, `serve()` wraps the `node:http` module and returns the underlying server instance, so closing it is up to you. Bun serves Fetch handlers natively and manages the server itself, which is why its guide doesn't include this step.

## 3. Run

Run the development server locally. Then, access `http://localhost:3000` in your Web browser.

**npm**

```sh
npm run dev
```

**yarn**

```sh
yarn dev
```

**pnpm**

```sh
pnpm dev
```

## Change port number

You can specify the port number with the `port` option.

```ts
serve({
  fetch: app.fetch,
  port: 8787,
})
```

## Listen on another interface

`serve()` binds `127.0.0.1` when `hostname` is not given. That is right on a developer machine and behind a reverse proxy on the same
host. Inside a container, or when other machines should reach the app directly, bind every interface on purpose:

```ts
serve({
  fetch: app.fetch,
  port: 3000,
  hostname: '0.0.0.0', // or '::' for IPv6 and IPv4
})
```

> **Note.** Many Node servers listen on every interface by default. `serve()` does not, so starting a development server never exposes
> the app to the local network by accident.

## WebSocket

WebSocket support is built into `acrylblends/node-server`. Install `ws` and, if you use TypeScript, `@types/ws`. Then create a `WebSocketServer` with `{ noServer: true }` and pass it to `serve()` with the `websocket` option.

```ts
import { serve, upgradeWebSocket } from 'acrylblends/node-server'
import { Acryl } from 'acrylblends'
import { WebSocketServer } from 'ws'

const app = new Acryl()

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(String(event.data))
    },
  }))
)

const wss = new WebSocketServer({ noServer: true })

serve({
  fetch: app.fetch,
  websocket: { server: wss },
})
```

## Access the raw Node.js APIs

You can access the Node.js APIs from `c.env.incoming` and `c.env.outgoing`.

```ts
import { Acryl } from 'acrylblends'
import { serve, type HttpBindings } from 'acrylblends/node-server'
// or `Http2Bindings` if you use HTTP2

type Bindings = HttpBindings & {
  /* ... */
}

const app = new Acryl<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.json({
    remoteAddress: c.env.incoming.socket.remoteAddress,
  })
})

serve(app)
```

## Serve static files

You can use `serveStatic` to serve static files from the local file system. For example, suppose the directory structure is as follows:

```sh
./
├── favicon.ico
├── index.ts
└── static
    ├── hello.txt
    └── image.png
```

If a request to the path `/static/*` comes in and you want to return a file under `./static`, you can write the following:

```ts
import { serveStatic } from 'acrylblends/node-server'

app.use('/static/*', serveStatic({ root: './' }))
```

**Warning.**

The `root` option resolves paths relative to the current working directory (`process.cwd()`). This means the behavior depends on **where you run your Node.js process from**, not where your source file is located. If you start your server from a different directory, file resolution may fail.

For reliable path resolution that always points to the same directory as your source file, use `import.meta.url`:

```ts
import { fileURLToPath } from 'node:url'
import { serveStatic } from 'acrylblends/node-server'

app.use(
  '/static/*',
  serveStatic({ root: fileURLToPath(new URL('./', import.meta.url)) })
)
```

Use the `path` option to serve `favicon.ico` in the directory root:

```ts
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))
```

If a request to the path `/hello.txt` or `/image.png` comes in and you want to return a file named `./static/hello.txt` or `./static/image.png`, you can use the following:

```ts
app.use('*', serveStatic({ root: './static' }))
```

### `rewriteRequestPath`

If you want to map `http://localhost:3000/static/*` to `./statics`, you can use the `rewriteRequestPath` option:

```ts
app.get(
  '/static/*',
  serveStatic({
    root: './',
    rewriteRequestPath: (path) =>
      path.replace(/^\/static/, '/statics'),
  })
)
```

## http2

You can run acrylblends on a [Node.js http2 Server](https://nodejs.org/api/http2.html).

### unencrypted http2

```ts
import { createServer } from 'node:http2'

const server = serve({
  fetch: app.fetch,
  createServer,
})
```

### encrypted http2

```ts
import { createSecureServer } from 'node:http2'
import { readFileSync } from 'node:fs'

const server = serve({
  fetch: app.fetch,
  createServer: createSecureServer,
  serverOptions: {
    key: readFileSync('localhost-privkey.pem'),
    cert: readFileSync('localhost-cert.pem'),
  },
})
```

## Building & Deployment

**npm**

```sh
npm run build
```

**yarn**

```sh
yarn run build
```

**pnpm**

```sh
pnpm run build
```

**bun**

```sh
bun run build
```

### Dockerfile

Here is an example of a Node.js Dockerfile. A container's published port reaches the app only when it listens on every interface, so
the app reads its hostname from the environment, as the templates do (`hostname: process.env.HOST || '127.0.0.1'`), and the image
sets `HOST=0.0.0.0`.

```Dockerfile
FROM node:22-alpine AS base

FROM base AS builder

RUN apk add --no-cache gcompat
WORKDIR /app

COPY package*json tsconfig.json src ./

RUN npm ci && \
    npm run build && \
    npm prune --production

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 acrylblends

COPY --from=builder --chown=acrylblends:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=acrylblends:nodejs /app/dist /app/dist
COPY --from=builder --chown=acrylblends:nodejs /app/package.json /app/package.json

USER acrylblends
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["node", "/app/dist/index.js"]
```
