# Deno

[Deno](https://deno.com/) is a JavaScript runtime built on V8. It's not Node.js.
Acryl also works on Deno.

You can use Acryl, write the code with TypeScript, and run the application with the `deno` command.

## 1. Install Deno

First, install `deno` command.
Please refer to [the official document](https://docs.deno.com/runtime/getting_started/installation/).

## 2. Setup

A starter for Deno is available.
Start your project with the [`deno init`](https://docs.deno.com/runtime/reference/cli/init/) command.

```sh
deno init --npm acrylblends --template=deno my-app
```

Move into `my-app`. For Deno, you don't have to install Acryl explicitly.

```sh
cd my-app
```

## 3. Hello World

Edit `main.ts`:

**main.ts**

```ts
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.get('/', (c) => c.text('Hello Deno!'))

Deno.serve(app.fetch)
```

## 4. Run

Run the development server locally. Then, access `http://localhost:8000` in your Web browser.

```sh
deno task start
```

## Change port number

You can specify the port number by updating the arguments of `Deno.serve` in `main.ts`:

```ts
Deno.serve({ port: 8787 }, app.fetch)
```

## Serve static files

To serve static files, use `serveStatic` from `acrylblends/deno`.

> **Not yet available.** The Deno adapter, `acrylblends/deno`, is not part of acrylblends yet. The code below shows the planned usage.

```ts
import { Acryl } from 'acrylblends'
import { serveStatic } from 'acrylblends/deno'

const app = new Acryl()

app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))
app.get('/', (c) => c.text('You can access: /static/hello.txt'))
app.get('*', serveStatic({ path: './static/fallback.txt' }))

Deno.serve(app.fetch)
```

For the above code, it will work well with the following directory structure.

```
./
├── favicon.ico
├── index.ts
└── static
    ├── demo
    │   └── index.html
    ├── fallback.txt
    ├── hello.txt
    └── images
        └── dinotocat.png
```

### `rewriteRequestPath`

If you want to map `http://localhost:8000/static/*` to `./statics`, you can use the `rewriteRequestPath` option:

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

Testing the application on Deno is easy.
You can write with `Deno.test` and use `assert` or `assertEquals` from [@std/assert](https://jsr.io/@std/assert).

```sh
deno add jsr:@std/assert
```

**hello.ts**

```ts
import { Acryl } from 'acrylblends'
import { assertEquals } from '@std/assert'

Deno.test('Hello World', async () => {
  const app = new Acryl()
  app.get('/', (c) => c.text('Please test me'))

  const res = await app.request('http://localhost/')
  assertEquals(res.status, 200)
})
```

Then run the command:

```sh
deno test hello.ts
```

## npm

Acryl is published on [npm](https://www.npmjs.com/package/acrylblends). Map it in your `deno.json`:

```json
{
  "imports": {
    "acrylblends": "npm:acrylblends"
  }
}
```

To import the middleware and helpers (`acrylblends/cors`, `acrylblends/jwt` and the rest) map the subpaths as well, with the directory form of the import map:

```json
{
  "imports": {
    "acrylblends": "npm:acrylblends",
    "acrylblends/": "npm:/acrylblends/"
  }
}
```

Acryl is not published on JSR.
