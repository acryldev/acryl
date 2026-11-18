# Workshop readiness: the newcomer path on 1.0.0 (macOS walk, with the Linux replay)

Walked 2026-10-28 on the published packages, exactly as an attendee would: only the **npm page** (`npmjs.com/package/acrylblends`, which
carries the README in the 1.0.0 tarball) and **acrylblends.github.io/docs**, plus what the CLI itself prints. Nothing was read from the
repository to decide what to type; the repository was read afterwards, to check the claims.

- **Versions walked:** `acrylblends` 1.0.0 (latest), `create-acrylblends` 1.0.0 (latest), `acryl` 0.2.5 (latest, the CLI). `acrylblends@0.4.1`
  (create-acrylblends) for the 0.11.0 app in step 8.
- **Host:** macOS 25.6 (arm64), Node v24.19.0, npm 11.17.0.
- **Isolation:** a throwaway root, `HOME` and `npm_config_cache` pointed inside it, so no real app home and no user npm cache were used:
  `S=/tmp/workshop-walk-1937; export HOME=$S/home npm_config_cache=$S/npm-cache npm_config_prefix=$S/npm-global`. Every server was started on
  its own port, stopped afterwards, and every port checked free.
- **The other two walks.** DS2 (Windows, mbpi9win) and Fork3 (Linux, z370n scratch) replay this document. The `OS` column marks where a
  command or a path differs; everything else is the same on all three. The macOS-only commands are the three below. The Linux replay is
  in [The Linux walk](#the-linux-walk-ubuntu-2404-z370n), and its results are in the `OS` column of the step table.

| | macOS (this walk) | Windows | Linux |
| --- | --- | --- | --- |
| Node.js | 22.19+ from nodejs.org | 22.19+ from nodejs.org | Ubuntu 24.04's own `nodejs` package is 18.19: install 22.19+ from nodejs.org or nvm (L2) |
| Shell for the exported variables | `export HOME=… npm_config_cache=…` | `$env:HOME=…; $env:npm_config_cache=…` (PowerShell) or `set` in cmd | same as macOS (bash) |
| Kill a dev server | `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` then `kill` | `netstat -ano | findstr :<port>` then `taskkill /PID …` | `lsof` as macOS (installed on Ubuntu 24.04), or `ss -ltnp 'sport = :<port>'` |
| Desktop user data | inside the app: `<app>/.acrylblends/electron` | same | not reached: the window never opened (L1) |
| Electron window | opens automatically | same | **aborts on Ubuntu 23.10 and later** before any window, on the Chromium sandbox (L1); past that it needs a display |

## The walk, step by step

Times are wall clock on this Mac with a **warm** npm cache after the first create; the cold first create is noted.

| # | Step | Command | Expected | Got | Time (s) | OS |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Preconditions | `node -v`, `npm -v` | 22.19+ | v24.19.0, npm 11.17.0 | - | Linux: the distribution's Node 18.19 / npm 8.19 is too old (L2); walked with nodejs.org's v24.18.0, npm 11.16.0 |
| 1 | Create six apps | `npm create acrylblends@latest app-<t> <t>` for `blank nodejs notes chat todo agent` | an app, next steps printed | all six created; `Next:` block printed **twice**; blank cold 10.3, the rest 1.7-2.9 | 1.7-10.3 each | Linux: same; all six created, `Next:` twice, 0.4-0.6 s each (warm) |
| 2 | Install | `npm install` in each | 0 vulnerabilities | 15 packages for blank; 0.8-3.2 | 0.8-3.2 | Linux: same; 15-16 packages, 0 vulnerabilities, 0.8-5.5 s |
| 3 | Test | `npm test` | all pass | blank 5, nodejs 8, notes 15, chat 10, todo 6, agent 10; 0 fail | 0.5-2.1 | Linux: same counts (5, 8, 15, 10, 6, 10), 0 fail, 0.5-3.1 s |
| 4 | Typecheck | `npm run check` | clean | clean (tsc, and `check-deps` where present) | 2.6-4.0 | Linux: clean, 2.9-4.7 s |
| 5 | Run + change | `npm run dev`, open the printed URL, add one route to the app's route file, save | the page answers, the route answers after the reload | all six ran; `node --watch` restarted on save; the new route answered; blank 3437, nodejs 3801, notes 3938, chat 3167, todo 3564, agent 3955 | boot 1-3 | Linux: same; all six booted in 0.5-1.0 s; the added route answered at `/` (blank, nodejs, chat, agent), under `/todo` (todo) and `/api/notes` (notes: 401 `Log in first.`, as designed); ports free after stop |
| 6 | Desktop | `npx acrylblends init app-desktop --desktop --template nodejs`; `npm install`; `npm run desktop` | a window on the app's own server | window opened, served `http://127.0.0.1:3260/` (200), Electron user data under `app-desktop/.acrylblends/electron`; quit cleanly, port free | init 2.9, install 3.2, boot ~20 (first Electron download) | display needed; Linux: **aborted** (L1): init 1.8 s, install 2.2 s, then `npm run desktop` downloaded Electron 44.9.3 and exited on SIGTRAP at the sandbox check. The window: not testable headless (no Xvfb on the host). There is no `.deb` path for an app to test instead: the app has no packaging script and the CLI no packaging verb |
| 7 | Registry pull | `npm i -g acryl`; `acryl new app-gtd --from acryl.gtd` | an app from the starter `acryl.gtd` | **refused**: `acryl: acryl new needs the ACRYL framework checkout for now …` (exit 1) | 12.4 + 0.9 | Linux: same refusal, exit 1; `npm i -g acryl` 11.4 s |
| 8 | Registry publish | clone the registry, add `registry/blends/workshop.demo/{blend.yaml,plugins/,README.md}`, `bun <blends-core>/src/bin/registry-index.ts registry --check`, then the same without `--check` | the check refuses a stale index, the tool writes it, the check passes | first `--check`: refused the entry on a YAML error (an unquoted `:` in the description); after quoting: `registry/index.json is stale: run blends-registry-index registry` (exit 1); the tool wrote it; `--check` exit 0 | clone 1.6, install 1.0, each run <1 | Linux: same: the YAML error, the stale index refused (exit 1), written, `--check` exit 0; Bun 1.4.4 from `curl -fsSL https://bun.sh/install \| bash` into `$HOME/.bun` |
| 9 | Built-in agent | in the `agent` template: `npx acrylblends add agent-panel driver-pty`, add two rows to `blend.yaml`, register both in `src/app.ts`, `npm install`, `npm run dev`, `GET /api/agent-panel/session`, `POST /api/agent-panel/ask` with driver `codex`, message: add `GET /agent-built` to `src/routes.ts` and run the tests | the panel lists drivers, codex edits the app, the page reloads | drivers `agent`, `claude`, `codex` (chat) and `pty:claude`, `pty:codex`, `pty:pi` (terminal); codex applied the patch, the app auto-reloaded, `GET /agent-built` → `{"built":true}`; the ask stream was still running at 240 s | add 1.7, codex ~4 min | user's own `~/.codex` login; Linux: `add` and the two edits as here; the session listed only `agent` (no claude, codex or pi on the host, and the walk copies no logins), so the codex ask is not tested; node-pty's `linux-x64` prebuild opened a real PTY although its install script was blocked (C5) |
| 10 | Upgrade | an app from `npm create acrylblends@0.4.1 app-old nodejs` (acrylblends ^0.11.0): `npx acrylblends upgrade --dry-run`, `npx acrylblends upgrade`, `npm install`, `npm test`, `npm run check` | the plan, the upgrade, then green tests | `npx acrylblends upgrade` printed the **0.11.0 help** and exited 0 (see F2); `npx acrylblends@latest upgrade` printed the plan (acryl-router 1 updated, acryl-door 1 updated), the real run upgraded them and set `^1.0.0`, after `npm install` 8/8 tests and `check-deps` clean | create 0.6, install 1.9, test 1.8 | Linux: `npx acrylblends upgrade --dry-run` exited **2** with `error: unknown command "upgrade"` and the 0.11.0 help (see L3); `@latest`: the plan, the upgrade to `^1.0.1`, 8/8 tests, check clean |

Isolation, checked at the end: no process of the walk was left running, every port free (3437, 3801, 3938, 3167, 3564, 3955, 3260), the real
`~/Library/Application Support/ACRYL*` unchanged (10 entries, same mtimes), `~/.acryl`, `~/.acryl-dev` and `~/.acryl-instances` untouched. One
exception worth recording: the codex driver needs the user's own login, so `~/.codex` was symlinked into the scratch `HOME` for step 9; an
attendee has it in place already.

## The Linux walk (Ubuntu 24.04, z370n)

Replayed the same evening from this table on the published packages, in a throwaway folder on z370n, with `HOME`, `npm_config_cache` and
`npm_config_prefix` inside it, every command under `nice`, no system package installed, and the folder removed at the end (every port the
walk used checked free, no process of the walk left).

- **Host:** Ubuntu 24.04.5 LTS, kernel 6.8, x86_64, headless (no `DISPLAY`, no Xvfb). The host's own Node is the distribution's 18.19.1 with
  npm 8.19.2; the walk used nodejs.org's v24.18.0 (npm 11.16.0) unpacked into the folder, after trying step 0 to 3 on Node 18 (L2).
- **Versions:** `create-acrylblends` and `acrylblends` were 1.0.0 for steps 1-5; **1.0.1 became `latest` at 19:28:55 UTC**, between steps 5
  and 6, so steps 6-10 ran on 1.0.1 (step 10 upgraded to `^1.0.1`). One `npx acrylblends@latest` 35 s after that publish failed with
  `ETARGET No matching version found for acrylblends@1.0.1` (npm's mirrors had not caught up); the same call a minute later worked. Not a
  Linux matter, but a release on the morning of the workshop would do the same to a room.
- **Not covered on Linux:** the Electron window itself (headless host, and L1 stops it first anyway), the codex ask in step 9 (no coding agent
  installed on the host, and the walk never copies anyone's login), other distributions (Fedora, Debian, Arch, which do not restrict user
  namespaces the way Ubuntu does), and Wayland.

### Linux frictions, ranked

**L1 (blocker on Ubuntu 23.10 and later). `npm run desktop` aborts before any window.** Electron 44.9.3, as `npm install` lays it out, exits on
SIGTRAP with `The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now.
You need to make sure that …/node_modules/electron/dist/chrome-sandbox is owned by root and has mode 4755.` The cause is Ubuntu's default
`kernel.apparmor_restrict_unprivileged_userns = 1` (read on the host), which takes away the user-namespace sandbox and leaves Chromium the
SUID helper, and npm cannot install that one as root. With the sandbox turned off for one diagnostic run (`ELECTRON_DISABLE_SANDBOX=1`) the
next and only error was `Missing X server or $DISPLAY`, so on an attendee's Ubuntu 24.04 laptop with a screen the sandbox is the wall. The
known ways past it each need a decision by the framework, not by an attendee in the room: run Electron with `--no-sandbox` in development,
have the attendee `sudo chown root:root` and `chmod 4755` the helper (again after every `npm install`), or an AppArmor profile for the app's
Electron. No page mentions Linux for the desktop shell. Workshop effect: block 35-50 fails for every Ubuntu 23.10+ attendee.

**L2 (confusing). The distribution's Node 18 fails late and says the wrong thing.** Ubuntu 24.04's `nodejs` is 18.19. On it,
`npm create acrylblends@latest` creates the app (npm prints `EBADENGINE … required: { node: '>=22.19.0' }` among the create output and goes on),
`npm install` succeeds, then `npm test` fails with `Could not find '…/test/**/*.test.{ts,tsx}'` (Node 18's test runner has no globs) and
`npm run dev` with `ERR_UNKNOWN_FILE_EXTENSION` for `src/main.ts`. Nothing says "Node 22.19 or later" at the point of failure. The docs state
the requirement; a Linux attendee who installed Node with `apt` will still hit this. Workshop effect: the setup check (block 0-10) has to name
nodejs.org or nvm for Linux, and check `node -v` first.

**L3 (to recheck on macOS). F2 is not silent here.** In the 0.11 app, `npx acrylblends upgrade --dry-run` exited **2** and printed
`error: unknown command "upgrade"` above the 0.11.0 help, where the macOS row says it printed the help and exited 0. The app's own 0.11.0 CLI
is the same file on both systems, so the macOS reading is worth a second look; F2 (the documented command runs the old CLI) stands either way.

**Linux does better on one point: C5 is only a warning here.** npm 11 blocked node-pty's install script exactly as on macOS, but node-pty
ships a `linux-x64` prebuild and a real terminal opened through it (`/dev/pts/…`, exit 0).

Everything else in the table (steps 1-5, 7, 8 and 10) behaved as on macOS, with the same counts and the same refusals.

## Frictions, ranked

### Blockers (a workshop cannot proceed as written)

**F1. Pulling a starter from the registry does not work with the published CLI.** `acryl new my-app --from acryl.gtd` exits 1 with
`acryl: acryl new needs the ACRYL framework checkout for now (its launcher, scripts/blank.mjs, is not part of the published CLI yet)`.
Promised by the npm page (`README` "Start from the registry", lines 103-115) and by the registry page on the site
(`acrylblends.github.io/blends` and its `registry/README.md`, both showing `acryl new my-app --from <id>`). `create-acrylblends` is not an
alternative: it takes a `github:`/`@scope/`/`.tgz` source and requires an `acryl.template.json`, which registry starters do not have
(`docs/framework/guides/create-acrylblends.md`, "Start from a template"). **Nothing in the published set can create an app from a starter.**

**F2. The documented upgrade command is a silent no-op inside a 0.11 app.** `npx acrylblends upgrade --dry-run` resolves to the app's own
installed 0.11.0 CLI, which has no `upgrade` verb: it prints the old help text and exits 0, so nothing happens and nothing says so. The
working form is `npx acrylblends@latest upgrade`. Documented in `docs/framework/cordis/migration-to-1-0.md` lines 11-12 and in the npm page
(`README` "Keep the framework current", lines 133-139). A newcomer would believe the app was upgraded.

### Confusing (a workshop loses 10-20 minutes each)

**C1. `acrylblends add agent-panel` leaves the panel silently absent.** The command copies the plugin and prints "add a row … and register it
in `src/app.ts`", but the panel also needs rows for `agent` and `extensions` (its `inject`), and nothing says so: the app boots, and
`GET /api/agent-panel/session` answers 404 with no message anywhere. On the `blank` template the panel cannot be added at all, because
`model`, `tools` and `memory` (rows of the `agent` template) are not in the plugin library. The instruction text lives only in the command's
output; no page in `docs/framework` covers adding the panel to an app (`docs/framework/agents/index.md` describes the agent template, and
`guides/production.md` describes its switches). The working base for step 9 was the `agent` template plus two hand edits.

**C2. The agent needs the user's own login.** With an isolated `HOME` the panel offered `codex` as a chat driver but the run would have failed
to authenticate; only after linking `~/.codex` into the scratch home did it work. Same for `claude`. Nothing in the docs says the panel's
headless drivers use the attendee's own login (and that `pi` may not be found: see C3).

**C3. `pi` is offered only as a terminal, not as a chat driver.** The session listed `claude` and `codex` as chat drivers and `pty:pi` as a
terminal, although `pi` is installed. The panel's headless list is built from a PATH probe the shell-function install of `pi` does not satisfy.
Not documented either way in `docs/framework/agents/index.md`.

**C4. The `todo` template serves nothing at `/`.** `npm run dev` prints `http://127.0.0.1:<port>`, the app answers 404 there because
everything is under `/todo`. `docs/framework/guides/create-acrylblends.md` line 14 says "a to-do list on the router and state"; the terminal
example in the same guide curls `$URL/todo/api`, so the paths are there, but the printed URL is the bare origin.

**C5. node-pty's install script is blocked by npm 11's allow-scripts.** `npm install` warns `node-pty … (install: … node-gyp rebuild …)` and
suggests `npm approve-scripts`. The PTY drivers still registered; whether a terminal actually opens with the unbuilt binding was not tested.
Not mentioned in any page.

### Cosmetic

**F3 (cosmetic).** `npm create acrylblends@latest` prints the `Next:` block twice (once from the initializer, once from the wrapper).
**C6 (cosmetic).** `npm create acrylblends@0.4.1 app-old blank` exits 2 without showing the initializer's message (0.4.1 has no `blank`
template); npm only says "command failed".
**C7 (cosmetic).** `acrylblends init --desktop` on a `nodejs` app prints that it added `sandbox`, `extensions` and `acryl-door` to a plain
web app, which reads as if a desktop shell needed them.

## What a 90-minute workshop can use today

Built only from steps that worked in this walk. Each block is timed from the table.

| min | Block | What the attendee does | Steps |
| --- | --- | --- | --- |
| 0-10 | Setup check | Node 22.19+, `npm create acrylblends@latest hello notes`, `npm install`, `npm run dev`, open the URL, log in, add a note | 1-5 |
| 10-25 | The shape of the app | open `blend.yaml` (the app as data), `plugins/` (the code they own), `src/routes.ts`; add `GET /hello` returning JSON, watch it reload | 5 |
| 25-35 | Tests and the typecheck | `npm test`, `npm run check`; add a test for the new route | 3, 4 |
| 35-50 | Web to desktop | `npx acrylblends add desktop`, `npm install`, `npm run desktop`, same route in the window | 6 |
| 50-70 | The built-in agent | start from the `agent` template app made in setup; `add agent-panel driver-pty`; two edits; open the panel; ask codex for one route and see the page reload | 9 |
| 70-85 | Registry: reading it | browse `acrylblends.github.io/blends`, read an entry's `blend.yaml`, explain the publish flow from the site and from the registry `README` | (read only: F1 blocks making an app from one) |
| 85-90 | Publish path, on paper | walk the four commands from step 8 in the cloned registry, showing `--check` refusing and the tool fixing it | 8 |

Linux attendees: block 35-50 aborts on Ubuntu 23.10 and later (L1), and block 0-10 must start from Node 22.19+ from nodejs.org or nvm, not
the distribution's package (L2).

Do **not** put F1 or F2 in the room as hands-on steps: F1 fails outright and F2 looks like success. If the registry must be hands-on, use step 8
(publishing into a clone), which works, and say plainly that pulling a starter needs the ACRYL source checkout today.

## What this walk does not cover

- Windows: DS2 replays the same table; the `OS` column is where to add what differs. Linux: replayed above, with what it did not cover.
- A browser-only attendee (WebBoxes): not tested here.
- Real model quality: step 9 used codex as the agent; the app's own offline agent and a DeepSeek-backed model were not part of this walk.
- The PTY terminals (`pty:claude`, `pty:codex`, `pty:pi`) were listed but not opened (see C5).

## The walk on Windows (recheck on 1.0.7, 2026-10-29)

Replayed on `mbpi9win` (Windows 10 Pro 19045, x64) on the published `acrylblends@1.0.7`, with `create-acrylblends@1.0.7`; the guide is
`docs/framework/workshop/README.md` on `workshop-guide`. Isolation: a scratch root with its own `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`
and npm cache, and a **portable Node 22.23.4 (npm 10.9.9)** unzipped in it; no system installs. The app and its window ran in the console
session through one-shot `/IT` scheduled tasks, each deleted afterwards.

**The isolation trap, found first:** on Windows PowerShell 5.1, `~` and `$HOME` follow `USERPROFILE` only when it is set **before**
PowerShell starts. Setting `$env:USERPROFILE` (or even `$HOME`) inside a script leaves `~` at the real home. Every PowerShell step here was
launched from a small `.cmd` that sets the scratch variables first.

| # | Item | Result | Evidence (exact) |
| --- | --- | --- | --- |
| 1 | `npx acrylblends@latest preflight` | **PASS** | exit 0; `PASS node 22.23.4`, `PASS npm 10.9.9`, `PASS git 2.55.0.windows.2`, `PASS agent claude, codex`, `PASS port 127.0.0.1:3100 is free`, `PASS powershell Windows PowerShell 5.1.19041.6456`, `NOTE gh not logged in`, `NOTE long paths off`, `NOTE git bash this shell rewrites /paths: the door handles it from acrylblends 1.0.7`, `Ready for the workshop.` |
| 2 | `npm create acrylblends@1.0.7 my-app agent`, install, dev, `/hello` | **PASS** | created with no workaround (`created my-app (agent) ... 115 files`); `npm install` `added 15 packages ... found 0 vulnerabilities` in 4 s; `npm run dev` listening on `http://127.0.0.1:3503` in 3 s; `/health` 200; after adding `.get('/hello', (c) => c.json({ hello: 'workshop' }))` the log printed `Restarting 'src/main.ts'` and `/hello` answered `{"hello":"workshop"}` 200 |
| 3 | The panel starts pi (or codex) with no patch | **FAIL** | session lists `agent`, `codex`, `pi`; `/ask` with `codex` starts it (tool event arrives) but the run ends: `{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account.",...}}`, then `codex ended with exit code 1`. `/ask` with `pi`: `{"error":"the driver \"pi\" is not available here (agent, codex)"}` although the session listed it. Two causes below (B1, B2). |
| 4 | `act navigate /nope` from Git Bash, back; two Edge tabs | **PASS** | `acryl act navigate --path /nope` -> `{"ok":true,"detail":"going to /nope; 404 at /nope: the app serves no page there, ..."}` in 489 ms; `--path /` -> `200 at /` in 463 ms; `look` 191 ms; two Edge tabs through CDP each answered `health 200` in 38 ms together, twice, while both stayed open |
| 5 | Block 4: desktop | **PASS, with the gaps below** | `npm run desktop`: `Downloading Electron binary...` then `desktop: attached to the app already running from this folder at http://127.0.0.1:3503`; `window list` -> window 1 `my-app /`; `window open --path /settings` -> window 2 opened in 204 ms but titled `404 Not Found` (the app serves no `/settings`); `look --window 1` 198 ms, `look --window 2` 203 ms; `act navigate --window 2 --path /` -> `200 at /` in 200 ms; `menu click --path "Edit>Copy"` -> `{"ok":true,"detail":"pressed Edit>Copy"}` in 194 ms; `window close --id 2` closed it; `window close --id 1` -> `{"ok":false,"code":"last-window","message":"window 1 is the app's last window: closing it ends the desktop app. Open another window first, or pass force to end it on purpose"}`; `--force` closes it. The panel inside the window was not visually confirmed: a console screenshot through the task service came back blank (locked console). |
| 6 | Block 5: `NODE_ENV=production npm start` | **FAIL** | start line reads `extensions: none found in plugins/` (the guide expects `extensions (read-only): board`); `/` 200, `/health` 200, `/board` 404, `/api/agent-panel/session` 404, `/ask` 404. The board extension cannot exist because item 3's agent cannot run on this box; nothing else in production was wrong. |
| + | Two Electron windows at once, `look --window` on each | **PASS** | both windows open; `look --window 1` 198 ms and `look --window 2` 203 ms back to back, no queueing (the 1.0.6 six-connection stall is gone). The panel's Stop could not be exercised: no agent run could start (item 3). |

Both Edge and the two-window case were driven over Chromium DevTools from the ssh session; every door call ran from Git Bash, so the
1.0.7 path handling held (`/nope` reached the door unchanged).

### Frictions, ranked

**Blockers**

- **B1. An agent spawned by an app started over ssh dies before it runs.** With the dev server started from an ssh (session 0) shell, `/ask`
  with `codex` answered `{"event":"error","data":{"message":"codex ended with exit code 3221225794"}}` (0xC0000142, DLL init failed); the same
  app started in the console session ran codex normally. Anyone rehearsing remotely, or a facilitator on a remote machine, hits this; the
  guide says nothing about the session an app must run in.
- **B2. codex ignores the isolated HOME and reads the real user profile; the panel surfaces only its model error.** On Windows, codex resolves
  its home through the OS Known Folder API, so `USERPROFILE`/`HOME` overrides do not move `~/.codex` - copying `auth.json` and `config.toml`
  into the scratch home changed nothing, and the real `C:\Users\alexa\.codex` was written during the attempts. With a real config that pins
  `model = "gpt-5.6-sol"` (rejected for a ChatGPT account), no run can complete, and preflight still says PASS for the agent.

**Confusing**

- **C1. `pi` is listed as a chat driver and refused when used.** `GET /api/agent-panel/session` offered `pi`; `/ask` with `pi` answered
  `the driver "pi" is not available here (agent, codex)`. Same shape as the macOS walk's C3, now with an exact message.
- **C2. Block 4's prompt has no target in 1.0.7.** The guide asks the agent to "use the File menu to open its settings" and the item names
  `/settings`; the window's menu is Electron's default (File>Exit, Edit, View, Window) with no Settings item, and the app serves no `/settings`
  page (window 2 opened on `404 Not Found`).
- **C3. The first desktop launch downloads Electron at run time** (`Downloading Electron binary...`), not at `npm install`, so the window is
  silent for a while after the attach line; the guide's "Stuck?" text says about 200 MB but not that the download happens then.

**Cosmetic**

- **K1. A clean `preflight` ends with an npm-update notice on stderr**, which PowerShell 5.1 prints as a `NativeCommandError` block
  (`node.exe : npm notice ... CategoryInfo : NotSpecified`) after `Ready for the workshop.` - it reads like a failure though the exit is 0.
- **K2. PowerShell 5.1 `~` isolation trap** (above): setting `$env:USERPROFILE`/`$HOME` inside the script leaves `~` at the real home; the
  scratch variables must be set by a `.cmd` (or `cmd /c "set ... && powershell ..."`) before PowerShell starts.

### PowerShell vs cmd, as walked

| | cmd | PowerShell 5.1 |
| --- | --- | --- |
| One env var for one command | `set NODE_ENV=production&& npm start` | `$env:NODE_ENV="production"; npm start` |
| Scratch HOME that `~` honours | `set USERPROFILE=...` then start PowerShell from the same .cmd | setting `$env:USERPROFILE`/`$HOME` inside the script is too late: launch PowerShell with the variables already set |
| Find the dev server's port | `netstat -ano | findstr :3503` | same output through `netstat`, or `Get-NetTCPConnection -LocalPort 3503` |
| Stop it | `taskkill /PID <pid> /F` | same; `Stop-Process -Id <pid>` needs the pid from `Get-NetTCPConnection` |
| A window that needs the desktop | a `/IT` scheduled task (as walked) | same |

**Cleanup, checked at the end:** the five `w107-*` scheduled tasks deleted, no `node.exe`, `electron.exe` or walk-owned `msedge.exe`
process left, the scratch root `C:\Users\alexa\scratch-acryl\w107` removed, and the real `~/.acryl` (2026-10-09) and `~/.dsh`
(2026-10-08) untouched. One exception, and it is B2: codex wrote into the real `~/.codex` (its sqlite state and model cache) because it does
not honour the HOME override; the walk's own app data all stayed in the scratch folder.

### Rerun in the console session (same day) and two corrections

The first pass started the app from the ssh shell (session 0) and failed item 3 for that reason; the rerun started it in the console session through a
one-shot `/IT` task, with the real `~/.pi` linked into the scratch home by a directory junction (no copy), so `pi` is offered. What the rerun found:

- **`pi` is offered and starts, but its credential is rejected.** The panel listed `agent, codex, pi` and the run began, then the panel's log showed the
  provider's answer - `Your api key: ****49f3 is invalid (authentication_error, request_id 6015eaa1-336a-4516-895f-b2535f56b9cb)` - and `pi ended with
  exit code 1`, within 5 s. Run directly on the box, `pi -p "say ok"` answers a different 400: `Third-party apps now draw from your extra usage, not your
  plan limits. Add more at claude.ai/settings/usage` (its own default provider is Claude). Neither credential on this machine can complete a turn.
- **Correction to C1 above: `pi` listed and then refused was not a registry bug.** The list and the drivers agree: `pi` is registered only when a
  DeepSeek key is present (`DEEPSEEK_API_KEY`, or a `deepseek` entry in `~/.pi/agent/auth.json`), and the refusal I quoted came from a *second* app
  instance (the console one, whose scratch home had no `~/.pi`) - the same registry that refused it also omitted it from its own list. With the junction
  in place the isolated app lists `pi` again. The real lesson is the one below: the agent's credentials live in the user's real profile.
- **The two-window case and item 6 could not be re-tested with a live run.** No agent run survives its first provider call on this machine, so (b) two
  windows during a live run and the panel's Stop have no run to test (the panel's Stop also cannot be clicked from outside: the desktop window exposes no
  debugging port, and the button lives in the panel's shadow root, invisible to the door). The earlier two-window measurement stands as a page-level
  result only: `look --window 1` 198 ms, `look --window 2` 203 ms, no queueing. For the same reason item 6 stays failing here: production has no `board`
  extension to serve because no agent could build one.
- **For attendees with codex:** if the panel answers `model_not_found` ("The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT
  account"), the attendee's own `~/.codex/config.toml` names a model their account does not include; pick a supported model there (or in codex's
  `/model`) before the session. ACRYL cannot fix it and does not mask it.
- **Codex files written into the real profile during the first pass** (names and sizes only; nothing was changed or reverted): `logs_2.sqlite` 16,523,264;
  `state_5.sqlite-wal` 510,912; `models_cache.json` 177,492; `thread_history_1.sqlite-wal` 193,672; `cache/codex_apps_tools/71a3cb5f….json` 3,213,439;
  six `plugins/cache/openai-curated-remote/*/.codex-remote-plugin-install.json` files of 100-104 bytes each; and five `*.sqlite-shm` files of 32,768.

## The walk on Windows, rerun on 1.0.10 (2026-10-30)

Same machine, same isolation (scratch HOME/APPDATA/npm cache, portable Node 22.23.4, one-shot `/IT` tasks for the app, Edge and the windows); the
DeepSeek key is the box's own `~/.secure-storage/llmproviders/deepseek/deepseek.json`, read by the launcher script into `DEEPSEEK_API_KEY` in its process
environment only - never printed, written to a file, put on a command line or into the scratch `~/.pi`. Codex stayed out.

| # | Item | Result | Evidence (exact) |
| --- | --- | --- | --- |
| 1 | preflight + create `@1.0.10` | **PASS** | preflight exit 0 in 13 s: `PASS agent claude ..., codex ..., pi (DeepSeek key found)`; `npm create acrylblends@1.0.10` 8 s (115 files); install 4 s, 0 vulnerabilities |
| 2 | pi builds the board from the panel | **PASS** | run started from the page's panel with driver `pi`; `/board` answered 200 after **356 s**; `{"board":true,"cards":[{"id":"card-…","title":"New card 1","column":"backlog",...}]}`; the agent's own report lists the door actions it took (New card, Mark done, move, filters All/Mine/Done, delete, `npm run check`, `npm test 14/14`) |
| 3 | desktop: sidebar, second window at `/settings`, change + Save, shows in window 1, Settings menu | **PASS, one caveat** | door audit in order: `act navigate window 1 -> /board`, `window-open window 3` (title `Settings - my-app`, path `/settings`), `act select` on the `Appearance` combobox in window 3, `act reload window 1`, `menu-click File>Settings...` (it focused the open `/settings` window, not a duplicate); `look --window 3` shows `role=status name="Saved: Dark"`, and the agent reported that `localStorage.theme` is shared by every window of the origin and that it reloaded the board window so the dark theme re-ran. Caveat: the door reports page structure and text, not computed colours, so "shows in window 1" rests on the saved value plus the reload, not on pixel comparison; no separate sidebar-toggle click was logged in this run (the board's own filter sidebar was exercised with clicks in item 2). 1.0.10 does have the `File>Settings...` menu item that 1.0.7 lacked. |
| 4 | two windows open during the live run; look in both; Stop | **PASS** | during a live `pi` run with windows 1 (`/board`) and 2 (`/settings`): `look --window 1` 338 ms then 353 ms, `look --window 2` 317 ms then 328 ms; the panel's **Stop** clicked in the live tab: `button.stop` went disabled and the audit logged `ask end` 3 s later (`02:34:13`), no queueing |
| 5 | production | **PASS** | start line `extensions (read-only): board`; `/` 200, `/board` 200 (`{"board":true,"cards":[]}`), `/health` 200; `/api/agent-panel/session` 404, `/ask` 404, `/extensions` 404 |

What this rerun confirms on Windows: the 1.0.7 blockers were credentials (pi's key and codex's model), not the framework; with the box's own DeepSeek key the
panel builds and installs the board, the window and menu verbs work, the Settings menu opens `/settings`, Save reports `Saved: Dark`, two windows with live
streams answer `look` in about 300 ms and Stop ends the run, and production serves the installed board read-only with the agent routes gone.

Cleanup: `w110-*` tasks deleted, no `node.exe`/`electron.exe` left, scratch `C:\Users\alexa\scratch-acryl\w110` removed; real `~/.acryl` (2026-10-09) and
`~/.dsh` (2026-10-08) untouched. Codex was not run in this pass.
