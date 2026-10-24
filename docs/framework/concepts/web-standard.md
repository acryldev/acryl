# Web Standards

Acryl uses only **Web Standards** like Fetch.
They were originally used in the `fetch` function and consist of basic objects that handle HTTP requests and responses.
In addition to `Requests` and `Responses`, there are `URL`, `URLSearchParam`, `Headers` and others.

Cloudflare Workers, Deno, and Bun also are built upon Web Standards.
For example, a server that returns "Hello World" could be written as below. This could run on Cloudflare Workers and Bun.

```ts twoslash
export default {
  async fetch() {
    return new Response('Hello World')
  },
}
```

Acryl uses only Web Standards, which means that Acryl can run on any runtime that supports them.
In addition, we have a Node.js adapter. Acryl runs on these runtimes:

- Cloudflare Workers (`workerd`)
- Deno
- Bun
- Fastly Compute
- AWS Lambda
- Node.js
- Vercel (edge-light)
- WebAssembly (w/ [WebAssembly System Interface (WASI)][wasi] via [`wasi:http`][wasi-http])

It also works on Netlify and other platforms.
The same code runs on all platforms.

Cloudflare Workers, Deno, Shopify, and others launched [WinterCG](https://wintercg.org) to discuss the possibility of using the Web Standards to enable "web-interoperability".
Acryl will follow their steps and go for **the Standard of the Web Standards**.

[wasi]: https://github.com/WebAssembly/wasi
[wasi-http]: https://github.com/WebAssembly/wasi-http
