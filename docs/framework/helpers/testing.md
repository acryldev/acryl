# Testing Helper

The Testing Helper provides functions to make testing of Acryl applications easier.

## Import

```ts
import { Acryl } from 'acrylblends'
import { testClient } from 'acrylblends/testing'
```

## `testClient()`

The `testClient()` function takes an instance of Acryl as its first argument and returns an object typed according to your Acryl application's routes, similar to the [Acryl Client](../guides/rpc.md#client). This allows you to call your defined routes in a type-safe manner with editor autocompletion within your tests.

**Important Note on Type Inference:**

For the `testClient` to correctly infer the types of your routes and provide autocompletion, **you must define your routes using chained methods directly on the `Acryl` instance**.

The type inference relies on the type flowing through the chained `.get()`, `.post()`, etc., calls. If you define routes separately after creating the Acryl instance (like the common pattern shown in the "Hello World" example: `const app = new Acryl(); app.get(...)`), the `testClient` will not have the necessary type information for specific routes, and you won't get the type-safe client features.

**Example:**

This example works because the `.get()` method is chained directly onto the `new Acryl()` call:

```ts
// index.ts
const app = new Acryl().get('/search', (c) => {
  const query = c.req.query('q')
  return c.json({ query: query, results: ['result1', 'result2'] })
})

export default app
```

```ts
// index.test.ts
import { Acryl } from 'acrylblends'
import { testClient } from 'acrylblends/testing'
import { describe, it, expect } from 'vitest' // Or your preferred test runner
import app from './app'

describe('Search Endpoint', () => {
  // Create the test client from the app instance
  const client = testClient(app)

  it('should return search results', async () => {
    // Call the endpoint using the typed client
    // Notice the type safety for query parameters (if defined in the route)
    // and the direct access via .$get()
    const res = await client.search.$get({
      query: { q: 'acrylblends' },
    })

    // Assertions
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      query: 'acrylblends',
      results: ['result1', 'result2'],
    })
  })
})
```

To include headers in your test, pass them as the second parameter in the call. The second parameter can also take an `init` property as a `RequestInit` object, allowing you to set headers, method, body, etc. Learn more about the `init` property [here](../guides/rpc.md#init-option).

```ts
// index.test.ts
import { Acryl } from 'acrylblends'
import { testClient } from 'acrylblends/testing'
import { describe, it, expect } from 'vitest' // Or your preferred test runner
import app from './app'

describe('Search Endpoint', () => {
  // Create the test client from the app instance
  const client = testClient(app)

  it('should return search results', async () => {
    // Include the token in the headers and set the content type
    const token = 'this-is-a-very-clean-token'
    const res = await client.search.$get(
      {
        query: { q: 'acrylblends' },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `application/json`,
        },
      }
    )

    // Assertions
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      query: 'acrylblends',
      results: ['result1', 'result2'],
    })
  })
})
```
