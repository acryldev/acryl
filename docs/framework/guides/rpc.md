# RPC

The RPC feature allows sharing of the API specifications between the server and the client.

First, export the `typeof` your Acryl app (commonly called `AppType`) - or just the routes you want available to the client - from your server code.

By accepting `AppType` as a generic parameter, the Acryl Client can infer both the input type(s) specified by the Validator, and the output type(s) emitted by handlers returning `c.json()`.

> [!NOTE]
> For the RPC types to work properly in a monorepo, in both the Client's and Server's tsconfig.json files, set `"strict": true` in `compilerOptions`. Read more.

## Server

All you need to do on the server side is to write a validator and create a variable `route`. The following example uses Zod Validator.

```ts
const route = app.post(
  '/posts',
  schemaValidator(
    'form',
    z.object({
      title: z.string(),
      body: z.string(),
    })
  ),
  (c) => {
    // ...
    return c.json(
      {
        ok: true,
        message: 'Created!',
      },
      201
    )
  }
)
```

> [!TIP]
> The Standard Schema Validator works as well, so you can use any Standard Schema library such as Valibot.

Then, export the type to share the API spec with the Client.

```ts
export type AppType = typeof route
```

## Client

On the Client side, import `hc` and `AppType` first.

```ts
import type { AppType } from '.'
import { hc } from 'acrylblends/client'
```

`hc` is a function to create a client. Pass `AppType` as Generics and specify the server URL as an argument.

```ts
const client = hc<AppType>('http://localhost:8787/')
```

Call `client.{path}.{method}` and pass the data you wish to send to the server as an argument.

```ts
const res = await client.posts.$post({
  form: {
    title: 'Hello',
    body: 'Acryl is a cool project',
  },
})
```

The `res` is compatible with the "fetch" Response. You can retrieve data from the server with `res.json()`.

```ts
if (res.ok) {
  const data = await res.json()
  console.log(data.message)
}
```

### Cookies

To make the client send cookies with every request, add `{ 'init': { 'credentials": 'include' } }` to the options when you're creating the client.

```ts
// client.ts
const client = hc<AppType>('http://localhost:8787/', {
  init: {
    credentials: 'include',
  },
})

// This request will now include any cookies you might have set
const res = await client.posts.$get({
  query: {
    id: '123',
  },
})
```

## Status code

If you explicitly specify the status code, such as `200` or `404`, in `c.json()`, it will be added as a type for passing to the client.

```ts
// server.ts
const app = new Acryl().get(
  '/posts',
  schemaValidator(
    'query',
    z.object({
      id: z.string(),
    })
  ),
  async (c) => {
    const { id } = c.req.valid('query')
    const post: Post | undefined = await getPost(id)

    if (post === undefined) {
      return c.json({ error: 'not found' }, 404) // Specify 404
    }

    return c.json({ post }, 200) // Specify 200
  }
)

export type AppType = typeof app
```

You can get the data by the status code.

```ts
// client.ts
const client = hc<AppType>('http://localhost:8787/')

const res = await client.posts.$get({
  query: {
    id: '123',
  },
})

if (res.status === 404) {
  const data: { error: string } = await res.json()
  console.log(data.error)
}

if (res.ok) {
  const data: { post: Post } = await res.json()
  console.log(data.post)
}

// { post: Post } | { error: string }
type ResponseType = InferResponseType<typeof client.posts.$get>

// { post: Post }
type ResponseType200 = InferResponseType<
  typeof client.posts.$get,
  200
>
```

## Global Response

Acryl RPC client doesn't automatically infer response types from global error handlers like `app.onError()` or global middleware. You can use the `ApplyGlobalResponse` type helper to merge global error response types into all routes.

```ts
import type { ApplyGlobalResponse } from 'acrylblends/client'

const app = new Acryl()
  .get('/api/users', (c) => c.json({ users: ['alice', 'bob'] }, 200))
  .onError((err, c) => c.json({ error: err.message }, 500))

type AppWithErrors = ApplyGlobalResponse<
  typeof app,
  {
    500: { json: { error: string } }
  }
>

const client = hc<AppWithErrors>('http://localhost')
```

Now the client knows about both success and error responses:

```ts
const res = await client.api.users.$get()

if (res.ok) {
  const data = await res.json() // { users: string[] }
}

// InferResponseType includes the global error type
type ResType = InferResponseType<typeof client.api.users.$get>
// { users: string[] } | { error: string }
```

You can also define multiple global error status codes at once:

```ts
type AppWithErrors = ApplyGlobalResponse<
  typeof app,
  {
    401: { json: { error: string; message: string } }
    500: { json: { error: string; message: string } }
  }
>
```

## Not Found

If you want to use a client, you should not use `c.notFound()` for the Not Found response. The data that the client gets from the server cannot be inferred correctly.

```ts
// server.ts
export const routes = new Acryl().get(
  '/posts',
  schemaValidator(
    'query',
    z.object({
      id: z.string(),
    })
  ),
  async (c) => {
    const { id } = c.req.valid('query')
    const post: Post | undefined = await getPost(id)

    if (post === undefined) {
      return c.notFound() // ❌️
    }

    return c.json({ post })
  }
)

// client.ts
import { hc } from 'acrylblends/client'

const client = hc<typeof routes>('/')

const res = await client.posts[':id'].$get({
  param: {
    id: '123',
  },
})

const data = await res.json() // 🙁 data is unknown
```

Please use `c.json()` and specify the status code for the Not Found Response.

```ts
export const routes = new Acryl().get(
  '/posts',
  schemaValidator(
    'query',
    z.object({
      id: z.string(),
    })
  ),
  async (c) => {
    const { id } = c.req.valid('query')
    const post = await getPost(id)

    if (!post) {
      return c.json({ error: 'not found' }, 404) // Specify 404
    }

    return c.json({ post }, 200) // Specify 200
  }
)
```

Alternatively, you can use module augmentation to extend `NotFoundResponse` interface. This allows `c.notFound()` to return a typed response:

```ts
// server.ts
import { Acryl, TypedResponse } from 'acrylblends'

declare module 'acrylblends' {
  interface NotFoundResponse
    extends Response,
      TypedResponse<{ error: string }, 404, 'json'> {}
}

const app = new Acryl()
  .get('/posts/:id', async (c) => {
    const post = await getPost(c.req.param('id'))
    if (!post) {
      return c.notFound()
    }
    return c.json({ post }, 200)
  })
  .notFound((c) => c.json({ error: 'not found' }, 404))

export type AppType = typeof app
```

Now the client can correctly infer the 404 response type.

## Path parameters

You can also handle routes that include path parameters or query values.

```ts
const route = app.get(
  '/posts/:id',
  schemaValidator(
    'query',
    z.object({
      page: z.coerce.number().optional(), // coerce to convert to number
    })
  ),
  (c) => {
    // ...
    return c.json({
      title: 'Night',
      body: 'Time to sleep',
    })
  }
)
```

Both path parameters and query values **must** be passed as `string`, even if the underlying value is of a different type.

Specify the string you want to include in the path with `param`, and any query values with `query`.

```ts
const res = await client.posts[':id'].$get({
  param: {
    id: '123',
  },
  query: {
    page: '1', // `string`, converted by the validator to `number`
  },
})
```

### Multiple parameters

Handle routes with multiple parameters.

```ts
const route = app.get(
  '/posts/:postId/:authorId',
  schemaValidator(
    'query',
    z.object({
      page: z.string().optional(),
    })
  ),
  (c) => {
    // ...
    return c.json({
      title: 'Night',
      body: 'Time to sleep',
    })
  }
)
```

Add multiple `['']` to specify params in path.

```ts
const res = await client.posts[':postId'][':authorId'].$get({
  param: {
    postId: '123',
    authorId: '456',
  },
  query: {},
})
```

### Include slashes

`hc` function does not URL-encode the values of `param`. To include slashes in parameters, use [regular expressions](../api/routing.md#regexp).

```ts
// client.ts

// Requests /posts/123/456
const res = await client.posts[':id'].$get({
  param: {
    id: '123/456',
  },
})

// server.ts
const route = app.get(
  '/posts/:id{.+}',
  schemaValidator(
    'param',
    z.object({
      id: z.string(),
    })
  ),
  (c) => {
    // id: 123/456
    const { id } = c.req.valid('param')
    // ...
  }
)
```

> [!NOTE]
> Basic path parameters without regular expressions do not match slashes. If you pass a `param` containing slashes using the hc function, the server might not route as intended. Encoding the parameters using `encodeURIComponent` is the recommended approach to ensure correct routing.

## Headers

You can append the headers to the request.

```ts
const res = await client.search.$get(
  {
    //...
  },
  {
    headers: {
      'X-Custom-Header': 'Here is Acryl Client',
      'X-User-Agent': 'hc',
    },
  }
)
```

To add a common header to all requests, specify it as an argument to the `hc` function.

```ts
const client = hc<AppType>('/api', {
  headers: {
    Authorization: 'Bearer TOKEN',
  },
})
```

## `init` option

You can pass the fetch's `RequestInit` object to the request as the `init` option. Below is an example of aborting a Request.

```ts no-check
import { hc } from 'acrylblends/client'

const client = hc<AppType>('http://localhost:8787/')

const abortController = new AbortController()
const res = await client.api.posts.$post(
  {
    json: {
      // Request body
    },
  },
  {
    // RequestInit object
    init: {
      signal: abortController.signal,
    },
  }
)

// ...

abortController.abort()
```

> **Note.** A `RequestInit` object defined by `init` takes the highest priority. It could be used to overwrite things set by other options like `body | method | headers`.

## `$url()`

You can get a `URL` object for accessing the endpoint by using `$url()`.

**Warning.**

You have to pass in an absolute URL for this to work. Passing in a relative URL `/` will result in the following error.

`Uncaught TypeError: Failed to construct 'URL': Invalid URL`

```ts
// ❌ Will throw error
const client = hc<AppType>('/')
client.api.post.$url()

// ✅ Will work as expected
const client = hc<AppType>('http://localhost:8787/')
client.api.post.$url()
```

```ts
const route = app
  .get('/api/posts', (c) => c.json({ posts }))
  .get('/api/posts/:id', (c) => c.json({ post }))

const client = hc<typeof route>('http://localhost:8787/')

let url = client.api.posts.$url()
console.log(url.pathname) // `/api/posts`

url = client.api.posts[':id'].$url({
  param: {
    id: '123',
  },
})
console.log(url.pathname) // `/api/posts/123`
```

### Typed URL

You can pass the base URL as the second type parameter to `hc` to get more precise URL types:

```ts
const client = hc<typeof route, 'http://localhost:8787'>(
  'http://localhost:8787/'
)

const url = client.api.posts.$url()
// url is TypedURL with precise type information
// including protocol, host, and path
```

This is useful when you want to use the URL as a type-safe key for libraries like SWR.

## `$path()`

`$path()` is similar to `$url()`, but returns a path string instead of a `URL` object. Unlike `$url()`, it does not include the base URL origin, so it works regardless of the base URL you pass to `hc`.

```ts
const route = app
  .get('/api/posts', (c) => c.json({ posts }))
  .get('/api/posts/:id', (c) => c.json({ post }))

const client = hc<typeof route>('http://localhost:8787/')

let path = client.api.posts.$path()
console.log(path) // `/api/posts`

path = client.api.posts[':id'].$path({
  param: {
    id: '123',
  },
})
console.log(path) // `/api/posts/123`
```

You can also pass query parameters:

```ts
const path = client.api.posts.$path({
  query: {
    page: '1',
    limit: '10',
  },
})
console.log(path) // `/api/posts?page=1&limit=10`
```

## File Uploads

You can upload files using a form body:

```ts
// client
const res = await client.user.picture.$put({
  form: {
    file: new File([fileToUpload], filename, {
      type: fileToUpload.type,
    }),
  },
})
```

```ts
// server
const route = app.put(
  '/user/picture',
  schemaValidator(
    'form',
    z.object({
      file: z.instanceof(File),
    })
  )
  // ...
)
```

## Custom `fetch` method

You can set the custom `fetch` method.

In the following example script for Cloudflare Worker, the Service Bindings' `fetch` method is used instead of the default `fetch`.

```toml
# wrangler.toml
services = [
  { binding = "AUTH", service = "auth-service" },
]
```

```ts
// src/client.ts
const client = hc<CreateProfileType>('http://localhost', {
  fetch: c.env.AUTH.fetch.bind(c.env.AUTH),
})
```

## Custom query serializer

You can customize how query parameters are serialized using the `buildSearchParams` option. This is useful when you need bracket notation for arrays or other custom formats:

```ts
const client = hc<AppType>('http://localhost', {
  buildSearchParams: (query) => {
    const searchParams = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) {
        continue
      }
      if (Array.isArray(v)) {
        v.forEach((item) => searchParams.append(`${k}[]`, item))
      } else {
        searchParams.set(k, v)
      }
    }
    return searchParams
  },
})
```

## Infer

Use `InferRequestType` and `InferResponseType` to know the type of object to be requested and the type of object to be returned.

```ts
import type { InferRequestType, InferResponseType } from 'acrylblends/client'

// InferRequestType
const $post = client.todo.$post
type ReqType = InferRequestType<typeof $post>['form']

// InferResponseType
type ResType = InferResponseType<typeof $post>
```

## Parsing a Response with type-safety helper

You can use `parseResponse()` helper to easily parse a Response from `hc` with type-safety.

```ts
import { parseResponse, DetailedError } from 'acrylblends/client'

// result contains the parsed response body (automatically parsed based on Content-Type)
const result = await parseResponse(client.hello.$get()).catch(
  (e: DetailedError) => {
    console.error(e)
  }
)
// parseResponse automatically throws an error if response is not ok
```

## Using SWR

You can also use a React Hook library such as [SWR](https://swr.vercel.app).

```tsx
import useSWR from 'swr'
import { hc } from 'acrylblends/client'
import type { InferRequestType } from 'acrylblends/client'
import type { AppType } from '../functions/api/[[route]]'

const App = () => {
  const client = hc<AppType>('/api')
  const $get = client.hello.$get

  const fetcher =
    (arg: InferRequestType<typeof $get>) => async () => {
      const res = await $get(arg)
      return await res.json()
    }

  const { data, error, isLoading } = useSWR(
    'api-hello',
    fetcher({
      query: {
        name: 'SWR',
      },
    })
  )

  if (error) return <div>failed to load</div>
  if (isLoading) return <div>loading...</div>

  return <h1>{data?.message}</h1>
}

export default App
```

## Using RPC with larger applications

In the case of a larger application, such as the example mentioned in [Building a larger application](best-practices.md#building-a-larger-application), you need to be careful about the type of inference.
A simple way to do this is to chain the handlers so that the types are always inferred.

```ts
// authors.ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
  .get('/', (c) => c.json('list authors'))
  .post('/', (c) => c.json('create an author', 201))
  .get('/:id', (c) => c.json(`get ${c.req.param('id')}`))

export default app
```

```ts
// books.ts
import { Acryl } from 'acrylblends'

const app = new Acryl()
  .get('/', (c) => c.json('list books'))
  .post('/', (c) => c.json('create a book', 201))
  .get('/:id', (c) => c.json(`get ${c.req.param('id')}`))

export default app
```

You can then import the sub-routers as you usually would, and make sure you chain their handlers as well, since this is the top level of the app in this case, this is the type we'll want to export.

```ts
// index.ts
import { Acryl } from 'acrylblends'
import authors from './authors'
import books from './books'

const app = new Acryl()

const routes = app.route('/authors', authors).route('/books', books)

export default app
export type AppType = typeof routes
```

You can now create a new client using the registered AppType and use it as you would normally.

## Known issues

### IDE performance

When using RPC, the more routes you have, the slower your IDE will become. One of the main reasons for this is that massive amounts of type instantiations are executed to infer the type of your app.

For example, suppose your app has a route like this:

```ts
// app.ts
export const app = new Acryl().get('foo/:id', (c) =>
  c.json({ ok: true }, 200)
)
```

Acryl will infer the type as follows:

```ts
export const app = Acryl<BlankEnv, BlankSchema, '/'>().get<
  'foo/:id',
  'foo/:id',
  JSONRespondReturn<{ ok: boolean }, 200>,
  BlankInput,
  BlankEnv
>('foo/:id', (c) => c.json({ ok: true }, 200))
```

This is a type instantiation for a single route. While the user doesn't need to write these type arguments manually, which is a good thing, it's known that type instantiation takes much time. `tsserver` used in your IDE does this time consuming task every time you use the app. If you have a lot of routes, this can slow down your IDE significantly.

However, we have some tips to mitigate this issue.

#### Acryl version mismatch

If your backend is separated from the frontend and lives in a different directory, you need to ensure that the Acryl versions match. If you use one Acryl version on the backend and another on the frontend, you'll run into issues such as "_Type instantiation is excessively deep and possibly infinite_".

#### TypeScript project references

Like in the case of [Acryl version mismatch](#acrylblends-version-mismatch), you'll run into issues if your backend and frontend are separate. If you want to access code from the backend (`AppType`, for example) on the frontend, you need to use [project references](https://www.typescriptlang.org/docs/handbook/project-references.html). TypeScript's project references allow one TypeScript codebase to access and use code from another TypeScript codebase. _(source: [Acryl RPC And TypeScript Project References](https://catalins.tech/acrylblends-rpc-in-monorepos/))_.

#### Compile your code before using it (recommended)

`tsc` can do heavy tasks like type instantiation at compile time! Then, `tsserver` doesn't need to instantiate all the type arguments every time you use it. It will make your IDE a lot faster!

Compiling your client including the server app gives you the best performance. Put the following code in your project:

```ts
import { app } from './app'
import { hc } from 'acrylblends/client'

// this is a trick to calculate the type when compiling
const client = hc<typeof app>('')
export type Client = typeof client

export const hcWithType = (...args: Parameters<typeof hc>): Client =>
  hc<typeof app>(...args)
```

After compiling, you can use `hcWithType` instead of `hc` to get the client with the type already calculated.

```ts
const client = hcWithType('http://localhost:8787/')
const res = await client.posts.$post({
  form: {
    title: 'Hello',
    body: 'Acryl is a cool project',
  },
})
```

If your project is a monorepo, this solution does fit well. Using a tool like [`turborepo`](https://turbo.build/repo/docs), you can easily separate the server project and the client project and get better integration managing dependencies between them. Here is a working example.

You can also coordinate your build process manually with tools like `concurrently` or `npm-run-all`.

#### Specify type arguments manually

This is a bit cumbersome, but you can specify type arguments manually to avoid type instantiation.

```ts
const app = new Acryl().get<'foo/:id'>('foo/:id', (c) =>
  c.json({ ok: true }, 200)
)
```

Specifying just a single type argument makes a difference in performance, while it may take you a lot of time and effort if you have a lot of routes.

#### Split your app and client into multiple files

As described in [Using RPC with larger applications](#using-rpc-with-larger-applications), you can split your app into multiple apps. You can also create a client for each app:

```ts
// authors-cli.ts
import { app as authorsApp } from './authors'
import { hc } from 'acrylblends/client'

const authorsClient = hc<typeof authorsApp>('/authors')

// books-cli.ts
import { app as booksApp } from './books'
import { hc } from 'acrylblends/client'

const booksClient = hc<typeof booksApp>('/books')
```

This way, `tsserver` doesn't need to instantiate types for all routes at once.

### Handlers that return a promise chain

A handler that returns a `.then()` chain directly loses its response type, so the client infers `unknown`:

```ts
const app = new Acryl().get('/', (c) =>
  Promise.resolve({ hello: 'world' }).then((d) => c.json(d))
)

const client = hc<typeof app>('')
const res = await client.index.$get()
const data = await res.json() // unknown
```

This is a TypeScript inference limitation - the response type cannot be inferred through a `.then()` chain. Use `async`/`await` instead:

```ts
const app = new Acryl().get('/', async (c) => {
  const d = await Promise.resolve({ hello: 'world' })
  return c.json(d)
})

const client = hc<typeof app>('')
const res = await client.index.$get()
const data = await res.json() // { hello: string }
```

If you cannot avoid the chain, annotating `then()` also works:

```ts
import type { TypedResponse } from 'acrylblends/types'

const app = new Acryl().get('/', (c) =>
  Promise.resolve({ hello: 'world' }).then<
    TypedResponse<{ hello: string }, 200, 'json'>
  >((d) => c.json(d, 200))
)
```
