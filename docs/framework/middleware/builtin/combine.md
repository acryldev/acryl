# Combine Middleware

Combine Middleware combines multiple middleware functions into a single middleware. It provides three functions:

- `some` - Runs only one of the given middleware.
- `every` - Runs all given middleware.
- `except` - Runs all given middleware only if a condition is not met.

## Import

```ts
import { Acryl } from 'acrylblends'
import { some, every, except } from 'acrylblends/combine'
```

## Usage

Here's an example of complex access control rules using Combine Middleware.

```ts
import { Acryl } from 'acrylblends'
import { bearerAuth } from 'acrylblends/bearer-auth'
import { getConnInfo } from 'acrylblends/node-server'
import { every, some } from 'acrylblends/combine'
import { ipRestriction } from 'acrylblends/ip-restriction'
import { rateLimit } from '@/my-rate-limit'

const app = new Acryl()

app.use(
  '*',
  some(
    every(
      ipRestriction(getConnInfo, { allowList: ['192.168.0.2'] }),
      bearerAuth({ token })
    ),
    // If both conditions are met, rateLimit will not execute.
    rateLimit()
  )
)

app.get('/', (c) => c.text('Hello Acryl!'))
```

### some

Runs the first middleware that returns true. Middleware is applied in order, and if any middleware exits successfully, subsequent middleware will not run.

```ts
import { some } from 'acrylblends/combine'
import { bearerAuth } from 'acrylblends/bearer-auth'
import { myRateLimit } from '@/rate-limit'

// If client has a valid token, skip rate limiting.
// Otherwise, apply rate limiting.
app.use(
  '/api/*',
  some(bearerAuth({ token }), myRateLimit({ limit: 100 }))
)
```

### every

Runs all middleware and stops if any of them fail. Middleware is applied in order, and if any middleware throws an error, subsequent middleware will not run.

```ts
import { some, every } from 'acrylblends/combine'
import { bearerAuth } from 'acrylblends/bearer-auth'
import { myCheckLocalNetwork } from '@/check-local-network'
import { myRateLimit } from '@/rate-limit'

// If client is in local network, skip authentication and rate limiting.
// Otherwise, apply authentication and rate limiting.
app.use(
  '/api/*',
  some(
    myCheckLocalNetwork(),
    every(bearerAuth({ token }), myRateLimit({ limit: 100 }))
  )
)
```

### except

Runs all middleware except when the condition is met. You can pass a string or function as the condition. If multiple targets need to be matched, pass them as an array.

```ts
import { except } from 'acrylblends/combine'
import { bearerAuth } from 'acrylblends/bearer-auth'

// If client is accessing public API, skip authentication.
// Otherwise, require a valid token.
app.use('/api/*', except('/api/public/*', bearerAuth({ token })))
```
