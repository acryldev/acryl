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

## What was verified before you start (2026-09-20)

- **A real model ran the whole loop headlessly** (DeepSeek v4 flash, real web engine, `standard` preset, a throwaway
  home). Prompt 1 "build a kanban board with a top-bar button": the agent loaded the `acryl-build-extension` and
  `acryl-add-ui` skills, read the docs and the header-action example, wrote 4 files, `acryl_verify_plugin` passed,
  `acryl_install_plugin` returned `active`, and it tested its own bundle in jsdom (35 s to installed). Prompt 2 "color
  the headers, add Clear done": listed, edited, verified, and updated in place (`action: updated`). Prompt 3 "add a
  count_words tool and use it": installed and called the tool in the same session. Prompt 4 "remove the kanban":
  `acryl_remove_plugin`, then confirmed with the list. Total 102 s for all four turns. Re-run it any time with
  `runtime/acryl-harness-runtime/tests/e2e-real-model.spec.ts` (opt-in, see its header).
- Every host example mounts to its declared state on the real engine; the header-action and sidebar-tab client
  bundles load and apply in a real browser without errors (page stays healthy); `/reload` is registered in a session
  and runs; CLI, Web and Desktop compose the pack.
- Coverage: all 18 plugin types have a doc and an example (diagnostics and packaging are doc-only by design), 80
  harness and Cordis reference docs are synced in, and there are 9 skills.

## Known limits (not bugs)

- **Not seen by me:** the button or sidebar tab rendering inside an open session (the native folder picker blocks a
  headless session in a browser), and Desktop launched for real. If the sidebar tab does not show, ask the agent to
  use the docked panel opened from a header button instead; the docs describe both.
- UI plugins need a page/window reload after install or update; host code updates need the hot shim or a restart.
- The agent cannot publish to the marketplace; that is a human action. Before the next acryl-web npm release,
  `acryl-extension-context` must be published to npm once (it is now public like the market and brand packages).
- Agent presets: the example is structural; the pack tests do not boot a session on it.
