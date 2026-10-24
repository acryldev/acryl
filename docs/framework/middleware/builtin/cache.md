# Cache Middleware

> **Not yet available.** The cache middleware (`acrylblends/cache`) is documented here so the page structure matches the rest of the framework, and is not part of acrylblends yet. The code on this page is not checked by the docs tests.


The Cache middleware uses the Web Standards' [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache).

The Cache middleware currently supports Cloudflare Workers projects using custom domains and Deno projects using [Deno 1.26+](https://github.com/denoland/deno/releases/tag/v1.26.0). Also available with Deno Deploy.

Cloudflare Workers respects the `Cache-Control` header and return cached responses. For details, refer to [Cache on Cloudflare Docs](https://developers.cloudflare.com/workers/runtime-apis/cache/). Deno does not respect headers, so if you need to update the cache, you will need to implement your own mechanism.

See [Usage](#usage) below for instructions on each platform.

## Import

```ts
import { Acryl } from 'acrylblends'
import { cache } from 'acrylblends/cache'
```

## Usage

**Cloudflare Workers**

```ts
app.get(
  '*',
  cache({
    cacheName: 'my-app',
    cacheControl: 'max-age=3600',
  })
)
```

**Deno**

```ts
// Must use `wait: true` for the Deno runtime
app.get(
  '*',
  cache({
    cacheName: 'my-app',
    cacheControl: 'max-age=3600',
    wait: true,
  })
)
```

## Caching QUERY requests

The Cache middleware also caches responses to [QUERY](https://www.rfc-editor.org/rfc/rfc10008.html) requests. As required by RFC 10008, the cache key for a QUERY request incorporates a digest of the request content and its representation metadata, so requests with different bodies are cached separately.

QUERY requests with a body larger than `maxQueryBodySize` (64 KiB by default) bypass the cache.

> **Note.** To support this, cached entries are stored under an internal key, so they do not collide with your own requests.

## Options

### **(required)** cacheName: `string` | `(c: Context) => string` | `Promise<string>`

The name of the cache. Can be used to store multiple caches with different identifiers.

### *(optional)* wait: `boolean`

A boolean indicating if Acryl should wait for the Promise of the `cache.put` function to resolve before continuing with the request. _Required to be true for the Deno environment_. The default is `false`.

### *(optional)* cacheControl: `string`

A string of directives for the `Cache-Control` header. See the [MDN docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) for more information. When this option is not provided, no `Cache-Control` header is added to requests.

### *(optional)* vary: `string` | `string[]`

Sets the `Vary` header in the response. If the original response header already contains a `Vary` header, the values are merged, removing any duplicates. Setting this to `*` will result in an error. For more details on the Vary header and its implications for caching strategies, refer to the [MDN docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary).

### *(optional)* keyGenerator: `(c: Context) => string | Promise<string>`

Generates keys for every request in the `cacheName` store. This can be used to cache data based on request parameters or context parameters. The default is `c.req.url`. For QUERY requests, the key additionally includes a digest of the request content and its representation metadata.

### *(optional)* maxQueryBodySize: `number`

The maximum QUERY request body size in bytes that can be cached. QUERY requests with a larger body bypass the cache. The default is `65536` (64 KiB).

### *(optional)* cacheableStatusCodes: `number[]`

An array of status codes that should be cached. The default is `[200]`. Use this option to cache responses with specific status codes.

```ts
app.get(
  '*',
  cache({
    cacheName: 'my-app',
    cacheControl: 'max-age=3600',
    cacheableStatusCodes: [200, 404, 412],
  })
)
```

### *(optional)* onCacheNotAvailable: `((reason: string) => void | Promise<void>)` | `false`

A callback function or `false` that controls the behavior when the Cache API is not available in the global scope, or when QUERY caching cannot use Web Crypto. The callback is invoked with the reason. By default, the reason is logged with `console.log`. You can provide a custom function to customize the behavior, or set it to `false` to suppress the log entirely.

```ts
// Custom logging
app.use(
  cache({
    cacheName: 'my-app-v1',
    onCacheNotAvailable: () => {
      console.log('Custom log: Cache API is not available.')
    },
  })
)
```

```ts
// Suppress logging
app.use(
  cache({
    cacheName: 'my-app-v1',
    onCacheNotAvailable: false,
  })
)
```
