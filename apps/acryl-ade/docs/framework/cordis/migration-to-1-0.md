# Migration to 1.0

1.0 fixes the public surface of `acrylblends` and gives an app a way to move its copies of the framework plugins forward. This page is the one path from any 0.x app that was made by 0.9.1 or later; an older app is best made again with `npm create acrylblends@latest` and its own code moved over (its routes and plugins are plain `Acryl` code and Cordis plugins).

## 1. Upgrade the app's copies of the framework plugins

An app made by `acrylblends init` carries copies of the framework plugins (`acryl-router`, `acryl-node-server`, `acryl-door`, `extensions`, ...) in `plugins/`. `acrylblends upgrade` brings them to the version of the installed package:

```sh
npx acrylblends@latest upgrade --dry-run   # what would change, and the diff of every file you edited
npx acrylblends@latest upgrade             # do it
npm install && npm run check && npm test
```

**Write `@latest`.** A bare `npx acrylblends upgrade` runs the `acrylblends` the app has installed, and an app made before 1.0 has a 0.x copy with no `upgrade` verb. It does not upgrade anything: depending on the platform and the version it prints its old help and exits 0 (so nothing happens and nothing says so), or answers "unknown command" and exits 2. `npx acrylblends@latest` fetches the current package and runs that. (After the first upgrade the app depends on 1.x, and the bare form works too.)

- A file nobody edited is replaced. A file the app edited stops the upgrade: nothing is changed, the diff of what would be lost is shown, and the command exits 1. Move your change out of the plugin (a plugin of your own in `plugins/<name>/` is never touched), or run `npx acrylblends upgrade --force`, which saves the edited versions in `.acrylblends/upgrade-backup/<time>/` before replacing them.
- `--diff` prints the diff of every changed file, not only the edited ones. `acrylblends upgrade acryl-router extensions` upgrades only those plugins.
- A file of your own inside a library plugin folder (a note, a test) is kept and reported. A plugin that a newer version needs and the app lacks is added.
- How it tells an edit from an untouched file: since 1.0 `acrylblends init` and `add` record the hash of every copied file in `plugins/library.lock.json`; for an app made earlier, the package knows the hashes of the released versions (0.9.1, 0.9.2, 0.10.0, 0.11.0). A file that matches neither counts as edited, so a doubt always stops the upgrade instead of overwriting.
- `package.json` gets the new `acrylblends` range when it has one, and the dependencies the new plugin versions need (existing ones are kept; run `npm install`).

## 2. What changed in the public surface

| Removed or changed | Do this |
| --- | --- |
| `App` and `AppRequest` (the 0.4 names, deprecated since 0.5) are removed | `Acryl` and `AcrylRequest`: `import { Acryl } from 'acrylblends'` |
| `acrylblends/utils/*` and `acrylblends/acryl-base` are internal, not exported | Use the public helpers (`acrylblends/cookie`, `acrylblends/http-exception`, ...); the utilities are not promised |
| The adapters for AWS Lambda, Lambda@Edge, Cloudflare Workers and Pages, Vercel, Netlify and Service Workers are not exported | An app is plain `fetch` code (`app.fetch(request)`), so a platform that calls a `fetch` handler can call it. Their ported sources stay in the repository; they may return as separate plugins, each with a gate. See [Other runtimes](../getting-started/other-runtimes.md) |
| `acrylblends/bun` is experimental | The one Bun gate runs it on Bun; no promise beyond that |
| The door (`door/*`, `cordis/door`), the agent panel and the PTY driver are experimental and development-only | They start nothing with `NODE_ENV=production` (the door plugin now checks it itself; `allowInProduction: true` for a host that means it); see [what runs in production](../guides/production.md) |
| `HTTPException` is `acrylblends/http-exception`, not the root | `import { HTTPException } from 'acrylblends/http-exception'` |
| `acrylblends/cordis/*` are the published forms of the framework plugins | In code that uses the package (not an app's own copies), import `acrylblends/cordis/router` where an old guide wrote `acryl-router` |
| One template list: `blank`, `nodejs`, `notes`, `chat`, `todo`, `agent` in both `create-acrylblends` and `acrylblends init` | `acryl-app` still means `agent` |

Node.js 22.19 or newer. Bun is optional and experimental; Deno is not supported.

## 3. Check

```sh
npx acrylblends check-deps
npm run check
npm test
```

An app on the vendored plugins keeps working without the package's own newer subpaths; moving to the package's `acrylblends/cordis/*` forms in place of the copies is a separate, optional step.
