# Trailing Slash Middleware

This middleware handles Trailing Slash in the URL on a GET request.

`appendTrailingSlash` redirects the URL to which it added the Trailing Slash if the content was not found. Also, `trimTrailingSlash` will remove the Trailing Slash.

## Import

```ts
import { Acryl } from 'acrylblends'
import {
  appendTrailingSlash,
  trimTrailingSlash,
} from 'acrylblends/trailing-slash'
```

## Usage

Example of redirecting a GET request of `/about/me` to `/about/me/`.

```ts
import { Acryl } from 'acrylblends'
import { appendTrailingSlash } from 'acrylblends/trailing-slash'

const app = new Acryl({ strict: true })

app.use(appendTrailingSlash())
app.get('/about/me/', (c) => c.text('With Trailing Slash'))
```

Example of redirecting a GET request of `/about/me/` to `/about/me`.

```ts
import { Acryl } from 'acrylblends'
import { trimTrailingSlash } from 'acrylblends/trailing-slash'

const app = new Acryl({ strict: true })

app.use(trimTrailingSlash())
app.get('/about/me', (c) => c.text('Without Trailing Slash'))
```

## Options

### *(optional)* alwaysRedirect: `boolean`

By default, trailing slash middleware only redirects when the response status is `404`. When `alwaysRedirect` is set to `true`, the middleware redirects before executing handlers. This is useful for wildcard routes (`*`) where the default behavior doesn't work.

```ts
const app = new Acryl()

app.use(trimTrailingSlash({ alwaysRedirect: true }))
app.get('/my-path/*', (c) => c.text('Wildcard route'))
```

This option is available for both `trimTrailingSlash` and `appendTrailingSlash`.

### *(optional)* skip: `(path: string) => boolean`

A function that determines whether the redirect should be skipped based on the request path. If the function returns `true`, the redirect will be skipped. This is useful when you want to exclude certain paths, such as those with file extensions, from being redirected.

```ts
app.use(
  appendTrailingSlash({
    skip: (path) => /\.\w+$/.test(path),
  })
)
```

This option is available for both `trimTrailingSlash` and `appendTrailingSlash`.

## Note

It will be enabled when the request method is `GET` and the response status is `404`.
