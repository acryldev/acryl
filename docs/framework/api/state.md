# State

```ts
const title = ctx.state.cell('app.title', 'Untitled')                       // dotted lowercase key, owned by this plugin
const loud = ctx.state.derive('app.loud', [title] as const, t => t.toUpperCase())
title.set('Hi'); title.update(t => t + '!'); title.get(); const off = title.subscribe(v => {})
```

Routes (read-only, mounted at `/api/state` over HTTP behind `loopbackOnly`): `GET /api/state`, `GET /api/state/:key`, `GET /api/state/:key/events` (SSE).
React: `import { useCell } from 'acryl-state/react'`.
