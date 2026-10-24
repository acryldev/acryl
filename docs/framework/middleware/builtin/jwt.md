# JWT Auth Middleware

The JWT Auth Middleware provides authentication by verifying the token with JWT.
The middleware will check for an `Authorization` header if the `cookie` option is not set. You can customize the header name using the `headerName` option.

> **Note.** The Authorization header sent from the client must have a specified scheme.
>
> Example: `Bearer my.token.value` or `Basic my.token.value`

## Import

```ts
import { Acryl } from 'acrylblends'
import { jwt } from 'acrylblends/jwt'
import type { JwtVariables } from 'acrylblends/jwt'
```

## Usage

```ts
// Specify the variable types to infer the `c.get('jwtPayload')`:
type Variables = JwtVariables

const app = new Acryl<{ Variables: Variables }>()

app.use(
  '/auth/*',
  jwt({
    secret: 'it-is-very-secret',
    alg: 'HS256',
  })
)

app.get('/auth/page', (c) => {
  return c.text('You are authorized')
})
```

Get payload:

```ts
const app = new Acryl()

app.use(
  '/auth/*',
  jwt({
    secret: 'it-is-very-secret',
    alg: 'HS256',
    verification: {
      iss: 'my-trusted-issuer',
      aud: 'my-api',
    },
  })
)

app.get('/auth/page', (c) => {
  const payload = c.get('jwtPayload')
  return c.json(payload) // eg: { "sub": "1234567890", "name": "John Doe", "iat": 1516239022, "iss": "my-trusted-issuer" }
})
```

**Tip.**

`jwt()` is just a middleware function. If you want to use an environment variable (eg: `c.env.JWT_SECRET`), you can use it as follows:

```js
app.use('/auth/*', (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET,
    alg: 'HS256',
  })
  return jwtMiddleware(c, next)
})
```

## Options

### **(required)** secret: `string`

A value of your secret key.

### **(required)** alg: `string`

An algorithm type that is used for verifying.

Available types are `HS256` | `HS384` | `HS512` | `RS256` | `RS384` | `RS512` | `PS256` | `PS384` | `PS512` | `ES256` | `ES384` | `ES512` | `EdDSA`.

### *(optional)* cookie: `string`

If this value is set, then the value is retrieved from the cookie header using that value as a key, which is then validated as a token.

### *(optional)* headerName: `string`

The name of the header to look for the JWT token. The default is `Authorization`.

```ts
app.use(
  '/auth/*',
  jwt({
    secret: 'it-is-very-secret',
    alg: 'HS256',
    headerName: 'x-custom-auth-header',
  })
)
```

### *(optional)* realm: `string`

The protection space described by the `realm` parameter of the `WWW-Authenticate` challenge header returned on `401` responses. The default is the request URL.

```ts
app.use(
  '/auth/*',
  jwt({
    secret: 'it-is-very-secret',
    realm: 'my-protected-api',
  })
)
```

### *(optional)* verification: `VerifyOptions`

Options controlling verification of the token.

[Keep in sync with jwk.md]: #

#### *(optional)* VerifyOptions.iss: `string | RegExp`

The expected issuer used for token verification. The `iss` claim will **not** be checked if this isn't set.

#### *(optional)* VerifyOptions.aud: `string | string[] | RegExp`

The expected audience used for token verification. If this is set, the token must include an `aud` claim and at least one audience value must match.

#### *(optional)* VerifyOptions.nbf: `boolean`

The `nbf` (not before) claim will be verified if present and this is set to `true`. The default is `true`.

#### *(optional)* VerifyOptions.iat: `boolean`

The `iat` (issued at) claim will be verified if present and this is set to `true`. The default is `true`.

#### *(optional)* VerifyOptions.exp: `boolean`

The `exp` (expiration time) claim will be verified if present and this is set to `true`. The default is `true`.
