# CSRF Protection

This middleware protects against CSRF attacks by checking both the `Origin` header and the `Sec-Fetch-Site` header. The request is allowed if either validation passes.

The middleware only validates requests that:

- Use unsafe HTTP methods (not GET, HEAD, or OPTIONS)
- Have content types that can be sent by HTML forms (`application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`)

Old browsers that do not send `Origin` headers, or environments that use reverse proxies to remove these headers, may not work well. In such environments, use other CSRF token methods.

## Import

```ts
import { Acryl } from 'acrylblends'
import { csrf } from 'acrylblends/csrf'
```

## Usage

```ts
const app = new Acryl()

// Default: both origin and sec-fetch-site validation
app.use(csrf())

// Allow specific origins
app.use(csrf({ origin: 'https://myapp.example.com' }))

// Allow multiple origins
app.use(
  csrf({
    origin: [
      'https://myapp.example.com',
      'https://development.myapp.example.com',
    ],
  })
)

// Allow specific sec-fetch-site values
app.use(csrf({ secFetchSite: 'same-origin' }))
app.use(csrf({ secFetchSite: ['same-origin', 'none'] }))

// Dynamic origin validation
// It is strongly recommended that the protocol be verified to ensure a match to `$`.
// You should *never* do a forward match.
app.use(
  '*',
  csrf({
    origin: (origin) =>
      /https:\/\/(\w+\.)?myapp\.example\.com$/.test(origin),
  })
)

// Dynamic sec-fetch-site validation
app.use(
  csrf({
    secFetchSite: (secFetchSite, c) => {
      // Always allow same-origin
      if (secFetchSite === 'same-origin') return true
      // Allow cross-site for webhook endpoints
      if (
        secFetchSite === 'cross-site' &&
        c.req.path.startsWith('/webhook/')
      ) {
        return true
      }
      return false
    },
  })
)
```

## Options

### *(optional)* origin: `string` | `string[]` | `Function`

Specify allowed origins for CSRF protection.

- **`string`**: Single allowed origin (e.g., `'https://example.com'`)
- **`string[]`**: Array of allowed origins
- **`Function`**: Custom handler `(origin: string, context: Context) => boolean` for flexible origin validation and bypass logic

**Default**: Only same origin as the request URL

The function handler receives the request's `Origin` header value and the request context, allowing for dynamic validation based on request properties like path, headers, or other context data.

### *(optional)* secFetchSite: `string` | `string[]` | `Function`

Specify allowed Sec-Fetch-Site header values for CSRF protection using [Fetch Metadata](https://web.dev/articles/fetch-metadata).

- **`string`**: Single allowed value (e.g., `'same-origin'`)
- **`string[]`**: Array of allowed values (e.g., `['same-origin', 'none']`)
- **`Function`**: Custom handler `(secFetchSite: string, context: Context) => boolean` for flexible validation

**Default**: Only allows `'same-origin'`

Standard Sec-Fetch-Site values:

- `same-origin`: Request from same origin
- `same-site`: Request from same site (different subdomain)
- `cross-site`: Request from different site
- `none`: Request not from a web page (e.g., browser address bar, bookmark)

The function handler receives the request's `Sec-Fetch-Site` header value and the request context, enabling dynamic validation based on request properties.
