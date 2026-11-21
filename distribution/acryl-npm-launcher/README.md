# ACRYL

**Everything is a plugin. Build agentic apps.**

Let your users build the product they need.

Every ACRYL app has its own agent. Your users say "add XYZ", and seconds later the change is live for them and their team. You keep shipping the
foundation; they keep their layer.

Build agentic apps from plugins. Start blank, grow with an agent, share what you make. ACRYL is the open platform and framework underneath: the agent
is one part of your app, and our own IDE is one app built on it.

## One command

`acryl` is the front door to the whole platform: ACRYL Control Center, where your apps, the Blends store, sharing and your keys live.

| Command | What opens |
| --- | --- |
| `npx acryl` | ACRYL Control Center in this terminal |
| `npx acryl --tui` | the same: ACRYL Control Center in this terminal |
| `npx acryl --gui` | ACRYL Control Center in its own window |
| `npx acryl --web` | ACRYL Control Center in your browser |

In the terminal, ACRYL Control Center does what the window does, with the same code underneath:

- **Your apps**: start one in the browser or in its own window, stop it, open its folder, update it to its Blend's newest release.
- **Blends store**: ready apps by category, Official and Community, with search. Make your own copy in a keystroke.
- **New app**: from a starter (blank, Node.js, notes, chat, to-do, agent), on the web or the desktop.
- **Share**: push an app to your GitHub. Public apps are listed in the Blends store.
- **Plugins**: pull a plugin into a running app, or publish one of yours for others to pull.
- **Deploy to WebBoxes.ai**: a hosted copy for you and your team.
- **Connect GitHub**: one sign-in with a device code, used by every app.
- **Model key**: your DeepSeek or OrcaRouter key, once, for every app (never shown).
- **ACRYL ADE**: the agent development environment, in the browser, a window or the terminal.

`acryl --gui` opens the installed ACRYL Control Center app when you have it
([downloads](https://github.com/acrylblends/63-acryl-control-center/releases/latest)), otherwise it makes the Control Center Blend once in
`~/.acryl/control-center` and opens that. `acryl --web` uses the same copy and opens your browser at its address. Add `--update` to bring that copy up to
the newest release first.

## For scripts and agents

Every screen has a command a script or a coding agent can type:

| Command | What it does |
| --- | --- |
| `acryl apps` | list the apps on this computer |
| `acryl apps add <folder>` / `acryl apps remove <id>` | put an app folder in the list, or take it out (the folder stays) |
| `acryl new <name> [starter]` | make an app from a starter |
| `acryl make <name> --from <id>` | make an app from a Blend in the store |
| `acryl store [words]` | list the store's Blends: id, name, category, Official or Community |
| `acryl update` | in an app folder: the newest frame and library plugins |
| `acryl plugin publish <name>` / `acryl plugin pull <source>` | in an app folder: share a plugin, or add someone's |
| `acryl blends <command>` | the acrylblends command (add, upgrade, open, preflight, ...) |
| `acryl ade [--web \| --gui \| --tui]` | ACRYL ADE in the browser, a window, or the terminal agent |
| `acryl model [set deepseek \| set orcarouter \| clear]` | the model key every app started from ACRYL gets |
| `acryl --help` / `acryl --version` | every command / this package's version |

Without a terminal (a script, a pipe, an agent), a bare `acryl` prints the help.

## How it works

1. **Building blocks.** An ACRYL app is made of Cordis plugins: small parts with their own lifecycle that can be added, replaced and removed while the
   app runs.
2. **An agent builds with them.** The agent works through the app's door, with the same blocks: ACRYL chat, Claude Code, Codex or Pi.
3. **Sandboxed per person.** Each person's changes run in their own space, so one user's "add XYZ" never breaks anyone else's app.
4. **Your change is a layer.** It is a versioned Blend: save it, roll it back, share it to GitHub, list it in the store.
5. **The foundation keeps shipping.** When a new release comes out, `acrylblends update` merges it in and keeps every layer.

## Where things go

Everything ACRYL keeps (the list of apps, your keys, the Control Center and ADE copies) is in `~/.acryl`. New apps are suggested in `~/ACRYL`.
`npx acryl` downloads only this small package (Node.js 22.19 or later); the rest is fetched the first time you use it.

## Links

- Website: https://acryl.dev
- Get started: https://acryl.dev/start
- Blends store: https://acrylblends.github.io
- Source: https://github.com/acryldev/acryl
- Discord: https://discord.gg/cY9KXMex69

## License

MIT
