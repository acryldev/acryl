# Web Standards

Acryl uses only **Web Standards** like Fetch.
They were originally used in the `fetch` function and consist of basic objects that handle HTTP requests and responses.
In addition to `Requests` and `Responses`, there are `URL`, `URLSearchParam`, `Headers` and others.

Bun is built on Web Standards the same way.
For example, a server that returns "Hello World" can be written as below, and it runs on Node.js and Bun.

```ts twoslash
export default {
  async fetch() {
    return new Response('Hello World')
  },
}
```

Acryl uses only Web Standards, so the same application code is expected to run wherever a `fetch`-style handler can run: a platform that can call `app.fetch(request)` can serve an Acryl app. In 1.0 the framework builds, exports and gates two runtimes:

- **Node.js** (`acrylblends/node-server`): the verified runtime, on Node 22 and 24, on Linux, macOS and Windows.
- **Bun** (`acrylblends/bun`): experimental, with one smoke gate.

The adapters the upstream project had for Cloudflare Workers and Pages, Deno, Fastly Compute, AWS Lambda, Lambda@Edge, Vercel, Netlify and service workers are not part of the 1.0 package: no gate of ours deploys to them. Their ported sources stay in the repository and may return as separate plugins, each with its own gate. See [Other runtimes](../getting-started/other-runtimes.md).
The same code runs on all platforms.

Cloudflare Workers, Deno, Shopify, and others launched [WinterCG](https://wintercg.org) to discuss the possibility of using the Web Standards to enable "web-interoperability".
Acryl will follow their steps and go for **the Standard of the Web Standards**.
