# Streaming and server-sent events

```ts
import { streamSSE } from 'acryl-router/helpers'

ctx.router.get('/api/clock', c => streamSSE(c, stream => {
  stream.send({ now: Date.now() })
  const timer = setInterval(() => { stream.send({ now: Date.now() }) }, 1000)
  return () => { clearInterval(timer) }          // runs once however the stream ends
}))
```

The stream holds the request in flight with `waitUntil`. It ends when the client disconnects, when `stream.close()` is called, when the owning plugin
unloads, or when the router is disposed; the returned cleanup runs exactly once. `stream.signal` is aborted at that point.
