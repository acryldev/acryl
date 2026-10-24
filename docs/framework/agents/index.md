# Agents

A coding agent (Claude Code, Codex, OpenCode, Copilot and others) builds on Acryl best when the documentation is in the folder it works in. A project created with
`npm create acrylblends@latest` (and one made with `npx acrylblends init`) therefore contains:

- `docs/framework/`: these pages. Start at `README.md`; `api/summary.md` is the one-page summary of the API.
- `AGENTS.md`: where the API is, how a feature is built (an `Acryl` app mounted with `ctx.router.route`, a plugin registered in `src/app.ts` and `blend.yaml`, a state cell),
  the things that surprise people, and what must pass before a task is done (`npm test` and `npm run check`).
- `CLAUDE.md`: one line, `@AGENTS.md`, so tools that read `CLAUDE.md` read the same guide.

## What an agent can do inside a running app

The `acryl-app` template (a Cordis app) also lets an agent change the app while it runs:

1. The agent writes a plugin into `extensions/<name>/index.ts`. The plugin may import `acrylblends` and the other subpaths by name.
2. The app installs it as a child plugin, runs its `check(ctx)` with the plugin's own context, and keeps the previous version if the new one fails to start or to pass its check.
3. A plugin's routes are an `Acryl` app mounted with `ctx.router.route`, so removing the plugin removes its routes.

See [Acryl in a Cordis app](../cordis/acryl-in-a-cordis-app.md), [Plugin lifecycle](../cordis/plugin-lifecycle.md) and [Mounting](../cordis/mounting.md).

## Checking that an agent can use the docs

The repository has a manual gate: it creates a fresh app, starts a headless coding agent inside it with a one-line task (for example "add a /customers/count route with a test"),
and checks that the app's tests and type-check pass afterwards and that the route answers.
