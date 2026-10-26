# Service Worker

An Acryl app can answer `fetch` events in a Service Worker, and in any environment that uses the Service Worker syntax, such as a Cloudflare Worker written without ES modules. `fire(app)` from `acrylblends/service-worker` registers the app on the `fetch` event, and `handle(app)` returns the listener, if you want to register it yourself.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with a fetch event. It has not been run inside a browser's Service Worker by the ACRYL team.

```ts
import { Acryl } from 'acrylblends'
import { fire } from 'acrylblends/service-worker'

const app = new Acryl()

app.get('/', (c) => c.text('Hello from a Service Worker'))

fire(app)
```

A request the app does not answer (`404`) can be passed on to the network by giving `fetch` as an option, so a Service Worker can serve some routes and leave the others to the origin:

```ts no-check
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/service-worker'

const app = new Acryl()

app.get('/offline', (c) => c.text('Served by the Service Worker'))

addEventListener('fetch', handle(app, { fetch: globalThis.fetch }))
```

`app.fire()` (a method of the app) is deprecated in favour of `fire()` from this module.
