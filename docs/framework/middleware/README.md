# Middleware and helpers in the box

From `acryl-router/middleware`:

| Name | What it does | Options |
| --- | --- | --- |
| `bodyLimit` | refuses a declared body over the limit (413) and makes `read*` enforce it | `maxBytes`, `onError` |
| `cors` | CORS headers; answers preflight with 204 | `origin`, `allowMethods`, `allowHeaders`, `exposeHeaders`, `maxAge`, `credentials` |
| `logger` | one line per request to a sink | the sink function |
| `loopbackOnly` | allows only loopback peers to this app's own `Host`; mutations need a same-origin `Origin` | `hostnames`, `mutations`, `inProcess` |
| `requestId` | reads or makes an id; `c.get('requestId')` and a response header | `header`, `generate` |
| `secureHeaders` | hardening headers (nosniff, frame, referrer, CORP) | `headers` |

From `acryl-router/helpers`:

| Name | What it does |
| --- | --- |
| `readJson`, `readText`, `readBytes` | bounded body reads (413 / 400 as `HttpError`) |
| `streamSSE` | server-sent events with guaranteed cleanup and a 15 s keepalive |
| `validate`, `valid` | Standard Schema validation of `json`, `query`, `param` |

Not built (add as plugins when needed): jwt, basic-auth, etag, compress, cache, csrf.
