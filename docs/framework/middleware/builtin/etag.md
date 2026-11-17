# ETag Middleware

Using this middleware, you can add ETag headers easily.

## Import

```ts
import { Acryl } from 'acrylblends'
import { etag } from 'acrylblends/etag'
```

## Usage

```ts
const app = new Acryl()

app.use('/etag/*', etag())
app.get('/etag/abc', (c) => {
  return c.text('Acryl is cool')
})
```

## The retained headers

The 304 Response must include the headers that would have been sent in an equivalent 200 OK response. The default headers are Cache-Control, Content-Location, Date, ETag, Expires, and Vary.

If you want to add the header that is sent, you can use `retainedHeaders` option and `RETAINED_304_HEADERS` strings array variable that includes the default headers:

```ts
import { etag, RETAINED_304_HEADERS } from 'acrylblends/etag'

// ...

app.use(
  '/etag/*',
  etag({
    retainedHeaders: ['x-message', ...RETAINED_304_HEADERS],
  })
)
```

## Options

### *(optional)* weak: `boolean`

Define using or not using a [weak validation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests#weak_validation). If `true` is set, then `w/` is added to the prefix of the value. The default is `false`.

### *(optional)* retainedHeaders: `string[]`

The headers that you want to retain in the 304 Response.

### *(optional)* generateDigest: `(body: Uint8Array) => ArrayBuffer | Promise<ArrayBuffer>`

A custom digest generation function. By default, it uses `SHA-1`. This function is called with the response body as a `Uint8Array` and should return a hash as an `ArrayBuffer` or a Promise of one.
