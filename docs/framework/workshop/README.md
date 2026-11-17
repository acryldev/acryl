# Build your app inside the ACRYL frame: the ACRYL Blends workshop

Ninety minutes, from an empty folder to an app that opens in ACRYL's own IDE: projects on the left, your app's page in the middle, files,
changes, checks and terminals on the right, a chat model that works on your app beside it, and Claude, Codex or Pi running in terminal tabs in
the same folder. **Acryl** is the small web framework underneath (a handler takes a `Request` and returns a `Response`); **ACRYL Blends** is the
app around it: a folder of Cordis plugins with a `blend.yaml`, running on your machine, opened by the frame.

The frame is the workshop's point. You do not edit a folder and alt-tab to a browser: your app is a page inside the workspace, the agents work in
the same folder the frame shows, and every change you or an agent makes is one restart away from the page.

This guide is for **acrylblends 1.3.0 or newer**; `npm create acrylblends@latest` gives you that. An app you made with an older release gets the
frame with the upgrade in block 6.

## 0. Before you start (10 minutes)

Run this first. It checks everything below and prints one line per check, with the exact command for anything missing:

```sh
npx acrylblends@latest preflight
```

It ends with `Ready for the workshop.`, or with how many lines say `FIX`: run each `FIX` line, then the preflight again. `NOTE` lines are things the
first blocks do without.

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Node.js 22.19 or newer (24 and 26 work) | `node -v` | `node -v` | `node -v` |
| git | `git --version` | `git --version` | `git --version` |
| one coding agent, logged in | `codex login status` or `claude --version` or `pi --version` | same | same |
| GitHub account and `gh`, for the last block | `gh auth status` | same | same |

Install what is missing: Node from <https://nodejs.org> (the LTS), git from <https://git-scm.com>, the GitHub CLI from <https://cli.github.com> (`gh auth
login` once), and one agent:

- **Claude Code**: <https://claude.com/claude-code>, then run `claude` once to log in.
- **Codex**: `npm i -g @openai/codex`, then `codex login`. If a run answers `model_not_found`, your account does not have the default model: pick one
  your account supports (`/model` inside codex, or `model = "..."` in `~/.codex/config.toml`).
- **pi with DeepSeek**: `npm i -g @earendil-works/pi-coding-agent`, and set your DeepSeek key in the terminal you start the app from (the terminal
  tabs inherit that environment). The preflight checks the key: `PASS agent pi (DeepSeek key found)`.

| macOS and Linux | Windows PowerShell | Windows cmd.exe |
| --- | --- | --- |
| `export DEEPSEEK_API_KEY=sk-...` | `$env:DEEPSEEK_API_KEY="sk-..."` | `set DEEPSEEK_API_KEY=sk-...` |

**One model key for the chat.** The frame's chat needs a model: a DeepSeek API key from <https://platform.deepseek.com> is the shortest path (you add
it in block 3). A Claude or ChatGPT subscription works too, through **Sign in with an account** on the same Settings page.

No prior knowledge of ACRYL, Cordis or Blends is needed; every new word is explained where it appears.

Make the workshop folder:

| macOS and Linux | Windows PowerShell | Windows cmd.exe |
| --- | --- | --- |
| `mkdir ~/acryl-workshop && cd ~/acryl-workshop` | `mkdir ~/acryl-workshop` then `cd ~/acryl-workshop` | `mkdir %USERPROFILE%\acryl-workshop` then `cd %USERPROFILE%\acryl-workshop` |

**On Windows.** Windows PowerShell 5.1 (the one Windows ships) has no `&&`: where this guide joins two commands with `&&`, type them as two lines, or join
them with `;`. PowerShell 7 (`pwsh`) accepts `&&`. In cmd.exe, `Ctrl-C` asks `Terminate batch job (Y/N)?`: answer `Y`.

**The agent setting that matters all day.** The agents are configured to act rather than to describe: when you ask for something, they write the
files and check the result. If your agent stops to ask "shall I proceed?", answer "do it now" and it continues; that one sentence is the difference
between watching and building.

## The path

| Minutes | Block | What you get |
| --- | --- | --- |
| 0-10 | 0. Before you start | a checked machine, one model key, a folder |
| 10-20 | 1. Create the app, open the frame | the app running and shown inside the ACRYL frame |
| 20-25 | 2. Your first change | the app's page in the frame showing your edit |
| 25-30 | 3. Connect your model in Settings > Models | a chat that answers |
| 30-50 | 4. Chat: your model builds a page | a board page the model wrote and you saw at /app/board |
| 50-65 | 5. A coding agent in a terminal tab | Claude, Codex or Pi working in the app's folder |
| 65-80 | 6. Upgrade an older app onto the frame | an app from before today, opened by the frame |
| 80-90 | 7. Publish it as a starter | the app listed in the workshop registry |

> **Checkpoint 20 minutes:** the app's page is in the frame.
> **Checkpoint 30 minutes:** the chat answers.
> **Checkpoint 50 minutes:** the model's board is at /app/board.
> **Checkpoint 65 minutes:** an agent in a terminal has changed the app.

## 1. Create the app; the frame opens on it (10 minutes)

```sh
npm create acrylblends@latest my-app agent -- --desktop
cd my-app
npm install
npm run dev
```

npm may warn that 5 packages have install scripts not covered by allowScripts; that is a notice, not an error - nothing to do.

`npm install` is bigger than a framework-only app: it brings the frame and the chat engine (about 500 MB together, much less on a warm package
cache). `npm run dev` starts the app inside the frame and prints one line:

```text
acrylblends host: http://127.0.0.1:3489/?token=...
```

Open that address (it is a free port on your machine; never a fixed one). It stays the same every time you start the app, and it is the way back in
later: `npx acrylblends open` prints it again while the frame is running. The first time, DeepSeek Harness shows a **Preview Notice**: press **Continue**. Then the frame opens **on your app**: the page in the middle is `my-app`'s own page, in a tab named after the app.

![The frame on first run: projects on the left with the app selected, the app's page in the canvas, the tab strip with the app's tab](/docs-assets/workshop/s1-frame.webp)

The three columns are ACRYL's IDE:

- **Left:** your workspaces and projects. `my-app` is selected; the account row above and **Settings** below.
- **Middle:** tabs. `my-app` is your app's page; the `+` at the left of the tab strip opens more (terminal, browser, files, chat, agents).
- **Right:** open it with the panel button at the top right (or `Cmd/Ctrl+B`): **Files**, **Changes**, **Review**, **Checks**, **Comments** and a
  terminal. The bottom bar is the terminal dock.

The app's page also has an agent of its own: **Ask the agent** at the bottom right opens the app's panel (the offline agent unless the app is given
a model). The frame's chat in the next blocks is the tool you will use; the panel is there for the app to ship with.

**Stuck?** A busy port means the terminal printed a different address; use that. `npm install` failing on the native terminal package needs a C++
toolchain: on macOS `xcode-select --install`, on Windows the "Desktop development with C++" workload of Visual Studio Build Tools, on Ubuntu
`sudo apt install build-essential python3`.

## 2. Your first change, seen at /app (5 minutes)

Open the right panel (**Files**), expand `src`, click `routes.ts`. Find the sentence the page shows ("This app runs an agent unless it is switched
off...") and change it to something that is yours. Press **Save** in the editor's bar (or `Cmd/Ctrl+S`).

The running app does not pick a source change up by itself. Stop the host with `Ctrl-C` in the terminal where `npm run dev` runs (in cmd.exe answer
`Y`), then start it again:

```sh
npm run dev
```

The frame reconnects on its own, on the same address (the port is stable per app), in a few seconds. If a chat tab opened in front, press the
`my-app` tab: the page shows your sentence. That is the whole development loop for the rest of the day: edit, restart, look.

```sh
npm test
npm run check
```

Both pass: the app is TypeScript, with tests and a type check, and the scaffold made the folder a git repository, so **Changes** shows what you
edited.

**Stuck?** If the page looks unchanged, the host did not restart (the terminal says `Restarting` or it is waiting on `Ctrl-C`). If the frame still
says `Reconnecting...` after ten seconds, reload the tab: the address is the same one it was opened with. If the tab was closed, `npx acrylblends open`
in the app's folder prints the address again.

## 3. Connect your model: Settings > Models (5 minutes)

Press **Settings** at the bottom of the left column, then **Models** in its sidebar. The page lists DeepSeek as a provider: paste your API key into
**API key** and press **Apply**. It answers `Saved DeepSeek (deepseek-official).`; the key goes to the frame's own credentials store, never into the
app folder.

![Settings > Models with the DeepSeek key field](/docs-assets/workshop/s2-settings-models.webp)

Then reload the frame (`Cmd/Ctrl+R`): the page you already had open picks the key up on its next load. A Claude or ChatGPT subscription instead of a
key: **Sign in with an account** on the same page.

If the frame greets you with DeepSeek Harness's **Add an API key to get started** card first, you can paste the key there and press **Save and
continue**, or press **Configure later** and use Settings > Models; both write the same store.

**Stuck?** "Loading the provider directory failed" means the host is not answering; start `npm run dev` again. A key that stays red is usually an
extra space: paste it again.

## 4. Chat: your model works on the app (20 minutes)

Press `+` at the left of the tab strip and choose **AcrylDSH Chat**; on the `my-app` row in the left pane, **New chat on my-app** does the same and
binds the chat to the app's folder (the chat's workspace selector says `my-app`). Then ask, in one message:

> Do it now, without asking for approval. Build a board page at /board in this app: three columns (backlog, doing, done) with cards that have a
> checkbox to mark them done, a sidebar with filters (all, mine, done) and a count on each filter, a button that opens and closes the sidebar, and
> a header button "New card" that adds one. Use the app's own state so the counts update live. Read AGENTS.md and the app's docs first. When you are
> done, tell me what you changed.

The chat writes into `my-app` (watch the **Changes** panel fill), and the app's page at `/app` shows it after the loop from block 2: `Ctrl-C`, `npm
run dev`, the frame reconnects. The board is at `/app/board`: type the address in the app tab's bar (the same address with `/board` at the end) and
press **Go**.

![The AcrylDSH Chat tab with the request, beside the app](/docs-assets/workshop/s3-chat.webp)

Every model builds a slightly different board: yours may need a title typed before "New card" adds one, or keep the sidebar always open.

**Stuck?** If the chat asks for a model, block 3 did not finish (or the page was not reloaded after Apply). If the model describes the plan and
stops, reply "do it now, without asking for approval".

## 5. A coding agent in a terminal tab (15 minutes)

Press `+` and choose **Claude**, **Codex** or **Pi** (or **New Terminal** and type the command yourself). The tab starts the agent in the app's
folder: the terminal's prompt is `my-app`, and `pwd` prints the folder. Ask it, in the terminal:

> Do it now, without asking for approval. Add a GET /time route that returns the current time as JSON, and a line on the app's page that shows it.
> Then check it at http://127.0.0.1:3489/app/time.

The port in that address is the one the frame printed. The agent edits the files, and the same loop shows them: `Ctrl-C`, `npm run dev`, the frame
reconnects, the `my-app` tab.

An agent that works in this folder can also use the app's **door**, the page channel the app carries in development: `.acryl/bin/acryl look` prints
what is on the page with refs, and `act` clicks, types, selects, presses, scrolls, waits, navigates and reloads. Ask the terminal agent to look at
the page before it tells you it is done; the app's own docs (`AGENTS.md`, `plugins/acryl-door`) say how.

**Stuck?** An agent that says the terminal is not a TTY needs the tab, not a script. If the agent cannot log in, sign in in a terminal first
(`claude`, `codex login`, pi with `DEEPSEEK_API_KEY`), then open the tab again.

## 6. Upgrade an older app onto the frame (10 minutes)

An app made with an older acrylblends runs the framework only. The current release moves it onto the frame-hosted layout: the generated launcher,
the frame's row and the app's plugins beside it, the mount config. **Your source stays yours**: the upgrade only touches the files acrylblends
generated, plus the library plugins the app carries.

```sh
cd old-app
npx acrylblends@latest upgrade
npm install
npm run dev
```

The report names every file it changed and ends with a `frame` line (for an app that already has the frame: `everything is up to date`). An app made
today answers "everything is up to date" too. An app from a release **before 0.7.8** cannot start at all (its `src/main.ts` imports a `plugins/`
folder that release did not write); the upgrade says so instead of touching it.

**Stuck?** "is not the previous release's scaffold" means you edited a generated file: run with `--diff` to see it, save your version aside, and
run again (or `--force`; the app's versions are backed up under `.acrylblends/upgrade-backup/`).

## 7. Publish it as a starter (10 minutes, take-home)

Your app already is a starter: `blend.yaml` names it, `plugins/` holds its code.

```sh
cd ~/acryl-workshop
gh repo fork acryldev/workshop-2026-11-20 --clone
cd workshop-2026-11-20
node scripts/make-entry.mjs ../my-app <your-github-login>.my-app --description "the board my agent built"
git add blends && git commit -m "add <your-github-login>.my-app"
git push
gh pr create --fill --repo acryldev/workshop-2026-11-20
```

(On Windows PowerShell 5.1, `cd ~/acryl-workshop` works as written; in cmd.exe use `cd %USERPROFILE%\acryl-workshop`. Type the `git add` and `git
commit` as two lines, or join them with `;`.)

A check runs on the pull request and merges it: your starter is listed in about two minutes, and anyone can start from it with
`npm create acrylblends@latest another-app -- --from <your-github-login>.my-app --registry github:acryldev/workshop-2026-11-20`.

**Stuck?** The registry's check comments what to change; fix, commit, push again. `gh auth status` not logged in means `gh auth login`.

## Browser only (WebBoxes.ai) TODO(M9)

No local install? The same app, and the same agents working on it, will run as a hosted workspace: open it in a browser, pick a starter, and work in
the same folders. Nothing to install, nothing to keep on your machine. Until it is live this section is a stub.

## Where next

- **Read the docs you already have**: every app carries `docs/framework`, the same pages as <https://acrylblends.github.io/docs>.
- **Teach the agents your app**: `AGENTS.md` is what they read first; add your team's conventions there and they follow them in the next run.
- **Swap a provider by editing one row**: SQLite to Postgres, the browser to a window, one agent to another in the frame's agent list.
- **Bring your own tool**: <https://acrylblends.github.io/docs/guides/bring-your-own-tool> wraps an outside library as a provider of a port.

---

## If something goes wrong

| Symptom | Do |
| --- | --- |
| The preflight prints `FIX` lines | run each one, then `npx acrylblends@latest preflight` again |
| `npm create` fails or hangs | check the network; the facilitator has prepared apps |
| `npm install` fails building node-pty | install the C++ toolchain (block 1's **Stuck?**) and run it again |
| A port is taken | use the address the app printed |
| The frame says `Reconnecting...` | wait ten seconds; then `npx acrylblends open` and open the address it prints |
| Settings > Models shows no provider | the host is not running: `Ctrl-C`, `npm run dev` |
| The chat asks for a model | finish block 3, then reload the page |
| The model plans and stops | reply "do it now, without asking for approval" |
| An agent cannot log in | `codex login` / `claude` / pi with `DEEPSEEK_API_KEY`, then open the tab again |
| The app's page is unchanged after an edit | the host did not restart: `Ctrl-C`, `npm run dev` |
| `&&` is an error in PowerShell | Windows PowerShell 5.1: type the two commands as two lines, or join them with `;` |
| Anything else | the **Stuck?** line of the step, then your facilitator |
