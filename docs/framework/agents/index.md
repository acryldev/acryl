# Agents

A coding agent (Claude Code, Codex, OpenCode, Copilot and others) builds on Acryl best when the documentation is in the folder it works in. A project created with
`npm create acrylblends@latest` (and one made with `npx acrylblends init`) therefore contains:

- `docs/framework/`: these pages. Start at `README.md`; `api/summary.md` is the one-page summary of the API.
- `AGENTS.md`: where the API is, how a feature is built (an `Acryl` app mounted with `ctx.router.route`, a plugin registered in `src/app.ts` and `blend.yaml`, a state cell),
  the defaults and how each is swapped, the things that surprise people, and what must pass before a task is done (`npm test` and `npm run check`).
- `CLAUDE.md`: the same text as `AGENTS.md`, so tools that read either file read the same guide.
- One skill, `app-guide`, in `.claude/skills/app-guide/SKILL.md` and `.agents/skills/app-guide/SKILL.md` (the same text): where to read first, the one plugin folder, the defaults, the door, and what "done" means.
- `.gitignore` lists `.acryl/`, the folder the door keeps its secret and state in, so `git add -A` stages none of it.

## One plugin folder

Every plugin of an app is a folder in `plugins/<name>/`, at the root of the app: the library plugins `acrylblends add <name>` copies (listed in `plugins/library.json`), and the
plugins you or an agent write. There is no `src/plugins/` and no `extensions/`. An app made before this layout keeps working for one release: the CLI reads its `src/plugins/` and
`extensions/` and warns; move them with `git mv src/plugins plugins`, fix the paths in `tsconfig.json`, `package.json` and `src/`, and `git mv extensions/<name> plugins/<name>`.

## Defaults, and how to swap each

The framework is not rigid: every choice is a plugin behind a port, and the default is only a fallback. A new app names each default in `AGENTS.md`: records on the `db` port
with SQLite, small state on the `kv` port with one JSON file, the Node server, the browser as the window (`acrylblends add desktop` adds Electron), browser code through
`clientModules`. A swap changes the one file that opens or mounts the choice (the opener, `src/db.ts`; or `src/app.ts` in a Blend app), because nothing else imports a provider
(`acrylblends check-deps` checks it). An outside tool, such as a database server or a bundler, joins the app as a provider in `plugins/<name>/` that implements the port.

## What an agent can do inside a running app

The `acryl-app` template (a Cordis app) also lets an agent change the app while it runs:

1. The agent writes a plugin into `plugins/<name>/index.ts`. The plugin may import `acrylblends` and the other subpaths by name.
2. The app installs it as a child plugin, runs its `check(ctx)` with the plugin's own context, and keeps the previous version if the new one fails to start or to pass its check.
3. A plugin's routes are an `Acryl` app mounted with `ctx.router.route`, so removing the plugin removes its routes.

See [Acryl in a Cordis app](../cordis/acryl-in-a-cordis-app.md), [Plugin lifecycle](../cordis/plugin-lifecycle.md) and [Mounting](../cordis/mounting.md).

## Checking that an agent can use the docs

The repository has a manual gate: it creates a fresh app, starts a headless coding agent inside it with a one-line task (for example "add a /customers/count route with a test"),
and checks that the app's tests and type-check pass afterwards and that the route answers.
