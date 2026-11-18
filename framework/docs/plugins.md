# The plugin library

Each plugin is plain Cordis code in `plugins/<name>/` of this repository. `acrylblends init` and `acrylblends add` copy it into
your app's `plugins/<name>/` with the plugins it requires. Every one is tested in this repository with `node:test`
against a real Cordis context, including disposal.

| Plugin | Service | From ACRYL |
|---|---|---|
| [instance](#instance) | `appInstance` | `runtime/acryl-harness-runtime/src/instance/` |
| [acryl-router](#the-framework-plugins), [acryl-router-http](#the-framework-plugins), [acryl-node-server](#the-framework-plugins), [acryl-state](#the-framework-plugins), [acryl-inspect](#the-framework-plugins) | `router`, `nodeServer`, `state`, `inspect` | `plugins/acryl-*` (the ACRYL framework) |
| [settings](#settings) | `settings` | `plugins/acryl-settings` |
| [extensions](#extensions) | `extensions` | `plugins/acryl-extension-context` |
| [builder](#builder) | tools for the agent | the agent's install tools |
| [sandbox](#sandbox) | `sandbox` | - |
| [agent](#agent) | `agent`, `model`, `tools`, `memory` | - |
| [openai](#openai) | `model` (a real one) | - |
| [tasks](#tasks) | `tasks` | idea from Pi Durable |
| [manifest](#manifest) | functions, no service | `runtime/blends-core` |
| [save](#save) | a tool for the agent | `runtime/app-persistence` |
| [agent-panel](#agent-panel) | `drivers` (a chat panel in the page) | - |
| [driver-pty](#driver-pty) | none (terminal drivers for the panel) | node-pty, xterm.js |
| [driver-acp](#driver-acp) | none (chat drivers for the panel) | - |

## instance

Where the app keeps things, decided once. `selectInstance({ projectRoot, env })` is the only code that reads the
environment; it returns a frozen `AppInstance` with `root` (the project folder), `home` (`<project>/.acrylblends`, or
`ACRYLBLENDS_HOME`), and a port preference: a stable port per app in 3100-3999 that moves to the next free one, or
`ACRYLBLENDS_PORT`. Two folders with the same name are different apps. Mount it first: `root.plugin(instance, chosen)`.

## The framework plugins

`acryl-router` (`ctx.router`: mounts an `App` with `route(prefix, app)`, with the ported core's routing, middleware and validators, and an in-process `request()`), `acryl-node-server` (one `node:http` listener that sends every
request to the router; config `{ port, hostname, scan, websocket }`, provides `ctx.nodeServer.url` and `ctx.nodeServer.upgrades()` for WebSocket routes, see [node-server](framework/cordis/node-server.md#websocket-upgrades)), `acryl-state` (observable cells, read as JSON and streamed as server-sent
events at `/api/state/<key>` and `/api/state/<key>/events`, and followed in a page over one WebSocket with `watch` of `/api/state/client.js`), `acryl-inspect` (what every plugin requires, provides and registers) and `acryl-router-http` (mounts router prefixes on the ACRYL Host's web server, with `mount(prefix, { upgrade: [paths] })` for WebSocket upgrades owned by the mounting plugin) are ACRYL's framework, vendored here as they are. Their text is in [framework/](framework/README.md); their source is
`plugins/acryl-*`, whose source lives in this repository (with the history it had in ACRYL); `acrylblends init` and `add` copy their `src/` into an app.

`acryl-db` (the `db` port: types, numbered migrations) and `acryl-db-sqlite` (the SQLite provider; one `node:sqlite` file, `data.sqlite` in the app home unless `path` is set,
the app's `migrations/` folder applied on start) come with `acrylblends add db` in a Blend app. A plugin declares `inject: ['db']` and calls `await ctx.db.all('SELECT ...', value)`;
the interface is the one in the [data guide](framework/guides/data.md). A plain Acryl app opens its database with `openDb` from `acrylblends/db/sqlite` instead.

## settings

`ctx.settings.register(namespace, schema, { base, applies, validate })` returns a scope with `get`, `watch`, `update`
and `replace`. The value layers the schemastery schema's defaults, then `base`, then what is stored in
`<home>/settings.yaml`. Writes are validated, atomic and run one at a time; watchers and the `settings/updated` event see
them in order; an unchanged value notifies nobody; pending writes settle on dispose.

## extensions

**Experimental, development only** (see [what runs in production](framework/guides/production.md)): the web templates leave it out with `NODE_ENV=production`. Installing is a correctness check, not a security boundary: the plugin's code runs in the app's process with the app's permissions.

Install, update, remove and reload Cordis plugins while the app runs: `ctx.extensions.install(folder)`, `remove(name)`,
`reload()`, `list()`, `pending()`, `ledger()`. A failed update brings the previous version back. Config: `{ sources: [{
dir, trust: 'install' | 'list' }] }`. Details in [Extending a running app](agent/extending-apps.md).

## sandbox

For tools an agent writes, not for plugins installed live (those run in the app's process). `ctx.sandbox.run(entry, input, { timeoutMs, memoryMb, read })` runs a file that exports `run(input)` in a separate Node process
under the permission model (`node --permission`): it can read only its own folder; it cannot write files, start processes or
workers, or load native addons; it gets an empty environment; it is killed after a time limit and capped in memory and output.
It never throws: failures are results (`denied`, `timeout`, `output`, `crash`, `error`). **It does not block the network**: Node 24
has no network permission, so restrict egress outside the process where that matters.

## builder

**Experimental, development only.** Gives the agent tools over Extensions: `list_plugins`, `read_plugin`, `write_plugin`, `install_plugin`, `remove_plugin`.
Writes are confined to one extensions folder (`{ dir }`, which must be an extensions source) and to source files. It
teaches the scripted model commands (`create route <name> <path> <text>`, `update route ...`, `break plugin <name>`,
`remove plugin <name>`, `list plugins`) so the whole loop runs offline.

## agent

`model` (a scripted, offline model; other plugins `teach` it rules), `tools` (a registry; a tool registered inside
`ctx.effect` leaves with its plugin), `memory`, and `agent`: `ctx.agent.run(question)` runs a loop in its own child fiber
with a step budget (`{ steps }`), and returns the answer with a trace of every tool call. A failing tool is reported to
the model, not thrown. Replace `model` with a real provider: it only has to implement `complete({ question, step,
toolResult })`.

## openai

A real model for the agent: any OpenAI-compatible chat API (OpenAI, DeepSeek, Ollama, LM Studio) over `fetch`, with tool
calls, and no SDK. It provides the same `model` service, so nothing else changes. Its system prompt teaches the model the
extension contract. In the `agent` template, set `ACRYLBLENDS_MODEL_URL`, `ACRYLBLENDS_MODEL` and (for hosted APIs)
`ACRYLBLENDS_MODEL_KEY`; `main.ts` reads them and swaps the scripted model for this one.

## tasks

Records live in a store behind a small interface (`load`, `append`, `close`): a JSON lines file by default, or a SQLite file
(`store: sqlite`, using Node's built-in `node:sqlite`, with full-durability writes). Both pass the same conformance suite, and the
whole tasks test file runs against each. In the agent template this is the `taskStore` parameter of `blend.yaml`.

Durable task records: `ctx.tasks.start(kind, input, { parent })` returns a handle with `complete`, `fail`, `progress` and
an abort `signal`. Every change is appended to `<home>/tasks.jsonl` before the call returns. `cancel(id)` cancels the
tasks it owns too. After a crash, a task that was running is marked `interrupted` and is never run again on its own,
because a side effect may already have happened. When `tasks` is mounted, every agent run is a task owning one task per
tool call. With `acryl-state` mounted, the latest tasks are also the state cell `tasks`, and the installed extensions the cell `extensions`: read them at
`/api/state/tasks` and stream them at `/api/state/tasks/events` (or follow them in a page with `watch('tasks', fn)` from `/api/state/client.js`).

## manifest

Reads and validates `blend.yaml`, ACRYL's Blend format: Blueprints, and Blends that resolve over them (`lineage`, `extends`, `overrides`), plus `planUpgrade` for moving a Blend to a newer Blueprint.

`loadManifest(file, { known, values })`, `validate(document, known)`, `compose(root, manifest, registry, overrides)`,
`lock(manifest, sources)`, and `npm run lock`. See [The app manifest](blends/manifest.md).

## save

`saveApp` over two ports (git and the hosting service), the secret scan, `npm run save`, and a `save_app` tool when the app
has a tool registry. It never reads, stores or asks for a token: git and gh use your own credential helpers.

## agent-panel

**Experimental, development only** (it does nothing with `NODE_ENV=production`; see [what runs in production](framework/guides/production.md)). A chat panel inside the running app (spec 049 slice 14). an app made from the `agent` template has it (`npx acrylblends add agent-panel` copies it, with the agent family it needs, into an older one); add a row
`- id: agent-panel` / `name: agent-panel` to `blend.yaml` **before** the `routes` row and `'agent-panel': panel` to the registry in `src/app.ts` (the line `acrylblends add` prints). Open the app in a browser:
a button at the corner opens a side panel. Write what you want; the panel's agent builds it **through the same door** (`.acryl/bin/acryl`, see the app's `AGENTS.md`), and when a plugin was installed or
removed the page reloads, so the feature shows with no restart.

- **Drivers.** The panel provides a `drivers` registry (the contract is `acrylblends/drivers`); every driver is one of two kinds, `chat` (a message in, text and tool events out) or `terminal` (a real terminal, see [driver-pty](#driver-pty)); the panel shows the chat or the terminal by kind. The select in the panel offers the app's own agent (`agent`: the offline scripted model, or a real one from `OPENAI_*` / `DEEPSEEK_API_KEY`, with the `builder` tools and the `door_*` tools),
  and each of `claude`, `codex` and `pi` that is installed on the machine (`pi` also needs `DEEPSEEK_API_KEY`), started headless in the app folder with your message as its prompt. A key is read from the environment the
  app was started in and is never stored.
- **Safety.** Development only: it does nothing with `NODE_ENV=production` or `ACRYL_DOOR=off`. A page gets a token from `GET /api/agent-panel/session`, which answers only the app's own page (`Sec-Fetch-Site:
  same-origin`, or an `Origin` equal to the `Host`); `POST /api/agent-panel/ask` needs that token, and one run goes at a time. Every ask is written to `.acryl/audit/agent-panel.jsonl` without its text.
- **Where the routes are.** The panel lives under the app's mount: at the root of the app's own server, and under the prefix a host serves the app at. The row's `mount` config names
  it (the same rule `clientModules` takes), and the `agent` template's composition passes `FRAME_MOUNT_PREFIX` (`/app`) when the ACRYL frame hosts the app, so the panel is at
  `/app/api/agent-panel/...` there and the host's own `/api` routes never answer for it. A composition that serves the app at a prefix must set `mount` to it, or the panel's
  routes land at the root and no page under the prefix can reach them.
- **Stop.** For `claude`, `codex` and `pi` the button ends the program. For the app's own agent, Stop cancels the run: the model call or tool in flight is dropped and the run ends `cancelled` (`agent.run(question, { signal })`; a task record, when the app records tasks, is marked failed).
- The gate: `node scripts/verify-agent-panel.mjs [--driver claude|codex|pi]` adds the panel to a fresh `agent` app, opens it in headless Chrome, sends "create route hello /hello Hello" from the panel, and checks that `/hello`
  answers, the page reloaded, and the process is the same one.

## driver-pty

**Experimental, development only** (it does nothing with `NODE_ENV=production`; see [what runs in production](framework/guides/production.md)). A coding agent in a real terminal inside the running app (M8). `npx acrylblends add driver-pty` copies the plugin (and installs `node-pty`) into an app that has [agent-panel](#agent-panel); add a row
`- id: driver-pty` / `name: driver-pty` to `blend.yaml` **after** the `agent-panel` row and `'driver-pty': driverPty` to the registry in `src/app.ts`. The panel then offers `pty:claude`, `pty:codex` and
`pty:pi` (the ones installed on the machine) next to its chat drivers; choosing one swaps the chat for the program's own terminal (xterm.js), in the app folder with `.acryl/bin` on its `PATH`, so the agent
works in its interactive mode and acts through the door as the headless drivers do. `config.programs` (`{ node: ['agent.mjs'] }`) offers other programs as `pty:<name>`.

- **Transport.** Server-sent events down, POST up (no WebSocket): `POST /api/driver-pty/sessions`, `GET /api/driver-pty/<id>/output` (events with ids; a reconnect replays from `Last-Event-ID` out of a
  64 KB ring buffer), `POST .../input` (keystrokes batched per animation frame), `.../resize`, `.../stop`. The same own-page check and token as the panel; one terminal at a time.
- **Where the routes are.** Like the panel, the terminal lives under the app's mount: the row's `mount` config names it, and the `agent` template's composition passes `FRAME_MOUNT_PREFIX`, so under the
  frame the routes are at `/app/api/driver-pty/...` rather than at the host's own `/api`. Each terminal driver carries its view with it (`view: { module, prefix }` in `acrylblends/drivers`), so the panel
  loads the terminal module and calls its endpoints at the mounted path instead of assuming the root.
- **Reload.** When a plugin is installed or removed while the terminal is open the page reloads, and the panel shows the same terminal again with its output.
- **Disposal.** Every process is started inside one `ctx.effect`; its disposer ends the process group (the console on Windows), closes the streams and writes the audit line (`.acryl/audit/driver-pty.jsonl`,
  never the keystrokes). Unloading the plugin leaves no process behind. Development only, like the panel.
- **No PTY here.** `node-pty` ships prebuilds for macOS, Linux and Windows; if it cannot load (a sandbox that forbids PTYs) the plugin logs why and offers no `pty:*` driver.
- The gate: `node scripts/verify-driver-pty.mjs` adds both plugins to a fresh `agent` app, opens the terminal in headless Chrome, and a scripted program in the PTY installs a plugin through the door; the page
  reloads and re-attaches. `pnpm run test:driver-pty` runs the plugin's tests with a real PTY on Linux, macOS and Windows. Design: [the PTY driver plan](plans/pty-driver.md).

## driver-acp

**Experimental, development only** (it does nothing with `NODE_ENV=production`; see [what runs in production](framework/guides/production.md)). Any agent that speaks the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP v1 over stdio) as a chat in the [agent panel](#agent-panel) (M8). `npx acrylblends add driver-acp` copies the plugin into an app that has the
panel; add a row `- id: driver-acp` / `name: driver-acp` to `blend.yaml` **after** the `agent-panel` row and `'driver-acp': driverAcp` to the registry in `src/app.ts`. The panel then offers `acp:<name>`
for each agent whose command is on the machine.

- **Presets, no agent code.** An agent is a command line that starts its ACP server. `dsh` (DeepSeek Harness, `dsh --profile acp`) is the first preset; `config.agents` replaces the presets
  (`{ 'my-agent': { command: 'my-agent', args: ['--acp'] } }`, with an optional `env` added to the app's environment). A key the agent needs is read from the environment the app was started in.
- **Session.** The agent starts in the app folder at the first message and keeps one ACP session, so later messages continue the conversation; an agent that ended starts again at the next message. One
  message runs at a time.
- **Events.** The agent's message chunks are `text`, each finished tool call is one `tool` (its title, input, and result or error), and a turn that stops short (a refusal, a token or request limit,
  an agent that ended) is an `error` with the reason. Thoughts and plans stay out of the chat.
- **Stop and permissions.** Stop sends `session/cancel`. A permission request gets the agent's own "reject once" option, or "allow once" with `config.permissions: 'allow'`.
- **Disposal.** Every agent process is started inside one `ctx.effect`; its disposer closes the process's stdin, then sends SIGTERM, then kills it (the whole tree on Windows). Unloading the plugin
  leaves no process behind.
- **Not on the machine.** An agent whose command is not on the `PATH` gets no driver, and the plugin logs one line saying so.

## desktop

An Electron window on the app's own server. `acrylblends init my-app --desktop` (or `acrylblends add desktop` in an existing app) adds `plugins/desktop`, `electron` as a development
dependency and the script `npm run desktop`. `npm run desktop` picks the app's instance as `npm run dev` does, keeps Electron's user data inside the app's own home (`.acrylblends/electron`,
never the user's application-data folder), starts `createApp` in the Electron main process, opens one window with a locked-down renderer (context isolation, no Node, sandbox) on the app's address
(`/todo` for the todo template: `acrylblends.desktopPath` in `package.json`), keeps navigation on the app's own origin (other links open in the system browser), and ends the process when the window
closes, after the server stopped. A second launch of the same app focuses the first. The app's own code never imports `electron`; only `plugins/desktop` does. `user-data.ts` and `shutdown.ts` came
from ACRYL Desktop. Run from source only for now; packaging a distributable app is not part of it. `npm install` does not download Electron's binary (Electron 44 dropped its install script): the
`electron` command downloads it the first time `npm run desktop` runs (about 100 MB, once per machine; `ELECTRON_MIRROR` and `ELECTRON_CACHE` apply). If that download is blocked, run `npx install-electron` where you can reach the mirror.
