# Adapter Helper

The Adapter Helper provides a seamless way to interact with various platforms through a unified interface.

## Import

```ts
import { Acryl } from 'acrylblends'
import { env, getRuntimeKey } from 'acrylblends/adapter'
```

## `env()`

The `env()` function facilitates retrieving environment variables across different runtimes, extending beyond just Cloudflare Workers' Bindings. The value that can be retrieved with `env(c)` may be different for each runtime.

```ts
import { env } from 'acrylblends/adapter'

app.get('/env', (c) => {
  // NAME is process.env.NAME on Node.js or Bun
  // NAME is the value written in `wrangler.toml` on Cloudflare
  const { NAME } = env<{ NAME: string }>(c)
  return c.text(NAME)
})
```

Supported Runtimes, Serverless Platforms and Cloud Services:

- Cloudflare Workers
  - `wrangler.toml`
  - `wrangler.jsonc`
- Deno
  - [`Deno.env`](https://docs.deno.com/runtime/manual/basics/env_variables)
  - `.env` file
- Bun
  - [`Bun.env`](https://bun.com/guides/runtime/set-env)
  - `process.env`
- Node.js
  - `process.env`
- Vercel
  - [Environment Variables on Vercel](https://vercel.com/docs/projects/environment-variables)
- AWS Lambda
  - [Environment Variables on AWS Lambda](https://docs.aws.amazon.com/lambda/latest/dg/samples-blank.html#samples-blank-architecture)
- Lambda@Edge\
  Environment Variables on Lambda are [not supported](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html) by Lambda@Edge, you need to use [Lambda@Edge event](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-event-structure.html) as an alternative.
- Fastly Compute\
  On Fastly Compute, you can use the ConfigStore to manage user-defined data.
- Netlify\
  On Netlify, you can use the [Netlify Contexts](https://docs.netlify.com/site-deploys/overview/#deploy-contexts) to manage user-defined data.

### Specify the runtime

You can specify the runtime to get environment variables by passing the runtime key as the second argument.

```ts
app.get('/env', (c) => {
  const { NAME } = env<{ NAME: string }>(c, 'workerd')
  return c.text(NAME)
})
```

## `getRuntimeKey()`

The `getRuntimeKey()` function returns the identifier of the current runtime.

```ts
app.get('/', (c) => {
  if (getRuntimeKey() === 'workerd') {
    return c.text('You are on Cloudflare')
  } else if (getRuntimeKey() === 'bun') {
    return c.text('You are on Bun')
  }
  ...
})
```

### Available Runtimes Keys

Here are the available runtimes keys, unavailable runtime key runtimes may be supported and labeled as `other`, with some being inspired by [WinterCG's Runtime Keys](https://runtime-keys.proposal.wintercg.org/):

- `workerd` - Cloudflare Workers
- `deno`
- `bun`
- `node`
- `edge-light` - Vercel Edge Functions
- `fastly` - Fastly Compute
- `other` - Other unknown runtimes keys
