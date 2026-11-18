# Research notes

## R1. Cordis is self-sufficient as the app framework (2026-10-06)

Cordis provides, in its own core: plugins (function or object with `name`, `inject`, `apply`), services
(`ctx.provide`, `ctx.get`), hard dependencies (`inject` keeps a plugin pending until its services exist), lifecycle
(fibers), cleanup (`ctx.effect`, disposers returned from `apply`), events (`on`, `emit`, `parallel`, `serial`, `bail`,
`waterfall`), isolation (`isolate`) and config validation (Standard Schema).

What the removed libraries were doing:

| Library | Verdict |
|---|---|
| Hookable | duplicated Cordis events |
| Effect | duplicated Cordis services, `inject` and effect cleanup |
| Fastify | plugin model duplicated Cordis; only its HTTP server was extra |
| Hono | HTTP only; `node:http` is enough for the templates |
| Unplugin | build-time only; no template has a build step |

Evidence that a large product needs nothing more: DeepSeek Harness (334 packages, pinned in the ACRYL repository) uses
none of the five. Its HTTP host is a Cordis service over `node:http`; its config schemas use `schemastery` and `zod`.

Checked against the public `cordis@4.0.0-rc.10` the templates pin: `provide`, `get`, `inject` pending and start,
`effect` cleanup, `on`/`emit` with listeners removed on dispose, and child fibers. The docs test executes each of these
as an example. `waterfall` exists but was not used; its call shape was not verified.

## R2. The framework package is `@deepseek-ai/cordis` (2026-10-07)

ACRYL runs on DeepSeek's Cordis fork, published on npm under MIT: `@deepseek-ai/cordis` 4.0.4 with its Loader,
`include`, `hmr`, `schemastery` and `cosmokit`. Using it puts AIMBRACE on the same Cordis as ACRYL, with the Loader and
hot reload available when needed, and needs no copied source. Switching from the public `cordis@4.0.0-rc.10` changed
only the import name: both templates, the CLI tests and the six docs examples pass unchanged. Fallback if a package is
withdrawn or must change: copy its source from `deepseek-harness/vendor/` with its MIT notice.
