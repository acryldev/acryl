# __APP_NAME__

A Cordis app on Node, scaffolded by `acrylblends init`. TypeScript, run by Node with no build step. Every part is a
Cordis plugin.

```sh
npm install
npm run dev        # prints its URL; data lives in ~/.acryl/apps/<id>/data/; it restarts when a file changes (a new port if ACRYLBLENDS_PORT=0)
npm test
npm run check      # type-check

curl -X POST <url>/ask -H 'content-type: application/json' -d '{"question":"add 2 3"}'
# {"status":"completed","output":"The answer is 5.","steps":2}
```

- `src/main.ts` chooses where the app lives (`plugins/instance`) and starts it.
- `blend.yaml` is the app as data: which plugins it mounts, in what order, with what config and parameters. Switch
  one off with `disabled: true`. `npm run lock` writes `blend.lock.json`: the manifest's digest and a digest of
  every plugin folder, so a diff of the lock shows what changed.
- `src/app.ts` holds the registry of plugins the code provides, and mounts the manifest's rows.
- `plugins/agent` is the offline agent: a scripted model, a tool registry, memory, and one child fiber per run.
- `plugins/extensions` installs, updates and removes plugins while the app runs; a failed update keeps the previous
  version running. `plugins/builder` gives the agent tools to do that itself, writing into `plugins/`.

Give it a real model and it builds any Cordis plugin you describe (any OpenAI-compatible API; nothing is installed):

```sh
ACRYLBLENDS_MODEL_URL=https://api.deepseek.com/v1 ACRYLBLENDS_MODEL=deepseek-chat ACRYLBLENDS_MODEL_KEY=sk-... npm run dev
ACRYLBLENDS_MODEL_URL=http://127.0.0.1:11434/v1 ACRYLBLENDS_MODEL=qwen2.5-coder npm run dev     # Ollama, no key
curl -X POST <url>/ask -H 'content-type: application/json' -d '{"question":"add a GET /time route that returns the current time"}'
```

Without a model it runs offline with a scripted model that knows these commands:

```sh
curl -X POST <url>/ask -H 'content-type: application/json' -d '{"question":"create route hello /hello Hello"}'
curl <url>/hello              # {"text":"Hello"}
curl <url>/extensions         # what is installed, and its state
curl <url>/tasks              # every run as a durable task, with the tool calls it owns
```

Other commands: `update route <name> <path> <text>`, `break plugin <name>` (shows the rollback), `remove plugin <name>`,
`list plugins`. What the agent writes lands in `plugins/`, is part of your app, and starts again at the next start.
- `src/routes.ts` is your own plugin: it builds an `App` (`import { App } from './plugins/acryl-router/src/index.ts'`) and mounts it with `ctx.router.route(prefix, app)`. Routes added to the app after it is mounted are not served. A page mounted at `/x` answers `/x`, not `/x/` (trailing slashes are strict). The router API is documented at https://acrylblends.github.io/docs/framework/the-acryl-framework and in `docs/framework` of the acrylblends repository.
- `plugins/` holds the plugins copied from the ACRYLBLENDS library. They are yours now; edit them freely.
  Add more with `acrylblends add <plugin>`.

`npm run save -- "message"` commits the app with git (and pushes when it has a remote). It refuses a file that looks like
it holds a secret, and refuses to push a private app (anything but `visibility: public` in `blend.yaml`) to a public
remote.

Set `ACRYLBLENDS_HOME` to keep data elsewhere, and `ACRYLBLENDS_PORT` to choose the first port tried.
