# Human test: ACRYL builds its own extensions live

Status 2026-09-20: machinery ready for Web, Desktop and CLI (`corepack pnpm run tui`, same profile flow).

Extras: type `/reload` in the chat to re-install every local extension from its source folder (checked, rolled back on
failure; reload the page/window afterwards for UI changes). Ask the agent to "prepare this for the marketplace": it
runs `acryl_prepare_publish` (a dry run) and hands you the `npm publish` step, which only you run.

## Run it

- Web: `corepack pnpm run web` (rebuilds automatically when runtime sources are newer)
- Desktop: `corepack pnpm run dev` (isolated `~/.acryl-dev` home)

You need a model configured in Settings. Open a session in any workspace directory (the agent writes its plugin
sources under `<workspace>/.acryl-extensions/<name>/`).

## Things to ask

1. **Build (UI):** "Build a kanban board extension with tasks, columns and drag to move, in the top bar or a side
   panel." Expected: the agent reads the router's docs and the client-slot example, writes a package, calls
   `acryl_install_plugin`, then tells you to reload the page (Web) or window (Desktop). After reload, a button appears
   in the conversation header and opens the board.
2. **Improve UI:** "Add task priorities and colors to the kanban board." Expected: `acryl_list_plugins`, edits the
   source, `acryl_install_plugin` again (action "updated"), reload.
3. **Fix:** "The kanban board loses tasks when I reload." Expected: reads the code, fixes persistence, updates.
4. **Build (agent capability):** "Add a tool that returns the current git branch." Expected: a tool plugin, live with
   no reload (it appears to the agent immediately).
5. **Change host behavior:** ask it to change a tool it built. Expected: it uses the hot shim so the update is live;
   if the tool result has a `warning`, that update needs an app restart.
6. **Remove:** "Remove the kanban extension." Expected: `acryl_remove_plugin`, reload.

## What to look at when something goes wrong

- The agent's tool result (`acryl_install_plugin` returns the stage: `check`, `install`, `activate`, or a `warning`).
- Browser console (Web) / devtools (Desktop): the example logs `[<package>] client module loaded` and
  `apply: registering header action`. If neither appears the client bundle did not load.
- `acryl_list_plugins` shows what is installed and from which directory.

## Known limits (not bugs)

- UI plugins need a page/window reload after install or update; host code updates need the hot shim or a restart.
- The agent cannot publish to the marketplace; that is a human action. Before the next acryl-web npm release,
  `acryl-extension-context` must be published to npm once (it is now public like the market and brand packages).
- Verified headlessly and in a real browser: the engine composition, router in the prompt, the three tools, install /
  update / remove, the Desktop install fallback (emulated), and that a hand-written client bundle executes and
  registers. NOT verified: the button rendering inside a live session header, Desktop launched for real, and how well
  a real model builds a complex feature.
