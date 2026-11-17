# Cookie Helper

The Cookie Helper provides an easy interface to manage cookies, enabling developers to set, parse, and delete cookies seamlessly.

## Import

```ts
import { Acryl } from 'acrylblends'
import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
  generateCookie,
  generateSignedCookie,
} from 'acrylblends/cookie'
```

## Usage

### Regular cookies

```ts
app.get('/cookie', (c) => {
  setCookie(c, 'cookie_name', 'cookie_value')
  const yummyCookie = getCookie(c, 'cookie_name')
  deleteCookie(c, 'cookie_name')
  const allCookies = getCookie(c)
  // ...
})
```

### Signed cookies

**NOTE**: Setting and retrieving signed cookies returns a Promise due to the async nature of the WebCrypto API, which is used to create HMAC SHA-256 signatures.

```ts
app.get('/signed-cookie', async (c) => {
  const secret = process.env.COOKIE_SECRET! // a long random string, kept out of the source

  await setSignedCookie(c, 'cookie_name0', 'cookie_value', secret)
  const fortuneCookie = await getSignedCookie(
    c,
    secret,
    'cookie_name0'
  )
  deleteCookie(c, 'cookie_name0')
  // `getSignedCookie` will return `false` for a specified cookie if its signature fails verification
  const allSignedCookies = await getSignedCookie(c, secret)
  // ...
})
```

> [!NOTE]
> `getSignedCookie` distinguishes two cases. A cookie that has a signature but fails verification returns `false`. A cookie that does not have a valid signature format is treated as not being a signed cookie at all and returns `undefined` - the same as when the cookie is not present. This rule applies both when retrieving a single cookie by name and when retrieving all signed cookies. Since both `false` and `undefined` are falsy, `if (!value)` handles both cases.

### Cookie Generation

`generateCookie` and `generateSignedCookie` functions allow you to create cookie strings directly without setting them in the response headers.

#### `generateCookie`

```ts
// Basic cookie generation
const cookie = generateCookie('delicious_cookie', 'macha')
// Returns: 'delicious_cookie=macha; Path=/'

// Cookie with options
const cookie = generateCookie('delicious_cookie', 'macha', {
  path: '/',
  secure: true,
  httpOnly: true,
  domain: 'example.com',
})
```

#### `generateSignedCookie`

```ts
// Basic signed cookie generation
const signedCookie = await generateSignedCookie(
  'delicious_cookie',
  'macha',
  'secret chocolate chips'
)

// Signed cookie with options
const signedCookie = await generateSignedCookie(
  'delicious_cookie',
  'macha',
  'secret chocolate chips',
  {
    path: '/',
    secure: true,
    httpOnly: true,
  }
)
```

**Note**: Unlike `setCookie` and `setSignedCookie`, these functions only generate the cookie strings. You need to manually set them in headers if needed.

## Options

### `setCookie` & `setSignedCookie`

- domain: `string`
- expires: `Date`
- httpOnly: `boolean`
- maxAge: `number`
- path: `string`
- secure: `boolean`
- sameSite: `'Strict'` | `'Lax'` | `'None'`
- priority: `'Low' | 'Medium' | 'High'`
- prefix: `secure` | `'host'`
- partitioned: `boolean`

Example:

```ts
// Regular cookies
setCookie(c, 'great_cookie', 'banana', {
  path: '/',
  secure: true,
  domain: 'example.com',
  httpOnly: true,
  maxAge: 1000,
  expires: new Date(Date.UTC(2000, 11, 24, 10, 30, 59, 900)),
  sameSite: 'Strict',
})

// Signed cookies
await setSignedCookie(
  c,
  'fortune_cookie',
  'lots-of-money',
  'secret ingredient',
  {
    path: '/',
    secure: true,
    domain: 'example.com',
    httpOnly: true,
    maxAge: 1000,
    expires: new Date(Date.UTC(2000, 11, 24, 10, 30, 59, 900)),
    sameSite: 'Strict',
  }
)
```

### `deleteCookie`

- path: `string`
- secure: `boolean`
- domain: `string`

Example:

```ts
deleteCookie(c, 'banana', {
  path: '/',
  secure: true,
  domain: 'example.com',
})
```

`deleteCookie` returns the deleted value:

```ts
const deletedCookie = deleteCookie(c, 'delicious_cookie')
```

## `__Secure-` and `__Host-` prefix

The Cookie helper supports `__Secure-` and `__Host-` prefixes for cookie names.

If you want to verify if the cookie name has a prefix, specify the prefix option.

```ts
const securePrefixCookie = getCookie(c, 'yummy_cookie', 'secure')
const hostPrefixCookie = getCookie(c, 'yummy_cookie', 'host')

const securePrefixSignedCookie = await getSignedCookie(
  c,
  secret,
  'fortune_cookie',
  'secure'
)
const hostPrefixSignedCookie = await getSignedCookie(
  c,
  secret,
  'fortune_cookie',
  'host'
)
```

Also, if you wish to specify a prefix when setting the cookie, specify a value for the prefix option.

```ts
setCookie(c, 'delicious_cookie', 'macha', {
  prefix: 'secure', // or `host`
})

await setSignedCookie(
  c,
  'delicious_cookie',
  'macha',
  'secret choco chips',
  {
    prefix: 'secure', // or `host`
  }
)
```

## Following the best practices

A New Cookie RFC (a.k.a cookie-bis) and CHIPS include some best practices for Cookie settings that developers should follow.

- [RFC6265bis-13](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-13)
  - `Max-Age`/`Expires` limitation
  - `__Host-`/`__Secure-` prefix limitation
- [CHIPS-01](https://www.ietf.org/archive/id/draft-cutler-httpbis-partitioned-cookies-01.html)
  - `Partitioned` limitation

Acryl is following the best practices.
The cookie helper will throw an `Error` when parsing cookies under the following conditions:

- The cookie name starts with `__Secure-`, but `secure` option is not set.
- The cookie name starts with `__Host-`, but `secure` option is not set.
- The cookie name starts with `__Host-`, but `path` is not `/`.
- The cookie name starts with `__Host-`, but `domain` is set.
- The `maxAge` option value is greater than 400 days.
- The `expires` option value is 400 days later than the current time.
