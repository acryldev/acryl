# Migration from 0.4

0.5 gives the framework its public names: the application class is `Acryl` and the request class is `AcrylRequest`, the upstream names
with the project renamed. Everything else (`Context`, `HTTPException`, the middleware, the helpers, `ctx.router.route(path, app)`) is
unchanged.

| 0.4 | 0.5 |
| --- | --- |
| `import { App } from '@acryldev/router'`, `new App()` | `import { Acryl } from '@acryldev/blends/cordis/router'`, `new Acryl()` (`App` and `AppRequest` are removed in 1.0) |
| `AppRequest` | `AcrylRequest` |

`App` and `AppRequest` still work in 0.5, marked deprecated, and are removed in the next release. Code outside Cordis imports the same
names from the public package: `import { Acryl } from '@acryldev/blends'`, and each upstream subpath under it (`acrylblends/cors`,
`acrylblends/jwt`, `acrylblends/node-server`).
