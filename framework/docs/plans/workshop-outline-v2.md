# Workshop outline v2: a visual app, built and driven by the agent inside it

Draft for the coordinator to merge with Blends' capability report before the handout text is written. Not the handout: the published pages stay at
`docs/framework/workshop/` until this replaces them. Every block names the exact capability it depends on; anything I could not confirm on 1.0.x is
marked **[confirm]** with the question in the last section.

The shape changed with the owner's refocus: `/hello` becomes a five-minute introduction to the framework core, the data layer and the template tour
shrink to asides, and the centre of the workshop is an app that the agent builds UI into from inside, then drives itself (clicks, sidebars, settings) in
the browser and in a desktop window.

| Minutes | Block | What happens | Depends on |
| --- | --- | --- | --- |
| 0-10 | Setup and `/hello` | check Node 22.19+ and git; `npm create acrylblends@latest my-app agent`; `npm run dev`; one route to `{"hello":"workshop"}` and the typecheck + tests | `create-acrylblends` template `agent`; `Acryl` + `ctx.router.route` (acrylblends/cordis/router); `scripts/check-node.cjs`; `acrylblends init`'s dev/test/check scripts |
| 10-40 | A visual app on the web, the agent building from inside | ask the panel for a board page with cards, a sidebar and live counts; the agent writes a plugin, installs it live, the page reloads; the attendee edits the result in the same files | agent template rows (`agent`, `builder`, `extensions`, `sandbox`, `tasks`, `agent-panel`); the panel's `POST /api/agent-panel/ask` with a chat driver (`codex`/`claude`/`pi` headless); `builder` tools (write/install/read/list/remove) **[confirm Q1]**; live install with rollback (`extensions`, content-hashed stage, child fiber, ledger); JSX on the server (`acrylblends/jsx`) and client components without a bundler (`clientModules`) **[confirm Q1]**; `acryl-state` cells + SSE for the live counts **[confirm Q1]**; the panel's reload when an extension changed |
| 40-60 | The agent drives the app | in the terminal tab the agent runs `.acryl/bin/acryl brief`, `look`, then `act` to open the sidebar, press a button, change a setting; the page shows the "agent is driving" indicator with its stop button | the door (`acryl-door`): `.acryl/bin/acryl`, per-run secret in `.acryl/door.json`, audit log; page channel ops click/type/select/press/scroll/wait + snapshot refs; the panel's own agent (the chat driver the attendee picked) doing the clicking and opening the sidebar **[confirm Q6]**; a `pty:` driver reaching the same door is the fallback if the chat drivers cannot act yet; no production gate in play (development only) |
| 60-75 | The same app on the desktop, the agent driving the window | `npx acrylblends add desktop`, `npm run desktop`; the same page in an Electron window; the agent runs the same `look`/`act` against the window | `plugins/desktop` (Electron window on the app's own loopback server); the door's channel against the window's origin **[confirm Q3]**; the panel inside the window **[confirm Q3]** |
| 75-90 | Deploy and publish | build for production (the agent parts are development-only), start it, then publish the app as a registry entry and watch it be listed | `NODE_ENV=production` behaviour of door/panel/PTY driver (`docs/framework/guides/production.md`); a deploy path for a template app **[confirm Q4]**; `make-entry.mjs`, the workshop registry `github.com/acryldev/workshop-2026-11-20`, its check + auto-merge listing **[confirm Q5]** |

Asides kept short, each 3-5 minutes, folded into the block above them: the data layer (a `kv` counter, then SQLite) inside block 2 where the live counts
come from; the six-template table as a one-screen aside in block 1; `acrylblends upgrade` at the end of block 4.

## Questions the capability report has to answer

1. Can the agent, inside a running 1.0.x app, produce a *visual* page (JSX route, client component, CSS, state cells) through `builder` + live install,
   and does the page reload by itself when the plugin installs? Any gap in client components or `acrylblends/css`?
2. Does the door's `look`/`act` work when the agent is a `pty:` driver inside the panel (it needs the per-run secret and `.acryl/bin/acryl`), and does
   the "agent is driving" indicator show for those actions?
3. Does the same `act` reach the Electron window, and can the agent open sidebars/dialogs that the app itself renders?
4. What is the supported deploy for a template app whose agent parts are development-only: exact commands, what stays off, and what the attendee sees at
   the URL?
5. Does an app carrying the agent template publish cleanly (`make-entry.mjs` + the workshop registry check), and does the pulled copy still run for the
   next person?
6. Does the panel's own agent - the chat driver the attendee picks, running inside the app - drive the app through the door while it builds it: click,
   open a sidebar, press a button, change a setting, with the "agent is driving" indicator showing? The owner's picture is one agent that both builds
   and drives; a `pty:` driver doing the driving is only the fallback if the chat drivers cannot act yet.

## Shot list (planned now, shot when the text is written)

Rules for every shot: 1280 px wide, light theme, no personal data, tokens, real home paths or other apps' windows; WebP (or an optimised PNG) stored next to
the page in `docs/framework/workshop/`, with alt text that describes what to look at.

| # | Shot | Where it sits | How it is taken |
| --- | --- | --- | --- |
| S1 | The terminal after `npm create` and the first `npm run dev`, the printed URL visible | block 0 | headless browser for the page, trimmed terminal capture for the output |
| S2 | The agent panel mid-build: the request, the tool events streaming, the files it is writing | block 1 | headless browser, panel open, mid-run |
| S3 | The page the agent built: cards, sidebar, live counts | block 1 | headless browser at 1280 |
| S4 | The agent driving: the "agent is driving" indicator and the sidebar it just opened | block 2 | headless browser, with the door acting through the CLI |
| S5 | The desktop window with the same app and the panel | block 3 | screen capture of the real Electron window |
| S6 | The registry listing with the attendee's app in it | block 4 | headless browser on the workshop registry page |
