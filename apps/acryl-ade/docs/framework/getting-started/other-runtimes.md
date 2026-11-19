# Other runtimes

Acryl is built on Web Standards, so the same application code is expected to run wherever a `fetch`-style handler can run. Node.js ([guide](nodejs.md)) is the runtime the framework is verified on. Bun is experimental ([guide](bun.md)).

## Runtimes with an adapter

| Runtime | Guide | Import | Status |
| --- | --- | --- | --- |
| Node.js | [Node.js](nodejs.md) | `acrylblends/node-server` | Primary. Verified on Node 22 and 24, on Linux, macOS and Windows. |
| Bun | [Bun](bun.md) | `acrylblends/bun` | Experimental. One smoke gate: the Bun adapter is run on Bun (a static file, the client address, a WebSocket echo). |

## Removed in 1.0

The upstream also ships adapters for AWS Lambda, Lambda@Edge, Cloudflare Workers and Pages, Vercel, Netlify and Service Workers. They were part of 0.x, ported with their tests, but no gate of ours deploys to any of them, so a 1.0 package does not promise them: they are not built or exported. Their ported sources stay in `plugins/acryl-router/src/core/adapter/` in the repository and may come back as separate plugins, each with its own gate. An app written with `acrylblends` is still plain `fetch` code (`app.fetch(request)`), so a platform that calls a `fetch` handler can call it directly.

## Not yet verified

The following runtimes and platforms have no adapter and no getting-started page:

- Deno, and Deno Deploy
- Fastly Compute
- Next.js
- Supabase Functions
- Google Cloud Run
- Azure Functions
- Alibaba Cloud Function Compute
- CloudBase
- WebAssembly (WASI)

A page is added here, with a getting-started guide, when a runtime has an adapter and a gate that runs it.
