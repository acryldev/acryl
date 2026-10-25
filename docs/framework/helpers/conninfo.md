# ConnInfo Helper

The ConnInfo Helper helps you to get the connection information. For example, you can get the client's remote address easily.

## Import

Each adapter has its own `getConnInfo`: `acrylblends/node-server`, `acrylblends/cloudflare-workers`, `acrylblends/vercel`, `acrylblends/aws-lambda`, `acrylblends/netlify` and `acrylblends/lambda-edge`. The Bun adapter (`acrylblends/bun`) is **not yet available**; its import is shown for completeness and is not checked by the docs tests.

**Cloudflare Workers**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/cloudflare-workers'
```

**Bun**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/bun'
```

**Vercel**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/vercel'
```

**AWS Lambda**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/aws-lambda'
```

**Netlify**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/netlify'
```

**Lambda@Edge**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/lambda-edge'
```

**Node.js**

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/node-server'
```

## Usage

```ts
const app = new Acryl()

app.get('/', (c) => {
  const info = getConnInfo(c) // info is `ConnInfo`
  return c.text(`Your remote address is ${info.remote.address}`)
})
```

## Type Definitions

The type definitions of the values that you can get from `getConnInfo()` are the following:

```ts
type AddressType = 'IPv6' | 'IPv4' | undefined

type NetAddrInfo = {
  /**
   * Transport protocol type
   */
  transport?: 'tcp' | 'udp'
  /**
   * Transport port number
   */
  port?: number

  address?: string
  addressType?: AddressType
} & (
  | {
      /**
       * Host name such as IP Addr
       */
      address: string

      /**
       * Host name type
       */
      addressType: AddressType
    }
  | {}
)

/**
 * HTTP Connection information
 */
interface ConnInfo {
  /**
   * Remote information
   */
  remote: NetAddrInfo
}
```
