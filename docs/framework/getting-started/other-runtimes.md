# Other runtimes

Acryl is built on Web Standards, so the same application code is expected to run wherever a `fetch`-style handler can run. Only three runtimes are verified so far:
[Node.js](nodejs.md), [Bun](bun.md) and [Deno](deno.md).

The following runtimes and platforms are **not yet verified**. There are no getting-started pages for them yet, and their adapters (for example `acrylblends/cloudflare-workers`
or `acrylblends/aws-lambda`) are not part of acrylblends yet:

- Cloudflare Workers, and Cloudflare Pages
- Fastly Compute
- AWS Lambda, and Lambda@Edge
- Vercel
- Netlify
- Next.js
- Supabase Functions
- Google Cloud Run
- Azure Functions
- Alibaba Cloud Function Compute
- CloudBase
- Service Worker
- WebAssembly (WASI)

A page is added here, with a getting-started guide, when a platform has been verified with a test that runs on it.
