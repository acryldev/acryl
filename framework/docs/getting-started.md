# Getting started

Two ways in. To use the **framework** (handlers, routing, middleware on Web Standards), run `npm create acrylblends@latest my-app` and read the
[framework documentation](framework/README.md). To build a **Blend** (a Cordis app of plugins, with an agent that can extend it while it runs), follow this page.

You need Node 22.19 or newer (Node runs the TypeScript directly, with no build step) and npm. Git, to save your app.

## Create an app

Nothing to install first: `npx` runs the `acrylblends` package from npm (to work on the framework itself, clone this repository, run `pnpm install && pnpm run build`, and use `node packages/cli/bin/acrylblends.js` in its place).

```sh
npx acrylblends@latest init my-app -y
cd my-app
npm install
npm run dev                           # the app in the ACRYL frame (chat, agents, branches, versions, Settings); prints its URL
npm run desktop                       # the same in its own window
```

`init` never writes into a directory that is not empty. The app is made in the ACRYL frame; `--bare` makes the plain app without it. `--template blank` (the default) is the smallest app; `--template agent` (or `--agent`) adds an offline scripted agent to the app itself. Each app keeps its data in `~/.acryl/apps/<id>/`.

| Template | Plugins | What it is |
|---|---|---|
| `blank` | `instance`, `acryl-router`, `acryl-node-server`, `manifest`, `save` | a Cordis app that serves routes on the router |
| `agent` | the above plus `acryl-state`, `tasks`, `agent`, `extensions`, `builder` | the same, with an offline agent that can extend the app while it runs |

Every generated app is TypeScript, has `npm test` (`node:test`) and `npm run check` (types), and depends at run time on
`@deepseek-ai/cordis` and `yaml` (plus `@deepseek-ai/schemastery` if you add `settings`).

## As a desktop app

`npx acrylblends init my-app --template todo --desktop` (or `acrylblends add desktop` in an existing app) adds `npm run desktop`: an Electron window on the app's own server, the same code as `npm run dev`. See [the desktop shell](desktop.md).

## Try the agent

```sh
curl -X POST <url>/ask -H 'content-type: application/json' -d '{"question":"create route hello /hello Hello"}'
# {"status":"completed","output":"hello: installed, active.", ...}
curl <url>/hello            # {"text":"Hello"}
curl <url>/tasks            # the run, as a durable task that owns its tool calls
```

Give it a real model (any OpenAI-compatible API) and describe what you want instead:

```sh
ACRYLBLENDS_MODEL_URL=http://127.0.0.1:11434/v1 ACRYLBLENDS_MODEL=qwen2.5-coder npm run dev    # or a hosted API with ACRYLBLENDS_MODEL_KEY
curl -X POST <url>/ask -H 'content-type: application/json' -d '{"question":"add a GET /time route that returns the time"}'
```

Either way the agent wrote a Cordis plugin into `plugins/hello/`, installed it into the running app, and checked that its route
answers before reporting it live. See [Extending a running app](agent/extending-apps.md).

## Add plugins

```sh
npx acrylblends plugins             # the library
npx acrylblends add settings        # copy one into this app, with what it requires
npm install                                                       # new dependencies, if it added any
```

Then mount it: add it to the registry in `src/app.ts` and a row in `blend.yaml`. See [The plugin library](plugins.md).

## Lock and save

```sh
npm run lock                 # blend.lock.json: what the app is built from, with digests
npm run save -- "add hello"  # git commit (and push, if there is a remote)
```

`save` refuses a file that looks like it holds a secret, and refuses to push an app that is not `visibility: public` to a
public remote. Nothing is committed when it refuses.

## Where things live

| Path | What |
|---|---|
| `blend.yaml` | the app as data: plugin rows, config, parameters ([manifest](blends/manifest.md)) |
| `src/app.ts` | the registry of plugins your code provides; mounts the manifest |
| `src/routes.ts` | your own plugin |
| `plugins/` | every plugin of the app: copied from the library (listed in `plugins/library.json`) or written by you or the agent; all yours to edit |
| `.acrylblends/` | the app's data: settings, installed-extension state, the extension ledger, task records (not committed) |

Set `ACRYLBLENDS_HOME` to keep the data elsewhere and `ACRYLBLENDS_PORT` to choose the first port tried (`0` for any free port).
Nothing else reads the environment.
