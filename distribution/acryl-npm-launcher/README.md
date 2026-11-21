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
| `npx acryl@latest` | ACRYL Control Center in this terminal |
| `npx acryl@latest --tui` | the same: ACRYL Control Center in this terminal |
| `npx acryl@latest --gui` | ACRYL Control Center in its own window |
| `npx acryl@latest --web` | ACRYL Control Center in your browser |

Always `@latest`: an old npm cache or a slow registry mirror can otherwise start an older ACRYL. `npx acryl@latest --version` shows which one runs.

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

## How your users build: five steps

1. **Building blocks, not source code.** Every app is assembled from Cordis plugins: UI, data and actions behind stable services.
2. **The agent builds with those blocks.** ACRYL's chat, and Claude Code, Codex or Pi, operate the app through its door. The core code stays untouched.
3. **Sandboxed per person.** Every app runs in its own instance, on your machine or in your own [WebBox](https://webboxes.ai), with your rights only.
4. **Your change is a versioned layer: a Blend.** Save, roll back, share it to GitHub, list it in the store.
5. **The foundation keeps shipping.** `npx acryl@latestblends update` merges new releases under your layer, and your changes stay.

## Where things go

Everything ACRYL keeps (the list of apps, your keys, the Control Center and ADE copies) is in `~/.acryl`. New apps are suggested in `~/ACRYL`.
`npx acryl@latest` downloads only this small package (Node.js 22.19 or later); the rest is fetched the first time you use it.

## Links

- Website: https://acryl.dev
- Get started: https://acryl.dev/start
- Blends store: https://acrylblends.github.io
- Source: https://github.com/acryldev/acryl
- Discord: https://discord.gg/cY9KXMex69

## License

MIT
