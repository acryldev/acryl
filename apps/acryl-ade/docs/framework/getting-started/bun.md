# Bun

> **Experimental.** Bun is not a verified runtime yet: the Acryl application code is the same, and the Bun adapter (`acrylblends/bun`) is checked on Bun in the framework's release check (a static file, the client address, a WebSocket echo), but the `bun` template and this guide are not covered by the release checks. Node.js is the verified runtime.


[Bun](https://bun.com) is another JavaScript runtime. It's not Node.js. Bun includes a transcompiler, so we can write the code in TypeScript or plain JavaScript.
Acryl also works on Bun.

## 1. Install Bun

To install `bun` command, follow the instruction in [the official web site](https://bun.com).

## 2. Setup

### 2.1. Setup a new project

A starter for Bun is available. Start your project with "bun create" command.
Select `bun` template for this example.

```sh
bun create acrylblends@latest my-app
```

Move into my-app and install the dependencies.

```sh
cd my-app
bun install
```

### 2.2. Setup an existing project

On an existing Bun project, we only need to install `acrylblends` dependencies on the project root directory via

```sh
bun add acrylblends
```

Then add the `dev` command to your existing `package.json`.

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts"
  }
}
```

See the Bun starter template for a minimal example setup. This is the output of running `bun create acrylblends@latest`.

## 3. Hello World

"Hello World" script is below. Almost the same as writing on other platforms.

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Hello Bun!'))

export default app
```

If you are setting up Acryl on an existing project, the `bun run dev` command expects the "Hello World" script to be placed in `src/index.ts`

## 4. Run

Run the command.

```sh
bun run dev
```

Then, access `http://localhost:3000` in your browser.

## Change port number

You can specify the port number with exporting the `port`.

<!-- prettier-ignore -->
```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
app.get('/', (c) => c.text('Hello Bun!'))

export default {
  port: 3000,
  fetch: app.fetch,
}
```

## Serve static files

To serve static files, use `serveStatic` from `acrylblends/bun`.

```ts
import { serveStatic } from 'acrylblends/bun'

const app = new Acryl()

app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))
app.get('/', (c) => c.text('You can access: /static/hello.txt'))
app.get('*', serveStatic({ path: './static/fallback.txt' }))
```

For the above code, it will work well with the following directory structure.

```
./
├── favicon.ico
├── src
└── static
    ├── demo
    │   └── index.html
    ├── fallback.txt
    ├── hello.txt
    └── images
        └── dinotocat.png
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

### `mimes`

You can add MIME types with `mimes`:

```ts
app.get(
  '/static/*',
  serveStatic({
    mimes: {
      m3u8: 'application/vnd.apple.mpegurl',
      ts: 'video/mp2t',
    },
  })
)
```

### `onFound`

You can specify handling when the requested file is found with `onFound`:

```ts
app.get(
  '/static/*',
  serveStatic({
    // ...
    onFound: (_path, c) => {
      c.header('Cache-Control', `public, immutable, max-age=31536000`)
    },
  })
)
```

### `onNotFound`

You can specify handling when the requested file is not found with `onNotFound`:

```ts
app.get(
  '/static/*',
  serveStatic({
    onNotFound: (path, c) => {
      console.log(`${path} is not found, you access ${c.req.path}`)
    },
  })
)
```

### `precompressed`

The `precompressed` option checks if files with extensions like `.br` or `.gz` are available and serves them based on the `Accept-Encoding` header. It prioritizes Brotli, then Zstd, and Gzip. If none are available, it serves the original file.

```ts
app.get(
  '/static/*',
  serveStatic({
    precompressed: true,
  })
)
```

## Testing

You can use `bun:test` for testing on Bun.

```ts
import { describe, expect, it } from 'bun:test'
import app from '.'

describe('My first test', () => {
  it('Should return 200 Response', async () => {
    const req = new Request('http://localhost/')
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
  })
})
```

Then, run the command.

```sh
bun test index.test.ts
```
