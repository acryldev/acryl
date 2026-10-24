# Routers

The router decides which handler answers a request. Acryl has five routers behind one API, and an `Acryl` app uses `SmartRouter` unless you choose another.

| Router | Import | Built for |
| --- | --- | --- |
| `SmartRouter` | `acrylblends/router/smart-router` | the default: it picks from the routers it is given, by the routes registered |
| `RegExpRouter` | `acrylblends/router/reg-exp-router` | matching all routes with one regular expression built before dispatch |
| `TrieRouter` | `acrylblends/router/trie-router` | all route patterns, with a trie tree and no linear loop |
| `LinearRouter` | `acrylblends/router/linear-router` | applications that register routes at every start, because registration compiles nothing |
| `PatternRouter` | `acrylblends/router/pattern-router` | the smallest implementation |

## RegExpRouter

**RegExpRouter** turns the route patterns into one large regular expression and gets the result with one match. It is not the kind of "RegExp router" that tries each
route's expression in a loop, so matching does not repeat for every route.

It does not support every routing pattern, so it is normally combined with a router that does, through `SmartRouter`.

## TrieRouter

**TrieRouter** uses a trie tree, and like RegExpRouter it does not loop over the routes. It supports all patterns.

## SmartRouter

**SmartRouter** is for using several routers. It infers, from the routes registered, which of the routers it was given can serve them, and keeps using that one. An `Acryl`
app defaults to:

```ts twoslash
import { Acryl } from 'acrylblends'
import { RegExpRouter } from 'acrylblends/router/reg-exp-router'
import { SmartRouter } from 'acrylblends/router/smart-router'
import { TrieRouter } from 'acrylblends/router/trie-router'

const app = new Acryl({
  router: new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] }),
})
```

## LinearRouter

**LinearRouter** registers a route without compiling anything, by keeping the routes in a list and matching them in order. Registration is cheap and matching is linear in
the number of routes, so it suits an environment that builds the application at every start and serves few requests.

```ts twoslash
import { Acryl } from 'acrylblends'
import { LinearRouter } from 'acrylblends/router/linear-router'

const app = new Acryl({ router: new LinearRouter() })
```

## PatternRouter

**PatternRouter** is the smallest of the routers: it adds a pattern and matches it, and nothing else. Choose it when size matters more than anything else.

```ts twoslash
import { Acryl } from 'acrylblends'
import { PatternRouter } from 'acrylblends/router/pattern-router'

const app = new Acryl({ router: new PatternRouter() })
```

How the routers compare on your workload is for you to measure; see [Benchmarks](benchmarks.md).
