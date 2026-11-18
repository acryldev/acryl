---
name: acryl-app
description: How the __APP_NAME__ app is put together - its blend.yaml rows, its plugins/ folder and src/ - and how to change it, run it and check it through the door. Use before adding a feature, a route, a plugin or a dependency to this app, and before saying the work is done.
---

# Working in __APP_NAME__

1. **Read first.** `AGENTS.md` (the same text as `CLAUDE.md`) is the app's guide. The framework's API is in `docs/framework/`: start at `docs/framework/README.md`, and `docs/framework/api/summary.md` is the one-page summary. Parts the docs mark "not yet available" are not in this app.
2. **The app is data plus code.** `blend.yaml` is the blueprint: which plugins (rows) the app mounts, in what order, with what config. `src/app.ts` is the runtime: a row's `name` is a library plugin its `registry` imports or a folder `plugins/<name>/` of the app's own, and `compose` starts them in row order. `src/routes.ts` is the app's own `Acryl` app (its page and API). A plugin the app owns is a folder `plugins/<name>/`.
3. **Make the change small.** A route is a handler on the app's `Acryl` app mounted with `ctx.router.route('/', app)`; test it with `await app.request('/path')`. Write the app's own paths: the frame that hosts the app adds its canvas prefix to every plugin route (`/board` answers `/board` under `npm start` and `/app/board` in the canvas), so never put the prefix in a route. Every feature is a Cordis plugin: a `plugins/<name>/` folder plus its row in `blend.yaml` (see the acryl-build-plugin skill); `src/app.ts` and `src/routes.ts` are never touched for a feature. `npx acrylblends add <name>` copies a library plugin there.
4. **Defaults are swappable.** The database, the key-value store, the server and the window are plugins behind ports; the table "Defaults you can swap" in `AGENTS.md` names each default and where it is swapped. Never reach around a port to a driver: `npx acrylblends check-deps` fails the check.
5. **Look at the running app.** In development the app writes `.acryl/bin/acryl`: `acryl brief` says what this folder runs, `acryl look` shows the open page as text with refs, and `acryl act click|type|select|press|scroll|wait|navigate|reload` acts on it. Look again before each act, because the refs change. This is the app's control surface: use it instead of guessing what the page shows.
6. **Done means checked.** `npm test` passes, and the change shows in the running app. No secret goes in a file or in `git status`: keys come from environment variables.
