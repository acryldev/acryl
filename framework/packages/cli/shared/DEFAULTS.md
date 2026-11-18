
## Defaults you can swap

The framework is not rigid. Every choice is a plugin behind a port, and what the app starts with is only a fallback. Name the default before you change it,
and swap it at the one place that mounts it.

| Choice | Default | To swap it |
| --- | --- | --- |
| Records | the `db` port on SQLite (already mounted in the notes and chat templates; elsewhere `npx acrylblends add db`) | mount another provider of `db` in `src/app.ts`; plugins use `ctx.db` and do not change |
| Small state | the `kv` port on one JSON file (`npx acrylblends add kv`) | mount `acryl-kv-db` (the same port over `db`) or a provider of your own |
| Server | Node (`acryl-node-server`) | mount the adapter of another runtime in `src/app.ts` |
| Window | the browser | `npx acrylblends add desktop` adds an Electron window on the same server |

- **An outside tool** (a database server, a bundler, a router such as Vike) joins the app as a provider: a plugin in `plugins/<name>/` that implements a port and
  passes that port's conformance tests, then `src/app.ts` mounts it. Postgres is such a provider and is not part of this package; add it when the app needs it.
- **The dependency rule:** only the file that mounts a provider imports it; everything else takes the port as an argument or injects it. `npx acrylblends check-deps` enforces it.

## Plugins

There is one plugin folder: `plugins/` at the root of the app. A plugin is a folder `plugins/<name>/` with an `index.ts`. `npx acrylblends add <name>` copies a library
plugin there; a plugin you or an agent write goes there too (the `extensions` plugin installs it into the running app, and `plugins/library.json` lists the copies it must not
install a second time). Do not create `src/plugins/` or `extensions/`.

## The door

The door is a command in this folder, `.acryl/bin/acryl`, that lets you look at and change the running app. The running app writes it, and it reaches only the app running from this folder. Its state (a secret and an audit log) lives under `.acryl/`, which git ignores: never commit it. It is on in development and off with `NODE_ENV=production` or `ACRYL_DOOR=off`; one process at a time serves a folder's door, so a second `npm start` in the same folder stops with a message that says so (the tests set `ACRYL_DOOR=off`). If `.acryl/bin/acryl` is not here, the app is not running: start it with `npm run dev` (in the background) and open its address in a browser.

```
.acryl/bin/acryl brief                      what this app is: its address (curl a new route there), where the docs are, the verbs, and whether a page is open
.acryl/bin/acryl look                       the page as text, with refs (1.1, 1.2, ...): roles, names, values, visible text
.acryl/bin/acryl act click --ref <r>
.acryl/bin/acryl act type --ref <r> --text <t> [--submit] [--no-clear]
.acryl/bin/acryl act select --ref <r> --option <o>
.acryl/bin/acryl act press --key <Enter|Escape|...>
.acryl/bin/acryl act scroll [--ref <r>] --direction up|down [--amount <n>]
.acryl/bin/acryl act wait (--text <t> | --role <role> [--name <n>]) [--gone] [--timeout-ms <ms>]
.acryl/bin/acryl act reload                 reload the page; answers once the new page is back
.acryl/bin/acryl act navigate --path <path> go to another path of the app, e.g. /settings (never another site)
.acryl/bin/acryl plugin list | add <folder> | remove <name> | reload
.acryl/bin/acryl tool list | call --tool <name> --args '<json>'
.acryl/bin/acryl verbs                      the verb list
```

- **Check your own UI work with `look` and `act`.** After you build or change something people see, open the page and use it the way a person would: look, click through the new feature, look again, and say what you saw. A plugin you add, remove or reload with `plugin add|remove|reload` reloads the open pages by itself and the verb answers once they are back; after you change any other file (`src/`, a page) run `act reload`, then `look`. A page is a path of the app: `act navigate --path /demo`.
- The door's page script is added to every HTML page in development, so a page you write needs no tag for `look` and `act` to see it.
- `look` and `act` need the app's page open in a browser (`brief` says `Page: not open` when it is not). Look again before each `act`: refs belong to the latest `look`.
- A password field is not shown and cannot be typed into through the door; sign in by hand, or test the sign-in with a test.
- Every verb takes `--json`. The exit code is 0 for done, 1 when the verb failed, 2 for a usage error and 3 when no app is running in this folder.
- `plugin add plugins/<name>` checks the plugin, installs it and makes it live without a restart (the `extensions` plugin does this; every template that has the door has it, in development only: it is left out with `NODE_ENV=production`). `tool call` reaches only the tools on the door's allowlist (empty by default). On Windows the command is `.acryl\bin\acryl.cmd`.
