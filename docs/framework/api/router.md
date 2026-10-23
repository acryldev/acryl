# Router service

`ctx.router` (provided by `acryl-router`, config `{ trailingSlash: 'strict' | 'ignore', disposeGraceMs }`):

| Call | Purpose |
| --- | --- |
| `route/get/post/put/patch/delete/all/on/use/group` | register, see [Routing](routing.md) |
| `onError(handler)`, `notFound(handler)` | replace the default error and 404 responses (one each) |
| `fetch(request, connection?)` | run a Web `Request` in process; never throws, 503 once disposed |
| `request(path \| URL \| Request, init?, connection?)` | like `fetch` with a path, for tests and the terminal |
| `size` | routes plus middleware currently registered (leak checks) |

Web adapter (`acryl-router-http`): `ctx.routerHttp.mount(prefix)` serves `prefix` and everything below it over the `webServer`; returns a remover; also removed on unload.
