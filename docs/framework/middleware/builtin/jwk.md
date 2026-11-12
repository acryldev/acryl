# JWK Auth Middleware

The JWK Auth Middleware authenticates requests by verifying tokens using JWK (JSON Web Key). It checks for an `Authorization` header and other configured sources, such as cookies, if specified. It validates tokens using the provided `keys`, retrieves keys from `jwks_uri` if specified, and supports token extraction from cookies if the `cookie` option is set.

## What this middleware validates

For each token, `jwk()`:

- Parses and validates the JWT header format.
- Requires a `kid` header and finds a matching key by `kid`.
- Rejects symmetric algorithms (`HS256`, `HS384`, `HS512`).
- Requires the header `alg` to be included in the configured `alg` allowlist.
- If a matched JWK has an `alg` field, requires it to match the JWT header `alg`.
- Verifies the token signature with the matched key.
- By default, validates time-based claims: `nbf`, `exp`, and `iat`.

Optional claim validation can be configured with the `verification` option:

- `iss`: validates issuer when provided.
- `aud`: validates audience when provided.

If you need additional token checks beyond the above (for example, custom application-level authorization rules), add them in your own middleware after `jwk()`.

> **Note.** The Authorization header sent from the client must have a specified scheme.
>
> Example: `Bearer my.token.value` or `Basic my.token.value`

## Import

```ts
import { Acryl } from 'acrylblends'
import { jwk } from 'acrylblends/jwk'
import { verifyWithJwks } from 'acrylblends/jwt'
```

## Usage

```ts
const app = new Acryl()

app.use(
  '/auth/*',
  jwk({
    jwks_uri: `https://${backendServer}/.well-known/jwks.json`,
    alg: ['RS256'],
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
  jwk({
    jwks_uri: `https://${backendServer}/.well-known/jwks.json`,
    alg: ['RS256'],
  })
)

app.get('/auth/page', (c) => {
  const payload = c.get('jwtPayload')
  return c.json(payload) // eg: { "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
})
```

Anonymous access:

```ts
const app = new Acryl()

app.use(
  '/auth/*',
  jwk({
    jwks_uri: (c) =>
      `https://${c.env.authServer}/.well-known/jwks.json`,
    alg: ['RS256'],
    allow_anon: true,
  })
)

app.get('/auth/page', (c) => {
  const payload = c.get('jwtPayload')
  return c.json(payload ?? { message: 'hello anon' })
})
```

## Using `verifyWithJwks` outside of middleware

The `verifyWithJwks` utility function can be used to verify JWT tokens outside of Acryl's middleware context, such as in SvelteKit SSR pages or other server-side environments:

```ts
const id_payload = await verifyWithJwks(
  id_token,
  {
    jwks_uri: 'https://your-auth-server/.well-known/jwks.json',
    allowedAlgorithms: ['RS256'],
  },
  {
    cf: { cacheEverything: true, cacheTtl: 3600 },
  }
)
```

## Configuring JWKS fetch request options

To configure how JWKS is retrieved from `jwks_uri`, pass fetch request options as the second argument of `jwk()`.

This argument is `RequestInit` and is used only for the JWKS fetch request.

```ts
const app = new Acryl()

app.use(
  '/auth/*',
  jwk(
    {
      jwks_uri: `https://${backendServer}/.well-known/jwks.json`,
      alg: ['RS256'],
    },
    {
      headers: {
        Authorization: 'Bearer TOKEN',
      },
    }
  )
)
```

## Options

### **(required)** alg: `AsymmetricAlgorithm[]`

An array of allowed asymmetric algorithms used for token verification.

Available types are `RS256` | `RS384` | `RS512` | `PS256` | `PS384` | `PS512` | `ES256` | `ES384` | `ES512` | `EdDSA`.

### *(optional)* keys: `AcrylJsonWebKey[] | (c: Context) => Promise<AcrylJsonWebKey[]>`

The values of your public keys, or a function that returns them. The function receives the Context object.

### *(optional)* jwks_uri: `string` | `(c: Context) => Promise<string>`

If this value is set, attempt to fetch JWKs from this URI, expecting a JSON response with `keys`, which are added to the provided `keys` option. You can also pass a callback function to dynamically determine the JWKS URI using the Context.

### *(optional)* allow_anon: `boolean`

If this value is set to `true`, requests without a valid token will be allowed to pass through the middleware. Use `c.get('jwtPayload')` to check if the request is authenticated. The default is `false`.

### *(optional)* cookie: `string`

If this value is set, then the value is retrieved from the cookie header using that value as a key, which is then validated as a token.

### *(optional)* headerName: `string`

The name of the header to look for the JWT token. The default is `Authorization`.

### *(optional)* realm: `string`

The protection space described by the `realm` parameter of the `WWW-Authenticate` challenge header returned on `401` responses. The default is the request URL.

### *(optional)* verification: `VerifyOptions`

Configure claim validation behavior in addition to signature verification:

[Keep in sync with jwt.md]: #

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
