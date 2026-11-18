# The PTY driver with real agents (M8 evidence)

The gate of M8 is a real run of `claude`, `codex` and `pi` in the panel's terminal tab, each building one small feature through the door. The script is `scripts/verify-pty-agents.mjs` (a manual gate: it uses real models, so it is not in `pnpm run check`). Run on 2026-10-27 against the published `acrylblends` 0.10.0 with `agent-panel` and `driver-pty` added by the published command.

Each agent runs in its **interactive** mode in the PTY with one task as its first message: write a plugin in `plugins/<name>` that answers a route, install it into the running app with `.acryl/bin/acryl plugin add`, check through the door, say DONE and list the door commands it ran. A real headless Chrome has the panel's terminal tab open (screenshots below). The script answers each program's first-run trust question and tool-approval question the way a person would (Enter on "Yes"); it never types anything else.

| Agent | Feature | Working after | Agent idle after | Door commands it reported | Tool approvals pressed | Screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| claude | `GET /greet` answers `{"text":"hello from claude"}` | 19 s | 69 s | `plugin add`, `plugin list`, `brief --json`, then curl on the address from `.acryl/door.json` | 1 | [claude](pty-driver-evidence/claude-terminal.png) |
| codex | `GET /ping` answers `{"pong":true,"by":"codex"}` | 27 s | 69 s | `brief`, `plugin add` (first attempt failed on a relative import, fixed), `plugin list`, `brief --json`, curl | 0 | [codex](pty-driver-evidence/codex-terminal.png) |
| pi (deepseek-v4-pro) | `GET /about-json` answers `{"app":"agent-app","by":"pi"}` | 31 s | 67 s | `plugin add`, `plugin list --json`, curl on the address from `.acryl/door.json` | 0 | [pi](pty-driver-evidence/pi-terminal.png) |

"Working after" is the time from opening the terminal until the route answered the exact JSON, polled from outside. The agents' own final messages are in `*-final-screen.txt` next to the screenshots. Turns are not counted: an interactive terminal redraws its screen constantly, so the transcript says nothing about turns; the agents' token and cost lines are on their own screens (pi: 46k in, 3.9k out, $0.10).

## What was run

- **codex and pi** ran together in one fresh agent app (both plugins active in it at the end; `plugin list` shows `ping` and `about`).
- **claude** passed in its own fresh app from the same published version. A second attempt in the combined app stalled at the model call for 8 minutes with no output (the account was at 97% of its weekly usage limit), and was stopped; the evidence for claude is the first, passing run.
- Isolation: a minimal environment (no Claude Code session variables, which hang a nested claude), PATH with only node, npm and the agents' own folders so no global `acryl` can be reached, codex with a scratch `CODEX_HOME` holding only its login, claude with `--setting-sources project`. pi gets its DeepSeek key through the app's environment; it is never printed or written.

## What the run found

- `.acryl/bin/acryl brief` does not print the app's address, so claude, codex and pi each read it from `.acryl/door.json` to curl the new route. The door should say it.
- codex's first `plugin add` failed because its plugin imported the router by a relative path that does not exist in the app's copy; it switched to `import { Acryl } from 'acrylblends'`. The app guide should say which import a plugin uses.
- With the owner's own Codex settings and skills loaded, codex stopped to ask for a design confirmation instead of building; that is why the gate gives it a scratch `CODEX_HOME`.
