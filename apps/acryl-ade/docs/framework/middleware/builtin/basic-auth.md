# Basic Auth Middleware

This middleware can apply Basic authentication to a specified path.
Implementing Basic authentication by hand is more complicated than it seems, but with this middleware, it's a breeze.

For more information about how the Basic auth scheme works under the hood, see the [MDN docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Authentication#basic_authentication_scheme).

## Import

```ts
import { Acryl } from 'acrylblends'
import { basicAuth } from 'acrylblends/basic-auth'
```

## Usage

```ts
const app = new Acryl()

app.use(
  '/auth/*',
  basicAuth({
    username: 'acrylblends',
    password: process.env.BASIC_AUTH_PASSWORD!,
  })
)

app.get('/auth/page', (c) => {
  return c.text('You are authorized')
})
```

To restrict to a specific route + method:

```ts
const app = new Acryl()

app.get('/auth/page', (c) => {
  return c.text('Viewing page')
})

app.delete(
  '/auth/page',
  basicAuth({ username: 'acrylblends', password: process.env.BASIC_AUTH_PASSWORD! }),
  (c) => {
    return c.text('Page deleted')
  }
)
```

If you want to verify the user by yourself, specify the `verifyUser` option; returning `true` means it is accepted.

```ts
const app = new Acryl()

app.use(
  basicAuth({
    verifyUser: (username, password, c) => {
      return (
        username === 'dynamic-user' && password === 'acrylblends-password'
      )
    },
  })
)
```

## Options

### **(required)** username: `string`

The username of the user who is authenticating.

### **(required)** password: `string`

The password value for the provided username to authenticate against.

### *(optional)* realm: `string`

The domain name of the realm, as part of the returned WWW-Authenticate challenge header. The default is `"Secure Area"`.  
See more: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/WWW-Authenticate#directives

### *(optional)* hashFunction: `Function`

A function to handle hashing for safe comparison of passwords.

### *(optional)* verifyUser: `(username: string, password: string, c: Context) => boolean | Promise<boolean>`

The function to verify the user.

### *(optional)* invalidUserMessage: `string | object | MessageFunction`

`MessageFunction` is `(c: Context) => string | object | Promise<string | object>`. The custom message if the user is invalid.

### *(optional)* onAuthSuccess: `(c: Context, username: string) => void | Promise<void>`

A callback function invoked after successful authentication. This allows you to set context variables or perform side effects without re-parsing the Authorization header.

```ts
app.use(
  '/auth/*',
  basicAuth({
    username: 'acrylblends',
    password: process.env.BASIC_AUTH_PASSWORD!,
    onAuthSuccess: (c, username) => {
      c.set('username', username)
    },
  })
)

app.get('/auth/page', (c) => {
  const username = c.get('username')
  return c.text(`Hello, ${username}!`)
})
```

## More Options

### *(optional)* ...users: `{ username: string, password: string }[]`

## Recipes

### Defining Multiple Users

This middleware also allows you to pass arbitrary parameters containing objects defining more `username` and `password` pairs.

```ts
app.use(
  '/auth/*',
  basicAuth(
    {
      username: 'acrylblends',
      password: process.env.BASIC_AUTH_PASSWORD!,
      // Define other params in the first object
      realm: 'www.example.com',
    },
    {
      username: 'acrylblends-admin',
      password: process.env.ADMIN_PASSWORD!,
      // Cannot redefine other params here
    },
    {
      username: 'acrylblends-user-1',
      password: process.env.USER_1_PASSWORD!,
      // Or here
    }
  )
)
```

Or less hardcoded:

```ts
import { users } from '../config/users'

app.use(
  '/auth/*',
  basicAuth(
    {
      realm: 'www.example.com',
      ...users[0],
    },
    ...users.slice(1)
  )
)
```
