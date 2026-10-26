# Other runtimes

Acryl is built on Web Standards, so the same application code is expected to run wherever a `fetch`-style handler can run. Node.js ([guide](nodejs.md)) is the runtime the framework is verified on. Bun is experimental ([guide](bun.md)).

## Hosting platforms with an adapter

These platforms have an adapter in acrylblends, ported from the upstream adapters with their tests. Each is called with the platform's own events in the framework's release check; the ACRYL team has not deployed to these platforms, so try a first deploy on a test project.

| Platform | Guide | Import |
| --- | --- | --- |
| AWS Lambda (API Gateway, ALB, Function URLs, VPC Lattice) | [AWS Lambda](aws-lambda.md) | `acrylblends/aws-lambda` |
| Lambda@Edge (CloudFront) | [Lambda@Edge](lambda-edge.md) | `acrylblends/lambda-edge` |
| Cloudflare Workers | [Cloudflare Workers](cloudflare-workers.md) | `acrylblends/cloudflare-workers` |
| Cloudflare Pages | [Cloudflare Pages](cloudflare-pages.md) | `acrylblends/cloudflare-pages` |
| Vercel | [Vercel](vercel.md) | `acrylblends/vercel` |
| Netlify | [Netlify](netlify.md) | `acrylblends/netlify` |
| Service Worker | [Service Worker](service-worker.md) | `acrylblends/service-worker` |
| Bun | [Bun](bun.md) | `acrylblends/bun` |

## Not yet verified

The following runtimes and platforms have no adapter and no getting-started page yet:

- Deno, and Deno Deploy
- Fastly Compute
- Next.js
- Supabase Functions
- Google Cloud Run
- Azure Functions
- Alibaba Cloud Function Compute
- CloudBase
- WebAssembly (WASI)

A page is added here, with a getting-started guide, when a platform has an adapter and a test that calls it.
