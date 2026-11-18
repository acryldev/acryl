
## This app (nodejs)

A web app: routes, a server-rendered JSX page, and a client component, all plugins of a Cordis app. `src/routes.ts` is the app's own plugin: it builds an `Acryl` app
(`pages`) and mounts it with `ctx.router.route`, and mounts `clientModules` at `/client`. `blend.yaml` lists the plugins that are mounted. `acrylblends add <plugin>` copies
another library plugin (for example `acryl-state` or `db`) into `plugins/`. Test a route by booting the app (`createApp` in `src/app.ts`, see `test/app.test.ts`) and calling it with `fetch`.

- **Client components** (run in the browser) live in `src/client/`, which has its own `tsconfig.json` (DOM types, no Node types); `clientModules` compiles them when the browser asks, and `npm run build` compiles them once into `dist/client` for production (`NODE_ENV=production` serves only that folder). See `src/client/counter.tsx` and `docs/framework/guides/client-modules.md`.
- The server listens on `127.0.0.1`; `PORT` chooses the port and `HOST=0.0.0.0` is for a container only.
