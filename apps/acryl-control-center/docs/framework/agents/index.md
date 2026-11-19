# Agents

A coding agent (Claude Code, Codex, OpenCode, Copilot and others) builds on Acryl best when the documentation is in the folder it works in. A project created with
`npm create acrylblends@latest` (and one made with `npx acrylblends init`) therefore contains:

- `docs/framework/`: these pages. Start at `README.md`; `api/summary.md` is the one-page summary of the API.
- `AGENTS.md`: where the API is, how a feature is built (an `Acryl` app mounted with `ctx.router.route`, a plugin registered in `src/app.ts` and `blend.yaml`, a state cell),
  the defaults and how each is swapped, the things that surprise people, and what must pass before a task is done (`npm test` and `npm run check`).
- `CLAUDE.md`: the same text as `AGENTS.md`, so tools that read either file read the same guide.
- Two skills, `acryl-app` and `cordis-plugin`, in `.claude/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` (the same text in both places): how the app is put together and how to change and check it through the door, and how to add a feature as a Cordis plugin.
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

The `agent` template (a Cordis app; `acryl-app` is its old name and still works) also lets an agent change the app while it runs:

1. The agent writes a plugin into `plugins/<name>/index.ts`. The plugin may import `acrylblends` and the other subpaths by name.
2. The app installs it as a child plugin, runs its `check(ctx)` with the plugin's own context, and keeps the previous version if the new one fails to start or to pass its check.
3. A plugin's routes are an `Acryl` app mounted with `ctx.router.route`, so removing the plugin removes its routes.

See [Acryl in a Cordis app](../cordis/acryl-in-a-cordis-app.md), [Plugin lifecycle](../cordis/plugin-lifecycle.md) and [Mounting](../cordis/mounting.md).

## The agent panel and the terminals

The panel is a chat button on every page of the running app. **A new app from the `agent` template has it** (`npm create acrylblends@latest my-app agent`), and `driver-pty` adds real terminals to it. Both are **development only** (see [what runs in production](../guides/production.md)).

```sh
npm create acrylblends@latest my-app agent
cd my-app
npm install
npm run dev          # the panel is the button at the corner of the page
npx acrylblends add driver-pty   # optional: real terminals (pty:claude, pty:codex, pty:pi) in the panel
npm install
```

- The panel needs the `agent` and `extensions` rows, which only the `agent` template has: `add agent-panel` on an app without them (a `blank` app) refuses before it copies anything and says which rows are missing, and on an `agent` app it says the panel is already there. An agent-template app made before 1.0.5 gets it with `npx acrylblends add agent-panel`.
- `add driver-pty` puts the driver's row after the panel's in `blend.yaml` and registers it in `src/app.ts`.
- A **run belongs to the app, not to the page**: when the page reloads (the door reloads it after a plugin change) the panel shows the question and the events so far and follows the run to its end; **Stop** is the only thing that cancels it.
- **The panel's coding agents are yours.** `claude`, `codex` and `pi` run on the machine that runs the app, in the app folder, with the login of the person who started it: `claude` and `codex` use their own signed-in sessions, and `pi` is offered when `DEEPSEEK_API_KEY` is set or `pi` has stored a DeepSeek login (`~/.pi/agent/auth.json`, read from the `HOME` of the process that runs the app: an app started under another `HOME` does not see the login, and the panel then lists `pty:pi` but no chat `pi`). A program that is not installed, or is not logged in, is not offered; nothing is shared between machines, and a workshop laptop needs its own login. The panel's own `agent` (the offline scripted one) needs none.
- `pi` has to be an executable on the `PATH`; a shell function that wraps the binary is fine as long as the binary itself is found by `which pi`. Install it with `npm i -g @earendil-works/pi-coding-agent` (the older `@mariozechner/pi-coding-agent` is deprecated). It reaches DeepSeek with `DEEPSEEK_API_KEY` in the environment of the app, or with the key it stored when its owner logged in (`~/.pi/agent/auth.json`, a `deepseek` entry); without one the panel does not offer it. On Windows an npm-installed `claude`, `codex` or `pi` is a `.cmd` shim: the panel reads the script the shim runs and starts it with Node (no shell, so the message is not passed through cmd.exe quoting), and Stop ends the whole process tree.
- `driver-pty` brings `node-pty`, which ships prebuilt binaries for macOS, Windows and Linux. npm 11 and pnpm warn that its install script was not run (they ask you to approve dependency install scripts); you can ignore the warning. If no `pty:` terminal is offered and the app prints why at start, approve and rebuild: `npm approve-scripts node-pty`, then `npm rebuild node-pty` (pnpm: `pnpm approve-builds`).

## Checking that an agent can use the docs

The repository has a manual gate: it creates a fresh app, starts a headless coding agent inside it with a one-line task (for example "add a /customers/count route with a test"),
and checks that the app's tests and type-check pass afterwards and that the route answers.
