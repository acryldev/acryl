# Extending a running app

An ACRYLBLENDS app with the `agent` template can be extended while it runs, by you or by its agent. This is ACRYL's
self-extension, extracted: in ACRYL's packaged app an agent-written plugin installs, runs, updates and is removed live
on macOS, Windows and Linux.

## An extension

An extension is a folder in an extensions source (the app's `plugins/` folder) whose name is the plugin's name, with
an `index.ts` that exports a Cordis plugin:

<!-- extension: hello -->
```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'
export const inject = ['greeting']

export function apply(ctx: Context) {
  ctx.provide('hello', `${String(ctx.get('greeting'))}, world`)
}

/** Optional: run after the plugin starts. It must pass for the install to count. */
export function check(ctx: Context) {
  if (ctx.get('hello') !== 'hi, world') throw new Error('hello is not ready')
}
```

Rules, checked before anything changes:

- the folder is inside one of the extensions sources, and its name is lowercase letters, digits and dashes;
- `index.ts` (or `.js`) exports `apply`, and `name` (when exported) equals the folder name;
- imports are relative files and packages the app already has; new npm packages need `npm install` in the app first.

The docs test installs the example above through the real `extensions` plugin, so this contract cannot drift.

## What install does

1. **Check** the folder (no code runs).
2. **Stage** a copy named by its content digest, and **import** it fresh, while the old version keeps running. An error
   here changes nothing.
3. **Start** it as a child fiber of the `extensions` plugin; the old version is disposed first.
4. **Verify**: if the plugin exports `check(ctx)`, it must pass within 10 s.
5. **Record** the result in the ledger, then answer.

If step 3 or 4 fails, the old version is started again and the answer says `restoredPrevious: true`. The answer is
always structured:

```json
{ "ok": true, "name": "hello", "action": "installed", "state": "active", "missing": [], "version": "c0ffee12ab34" }
{ "ok": false, "stage": "verify", "errors": ["its check failed: hello is not ready"], "restoredPrevious": true, "next": "..." }
```

`state` is the plugin's real Cordis state: `active`, `pending` (with `missing`: the services it waits for) or `failed`.

## Plugins and tools: two levels of trust

A **plugin** (`index.ts` exporting `apply`) is trusted code: it runs inside the app with the app's permissions, so you gate it
with approval. A **tool** is code you do not trust, such as a function an agent just wrote: it never runs inside the app.

A tool is a folder with two files, `index.ts` exporting `run(input)` and `tool.json`:

```json
{ "description": "Multiply a number by 3: input { n }.", "examples": [{ "input": { "n": 2 }, "output": { "n": 6 } }] }
```

Installing it registers an agent tool whose every call runs in the [sandbox](../plugins.md#sandbox). Its `examples` are the
install's self-check: they run in the sandbox, must match exactly, and a tool without examples is refused. A tool that tries to
read outside its folder is denied by the sandbox, fails its own example, and is never installed. Updates and rollback work as for
plugins. Scripted-model commands: `create tool <name> <factor>`, `run tool <name> <n>`, `spy tool <name>` (shows the refusal).

## Approval

Set `approval: true` in `blend.yaml` (a parameter on the `extensions` row) and an install does not run until the owner
decides. The install answers `stage: "approval"`, the request is written to the ledger, and nothing is installed. The owner
reads `GET /extensions` (`waitingForApproval`) and answers `POST /extensions/approve {"name": ...}` or
`POST /extensions/deny {"name": ...}`. Approval is for that exact version: if the source changes after the request, approving
is refused and the new version needs its own request. A version approved once starts again after a restart without asking.

## Trust

At startup, Extensions installs again what was installed, and installs new folders only from sources marked
`trust: 'install'`; folders in a source marked `trust: 'list'` are only reported (`pending()`), because code that arrived
through a `git pull` should not run until someone asks. The app's own `plugins/` is trusted: it is the app's code,
committed with it, type-checked with `npm run check`.

## The builder

The `builder` plugin gives the agent `write_plugin`, `install_plugin`, `read_plugin`, `list_plugins` and `remove_plugin`.
With a real model (the `openai` plugin), the agent builds any plugin you describe: `POST /ask {"question": "add a GET
/time route"}` makes it write the plugin, install it, read the result and fix it until it is active.
`write_plugin` only writes source files (`.ts`, `.js`, `.mjs`, `.json`, `.md`) inside one plugin folder. A real model
reads the tool descriptions; the offline scripted model knows these commands:

| Command | Does |
|---|---|
| `create route <name> <path> <text>` | writes a plugin that answers `GET <path>` with `{ text }` and checks its own route, then installs it |
| `update route <name> <path> <text>` | the same over the existing plugin |
| `break plugin <name>` | writes a version that throws, to show the rollback |
| `remove plugin <name>` | removes it and deletes its folder |
| `list plugins` | lists installed extensions and their state |

## Internal and external plugins

A plugin the agent builds lives in the app's own `plugins/` (internal). To share it, ask the agent to package it
(`package_plugin { name }`, or the scripted command `package plugin <name>`): it becomes a standalone package in
`plugin-packages/<name>/` and its release file `plugin-packages/<name>-<version>.tgz`, with `@deepseek-ai/cordis` as a peer
dependency (never a second installed copy) and the same bytes on every OS. Any app takes an external plugin in with
`acrylblends add <folder>`, which copies it into that app's `plugins/`, where it installs at the next start through the same
checks. A plugin someone released comes in live with `plugin pull github:<owner>/<repo>[@<version>][@sha256:<digest>]`.
A group's plugins come in together with `plugin pull --from <list>`: the list is a file in the app (e.g. `group.txt`) or an
https address of one (a gist's raw link), one source per line, `#` starts a comment. Each source is pulled on its own, so one
that is refused (a route or name another plugin already has, a wrong digest) is named with its reason while the others come in
and keep running; the command then fails, so a script sees it.
`npx acrylblends add showcase` gives the group's app a page at `/showcase`: a card for every plugin (name, author's GitHub
login, version, where it came from, state, and links to its pages, its home widget and its tool), updated live as plugins are
pulled and removed. `GET /showcase/plugins` answers the same cards as JSON.

## What to look at

- `GET /extensions`: what is installed, its state, and folders not installed yet.
- `<home>/extensions-ledger.jsonl`: every install, update, refusal, restore and removal, with the version's digest.
- `GET /api/state/extensions/events` and `GET /api/state/tasks/events`: the same changes as live streams (server-sent events), as they happen; `GET /api/state/<key>` reads the current value. In a page, follow a key with `import { watch } from '/api/state/client.js'` and `watch('tasks', (tasks) => ...)` (1.1.0): one WebSocket carries every key of the page, where an event stream per key would use up the browser's six connections per host.
- `GET /tasks`: every agent run as a durable task, owning one task per tool call; `POST /tasks/cancel { id }`.

Node keeps every module version it has loaded, so memory grows a little with each update until the app restarts.
