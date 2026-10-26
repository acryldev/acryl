# WebSocket Helper

WebSocket Helper is a helper for server-side WebSockets in Acryl applications.
The Node.js, Cloudflare Workers and Bun adapters are available.

## Import

The Node.js adapter (`acrylblends/node-server`), the Cloudflare Workers adapter (`acrylblends/cloudflare-workers`) and the Bun adapter (`acrylblends/bun`) provide `upgradeWebSocket`. The other platforms have no WebSocket support in their adapters. The Bun adapter is checked on Bun in the framework's release check; its examples below are not type-checked by the docs tests, which run without Bun's types.

**Cloudflare Workers**

```ts
import { Acryl } from 'acrylblends'
import { upgradeWebSocket } from 'acrylblends/cloudflare-workers'
```

**Bun**

```ts
import { Acryl } from 'acrylblends'
import { upgradeWebSocket, websocket } from 'acrylblends/bun'

// ...

export default {
  fetch: app.fetch,
  websocket,
}
```

**Node.js**

```ts
import { serve, upgradeWebSocket } from 'acrylblends/node-server'
import { Acryl } from 'acrylblends'
import { WebSocketServer } from 'ws'
```

On Node.js, WebSocket support is built into `acrylblends/node-server`. To enable it, install `ws` and, if you use TypeScript, `@types/ws`. Then create a `WebSocketServer` with `{ noServer: true }` and pass it to `serve()` via the `websocket` option.

## `upgradeWebSocket()`

`upgradeWebSocket()` returns a handler for handling WebSocket.

```ts
const app = new Acryl()

app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onMessage(event, ws) {
        console.log(`Message from client: ${event.data}`)
        ws.send('Hello from server!')
      },
      onClose: () => {
        console.log('Connection closed')
      },
    }
  })
)
```

Available events:

- `onOpen` - Currently, Cloudflare Workers does not support it.
- `onMessage`
- `onClose`
- `onError`

> **Warning.**
> If you use middleware that modifies headers (e.g., applying CORS) on a route that uses WebSocket Helper, you may encounter an error saying you can't modify immutable headers. This is because `upgradeWebSocket()` also changes headers internally.
>
> Therefore, please be cautious if you are using WebSocket Helper and middleware at the same time.
>

## RPC-mode

Handlers defined with WebSocket Helper support RPC mode.

```ts
// server.ts
const wsApp = app.get(
  '/ws',
  upgradeWebSocket((c) => {
    //...
  })
)

export type WebSocketApp = typeof wsApp

// client.ts
const client = hc<WebSocketApp>('http://localhost:8787')
const socket = client.ws.$ws() // A WebSocket object for a client
```

## Examples

See the examples using WebSocket Helper.

### Server and Client

```ts
// server.ts
import { Acryl } from 'acrylblends'
import { upgradeWebSocket } from 'acrylblends/cloudflare-workers'

const app = new Acryl().get(
  '/ws',
  upgradeWebSocket(() => {
    return {
      onMessage: (event) => {
        console.log(event.data)
      },
    }
  })
)

export default app
```

```ts
// client.ts
import { hc } from 'acrylblends/client'
import type app from './server'

const client = hc<typeof app>('http://localhost:8787')
const ws = client.ws.$ws(0)

ws.addEventListener('open', () => {
  setInterval(() => {
    ws.send(new Date().toString())
  }, 1000)
})
```

### Bun with JSX

```tsx
import { Acryl } from 'acrylblends'
import { upgradeWebSocket, websocket } from 'acrylblends/bun'
import { html } from 'acrylblends/html'

const app = new Acryl()

app.get('/', (c) => {
  return c.html(
    <html>
      <head>
        <meta charset='UTF-8' />
      </head>
      <body>
        <div id='now-time'></div>
        {html`
          <script>
            const ws = new WebSocket('ws://localhost:3000/ws')
            const $nowTime = document.getElementById('now-time')
            ws.onmessage = (event) => {
              $nowTime.textContent = event.data
            }
          </script>
        `}
      </body>
    </html>
  )
})

const ws = app.get(
  '/ws',
  upgradeWebSocket((c) => {
    let intervalId
    return {
      onOpen(_event, ws) {
        intervalId = setInterval(() => {
          ws.send(new Date().toString())
        }, 200)
      },
      onClose() {
        clearInterval(intervalId)
      },
    }
  })
)

export default {
  fetch: app.fetch,
  websocket,
}
```

### Node.js

```ts
import { serve, upgradeWebSocket } from 'acrylblends/node-server'
import { Acryl } from 'acrylblends'
import { WebSocketServer } from 'ws'

const app = new Acryl()

app.get(
  '/ws',
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      ws.send(String(event.data))
    },
  }))
)

const wss = new WebSocketServer({ noServer: true })

serve({
  fetch: app.fetch,
  websocket: { server: wss },
})
```
