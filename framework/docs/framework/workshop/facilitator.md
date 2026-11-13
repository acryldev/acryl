# Facilitator notes: building inside the ACRYL frame

Read the handout first (`docs/framework/workshop/README.md`); this page is the room around it. The workshop changed shape again for the frame: the
app is created, then **opened inside ACRYL's IDE** (projects on the left, the app's page in the canvas, files/changes/terminals on the right), a
chat model works on the app from inside the frame, and coding agents run in terminal tabs in the same folder. The data layer, the desktop window and
the panel-first flow of the previous handout are gone.

The handout is written for **acrylblends 1.3.0 or newer** (the release whose `create --desktop` makes the framed app). A room on an older release is on the previous handout;
check with `npx acrylblends@latest --version` before the day.

## Before the room: put this on every machine

| What | Why | How |
| --- | --- | --- |
| The preflight passing | it checks Node, npm, git, an agent with its login or key, a free port, and on Windows PowerShell and long paths | `npx acrylblends@latest preflight` ends with `Ready for the workshop.` |
| Node.js 22.19 or newer (24 and 26 tested) | the app runs TypeScript directly | `node -v`; the app's `scripts/check-node.cjs` refuses an older Node with a clear line |
| git, and a GitHub account with `gh auth login` | the first `npm run dev` makes the folder a git repository (Files and Changes need one); the last block forks the registry | `git --version`, `gh auth status` |
| One coding agent, logged in | block 5 starts it in a terminal tab; `claude`, `codex` and `pi` all worked | `codex login` once, or run `claude` once, or pi with `DEEPSEEK_API_KEY` in the terminal that starts `npm run dev` |
| One model key | block 3 adds it in Settings > Models; without it the chat shows a connect card | a DeepSeek key from <https://platform.deepseek.com>, or a Claude/ChatGPT subscription through Sign in with an account |
| A prepared app with `npm install` done | the first install brings the frame and the chat engine (about 500 MB together); a room on one Wi-Fi should not do it 20 times | run the handout's block 1 once per machine and keep the folder as `~/acryl-workshop/prepared/` |
| A warm npm cache | the first install dominates block 1 | the prepared app does it |

**The agent setting that decides the day.** The agents are configured to act rather than describe. Check on every machine that a plain request
produces files, not a plan: ask the prepared app's chat "add a line to the app's page" and watch the Changes panel. If it only describes, the model
is waiting for permission; the handout's sentence is "do it now".

**Agent-specific checks.** Codex answering `model_not_found` means the account does not have the default model: pick one it supports (`/model` in
codex, or `model = "..."` in `~/.codex/config.toml`). pi with DeepSeek needs `DEEPSEEK_API_KEY` in the environment of the terminal that runs `npm
run dev` (the terminal tabs inherit it); the preflight reports `PASS agent pi (DeepSeek key found)`. The package is
`@earendil-works/pi-coding-agent`.

## Timings, from the rehearsal (this Mac, packed CLI, isolated HOME)

| Minutes | Block | Measured | If late |
| --- | --- | --- | --- |
| 0-10 | preflight and setup | preflight ~15 s; the prepared app skips create and install | never cut |
| 10-20 | create and open the frame | the first `npm install` dominates (the frame and the chat engine); the frame's first page is up in a few seconds after that | use the prepared app and open its frame |
| 20-25 | the first change at /app | the Files view opens `src/routes.ts`; stop and `npm run dev` reconnects the frame in a few seconds; the page shows the edit | cut `npm test` to the take-home |
| 25-30 | Settings > Models | the key saves with Apply (`Saved DeepSeek (deepseek-official).`); the page uses it after a reload | paste the key in the first-run card instead, Save and continue |
| 30-50 | chat builds the board | the chat writes into the app folder and Changes fills; the restart loop shows it at /app/board | if the model is slow, cut the board to one column |
| 50-65 | a coding agent in a terminal | the agent tab starts in the app folder (its prompt is `my-app`); `.acryl/bin/acryl look` prints the page in the frame's tile | demo one agent and let the room follow |
| 65-80 | upgrade an older app | `npx acrylblends@latest upgrade` reports every file it changed (the `frame` line is the new layout), then `npm install` and `npm run dev` | keep the report, skip the second app |
| 80-90 | publish (take-home) | the registry check merges in about two minutes | leave it as the take-home |

What the rehearsal verified end to end on this Mac: a packed CLI in an isolated HOME, the app opened by the frame with the app's page in a tab
(the first-run tile), the Preview Notice dismissed once, Settings > Models saving a key and the chat sending with it (against a local mock), a
terminal tab running commands in the app folder, the app's page edited and shown after a restart, the door seeing the page (`acryl look`), and an
app made by the previous release upgraded and opened by the frame.

## What to say in the room

- **The frame is the product.** The point is not "an app with a chat sidebar"; it is that ACRYL's IDE hosts the app you are building: the app is
  the page in the middle, its folder is the workspace, and the agents work in that folder.
- **Settings > Models is the key's home.** The key goes to the frame's own credentials store in the app's data folder (`~/.acryl/apps/<id>/data/`), never the app folder. The
  first-run card writes the same store; either path is fine.
- **The loop is stop, start, look.** A source change needs `npm run dev` again; the port is stable per app, so the frame reconnects on the same
  address and the app's tab is still there. If a chat tab comes to the front after the restart, press the `my-app` tab.
- **Two kinds of agent.** The chat (DSH's own, in the frame) and the coding agents in terminal tabs are different hands on the same folder; show
  both and let people pick.
- **The door.** `.acryl/bin/acryl look` prints the page with refs, `act` clicks and types. In the frame the page is the tile, and the door sees
  it. This is how an agent checks its own work.
- **Production is unchanged.** The frame, the chat and the agents are development tools; `NODE_ENV=production npm start` serves the app alone.

## Windows

Windows PowerShell 5.1 has no `&&` (two lines, or `;`); PowerShell sets variables with `$env:NAME="value"`; cmd.exe's `Ctrl-C` asks `Terminate
batch job (Y/N)?` (answer `Y`); cmd.exe does not expand `~` (use `%USERPROFILE%`). `npm install` needs the "Desktop development with C++" workload
of Visual Studio Build Tools for the terminal package; the preflight notes it.

## The no-network fallback

1. Prepared apps with `npm install` done cover blocks 1, 2 and the frame; the models (chat and agents) still need a connection or a demo.
2. Block 7's registry needs GitHub; if the venue is offline, publish from your machine on a hotspot at the end, or show the recording.
3. Keep one phone hotspot for the room.

## Demo script (five minutes, if the room is behind)

1. Prepared app, frame open on the app's page: press `+`, open **AcrylDSH Chat**, ask for a sentence on the page. Narrate the Changes panel and
   the restart loop.
2. Open a **files** tab in the right panel and show the edit the model made.
3. `+` → **Pi** (or Claude): the agent starts in the app folder; ask it for a route; run `.acryl/bin/acryl look` in that terminal and show the
   page's snapshot.
4. Settings > Models: show where the key lives and that it is not in the app folder.
5. Show the registry listing with an app already published.

## Resetting between sessions

Everything a person makes lives inside their app folder, its data folder in `~/.acryl/apps/` and `~/acryl-workshop`. To reset a machine, delete the app
folders and their data folders, and copy the prepared one back without its `.acryl/` folder; nothing is installed globally except the agent, `gh` and Node.
An app's data, the model key's credentials store included, lives in `~/.acryl/apps/<id>/data/`, outside the app folder. The `<id>` is written once into
the app folder's `.acryl/app.json` (gitignored): a copy that keeps that file shares the original's data and key, and a copy without it gets its own id
and an empty data folder.

## What is still open

- The frame's chat tab takes the focus when it binds its session after a restart; the app's tab is one click away and the guide says so.
- The frame's address is stable across restarts: the launcher keeps the token in the app home (owner-only, atomic) and reuses it, so an open page
  comes back by reloading its URL even if the browser lost its cookie. `npx acrylblends open` prints the address of the running frame;
  `npx acrylblends open --new` rotates it (the old address stops working at once and the new one is printed). The frame-side banner that names the
  command is still to come (after the 120 gate work).
- The one-click WebBoxes.ai deploy and the browser-only section stay TODO(M9) until that workspace is live.
