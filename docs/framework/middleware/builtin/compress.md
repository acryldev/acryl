# Compress Middleware

This middleware compresses the response body, according to `Accept-Encoding` request header.

> **Note.** Node.js and Bun do not compress a response on their own, so this middleware is what compresses it. A host that already compresses at its edge does not need it.

## Import

```ts
import { Acryl } from 'acrylblends'
import { compress } from 'acrylblends/compress'
```

## Usage

```ts
const app = new Acryl()

app.use(compress())
```

## Options

### *(optional)* encoding: `'gzip'` | `'deflate'`

The compression scheme to allow for response compression. Either `gzip` or `deflate`. If not defined, both are allowed and will be used based on the `Accept-Encoding` header. `gzip` is prioritized if this option is not provided and the client provides both in the `Accept-Encoding` header.

### *(optional)* threshold: `number`

The minimum size in bytes to compress. Defaults to 1024 bytes.

### *(optional)* contentTypeFilter: `RegExp` | `(contentType: string) => boolean`

A `RegExp` or function to determine whether the response should be compressed based on its `Content-Type`. By default, a built-in list of compressible Content-Types is used.

You can pass a `RegExp` to compress only matching Content-Types:

```ts
// Compress only JSON responses
app.use(compress({ contentTypeFilter: /^application\/json/ }))
```

Or pass a function for custom logic. The built-in `COMPRESSIBLE_CONTENT_TYPE_REGEX` is also exported so you can extend the default behavior:

```ts
import {
  compress,
  COMPRESSIBLE_CONTENT_TYPE_REGEX,
} from 'acrylblends/compress'

// Compress the default Content-Types plus a custom one
app.use(
  compress({
    contentTypeFilter: (type) =>
      COMPRESSIBLE_CONTENT_TYPE_REGEX.test(type) ||
      type === 'application/x-myformat',
  })
)
```
