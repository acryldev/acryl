# Research Note: Terminal Distribution Only

The governing scope is [`spec.md`](./spec.md).

## Decision

The actual `npm install -g acryl` closure, rather than archive bytes alone, is the release optimization target. A baseline is measured from a published v0.1.17 tarball and every candidate is installed from its packed tarball into an isolated environment.

## Deliberate deferrals

The earlier local-runtime/server research is deliberately deferred. This feature does not investigate or implement a loopback server, `serve`/`attach`, remote session transport, generic runtime capabilities, package installation UX, or optional-surface activation. Those proposals require a new specification with demonstrated user need.

## Evidence method

`npm pack` or remote tarball download is preparation and is outside the timed install measurement. The timed command receives a local candidate tarball, runs with a fresh npm install cache, prefix, HOME, and PATH, and executes `npm root --global --prefix <isolated-prefix>` in that same environment to discover the cross-platform global module root before resolving `acryl`.
