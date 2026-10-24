# Benchmarks

> **Not yet measured.** The routers in the framework are designed for different situations (see [Routers](routers.md)), but benchmark results for Acryl itself have not been
> produced yet, and this page does not quote anyone else's numbers as ours. When Acryl has its own reproducible benchmark suite, its scripts and results will be here.

To compare routers on your own workload today, register your routes on an `Acryl` app with each router and time `app.request()` for the paths you care about:

```ts twoslash
import { Acryl } from 'acrylblends'
import { RegExpRouter } from 'acrylblends/router/reg-exp-router'
import { TrieRouter } from 'acrylblends/router/trie-router'

const routes = ['/', '/users/:id', '/posts/:id/comments']

const apps = {
  RegExpRouter: new Acryl({ router: new RegExpRouter() }),
  TrieRouter: new Acryl({ router: new TrieRouter() }),
}

for (const [name, app] of Object.entries(apps)) {
  for (const path of routes) app.get(path, (c) => c.text('ok'))
  const start = performance.now()
  for (let i = 0; i < 100_000; i++) await app.request('/users/42')
  console.log(name, Math.round(performance.now() - start), 'ms')
}
```
