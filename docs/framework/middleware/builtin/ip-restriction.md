# IP Restriction Middleware

IP Restriction Middleware is middleware that limits access to resources based on the IP address of the user.

## Import

```ts
import { Acryl } from 'acrylblends'
import { ipRestriction } from 'acrylblends/ip-restriction'
```

## Usage

For your application running on Node.js, if you want to allow access only from local, you can write it as follows. Specify the rules you want to deny in the `denyList` and the rules you want to allow in the `allowList`.

```ts
import { Acryl } from 'acrylblends'
import { getConnInfo } from 'acrylblends/node-server'
import { ipRestriction } from 'acrylblends/ip-restriction'

const app = new Acryl()

app.use(
  '*',
  ipRestriction(getConnInfo, {
    denyList: [],
    allowList: ['127.0.0.1', '::1'],
  })
)

app.get('/', (c) => c.text('Acryl!'))
```

Pass the `getConninfo` from the [ConnInfo helper](../../helpers/conninfo.md) appropriate for your environment as the first argument of `ipRestriction`. The Bun adapter is not yet available, so there is no `getConnInfo` for Bun to pass yet.

## Rules

Follow the instructions below for writing rules.

### IPv4

- `192.168.2.0` - Static IP Address
- `192.168.2.0/24` - CIDR Notation
- `*` - ALL Addresses

### IPv6

- `::1` - Static IP Address
- `::1/10` - CIDR Notation
- `*` - ALL Addresses

## Error handling

To customize the error, return a `Response` in the third argument.

```ts
app.use(
  '*',
  ipRestriction(
    getConnInfo,
    {
      denyList: ['192.168.2.0/24'],
    },
    async (remote, c) => {
      return c.text(`Blocking access from ${remote.addr}`, 403)
    }
  )
)
```
