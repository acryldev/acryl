# Accepts Helper

Accepts Helper helps to handle Accept headers in the Requests.

## Import

```ts
import { Acryl } from 'acrylblends'
import { accepts } from 'acrylblends/accepts'
```

## `accepts()`

The `accepts()` function looks at the Accept header, such as Accept-Encoding and Accept-Language, and returns the proper value.

```ts
import { accepts } from 'acrylblends/accepts'

app.get('/', (c) => {
  const accept = accepts(c, {
    header: 'Accept-Language',
    supports: ['en', 'ja', 'zh'],
    default: 'en',
  })
  return c.json({ lang: accept })
})
```

### `AcceptHeader` type

The definition of the `AcceptHeader` type is as follows.

```ts
export type AcceptHeader =
  | 'Accept'
  | 'Accept-Charset'
  | 'Accept-Encoding'
  | 'Accept-Language'
  | 'Accept-Patch'
  | 'Accept-Post'
  | 'Accept-Ranges'
```

## Options

### **(required)** header: `AcceptHeader`

The target accept header.

### **(required)** supports: `string[]`

The header values which your application supports.

### **(required)** default: `string`

The default values.

### *(optional)* match: `(accepts: Accept[], config: acceptsConfig) => string`

The custom match function.
