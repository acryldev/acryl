# Human test: the blank canvas, branding, and growing a Blend

You need a model key configured the way you normally use ACRYL (sign in from the app, or a provider key). Everything below runs as a named instance in its own home, so your real
ACRYL profile is never touched. From the worktree root, once: `corepack pnpm install --frozen-lockfile` and `corepack pnpm run build` (or run your usual dev build).

## 1. Start the blank canvas (2 minutes)

From the worktree root, either the package scripts or the shell scripts (same thing):

| Surface | pnpm | shell |
| --- | --- | --- |
| Web (browser) | `corepack pnpm run acryl-blank-web` | `./scripts/acryl-blank-web.sh` |
| Desktop (Electron) | `corepack pnpm run acryl-blank-desktop` | `./scripts/acryl-blank-desktop.sh` |
| CLI (terminal) | `corepack pnpm run acryl-blank-cli` | `./scripts/acryl-blank-cli.sh` |

**Web:** it builds if needed, then prints `ACRYL web: http://127.0.0.1:3081/?token=...`. **Open exactly that URL in your browser** (the token is required). Leave the terminal running; stop with Ctrl+C.
**Desktop:** it builds, then a window opens by itself. **CLI:** the terminal becomes the chat.

**Instances.** Every launch is a named instance (default `blank`) with its own home `~/.acryl-instances/<name>`, its own stable port and its own Desktop user data, so several run together
without touching each other or your real ACRYL: `./scripts/acryl-blank-web.sh --instance orbit`, then `--instance acme` in another terminal. A second start of the same name is refused.
`node scripts/instances.mjs list` shows what is running, `stop <name>` stops one, `path <name>` prints where its data lives (delete it to reset). Ctrl+C in the launcher's terminal also stops it cleanly.

Options (after the script name, or after `--` with pnpm): `--name Orbit --accent '#e8590c'` to rebrand, `--blueprint <file.yaml>` for your own definition, `--port 3090` for Web.
Example: `./scripts/acryl-blank-web.sh --name Orbit`.

This branch never fights the main-branch app: `pnpm run web` and `blank.mjs web` start from port **3081** and move to the next free port (3082, 3083, ...) if it is taken; the
port actually used is printed (`ACRYL web: ...`). `ACRYL_WEB_PORT=<n>` chooses another starting port; a plain `acryl-web` binary without it still uses 3080.

Expect on Web: the sidebar and the tab title say **Orbit** with an orange mark, a plain chat, and none of the product's Projects, workspace, Market or Plugins panel.
The first launch shows the harness's "Internal Testing Notice"; that is upstream text, listed under known gaps.

## 2. The core idea: grow it into an organizer (10 minutes)

Ask the blank instance, in the chat:

> I want a simple personal organizer: a to-do list, a calendar, and booking meetings so that two meetings can never overlap. Build it as a plugin in this app and install it so I can use it right now.

Expect: the agent reads its own docs, writes a plugin, installs it live (no restart), and reports it active. Then:

> Book a one hour meeting called Design sync with Sam on 2026-10-01 at 14:00 UTC, add a to-do Prepare the review due that day, show me the agenda for 2026-10-01, and try to book a 30 minute call at 14:30 UTC the same day.

Expect the overlapping booking to be refused. Ask it to change something ("also show free slots") and watch it update live.

## 3. Capture it and restore it (5 minutes)

In the chat run `/blend snapshot`, then `/blend verify`. A directory `.acryl/blend/` appears in the workspace: `blend.yaml` (intent), `blend.lock.json` (digests) and
`extensions/` (the source of what was built). Start a second blank instance (`node scripts/blank.mjs web --port 3082`), open the same workspace folder, run `/blend apply`, and
the organizer is back. `/blend ledger` shows the history.

## 4. Make it your own product (5 minutes)

```bash
node scripts/blank.mjs web --blueprint specs/036-cordis-ecosystem-and-acryl-blends/samples/private-brand.blueprint.yaml
```

Expect "Acme Notes", a green mark and a serif font. Copy that file, change the name, colors and `rows:`, and you have your own product definition with no code and no fork.
A typo in the file stops start-up with a message naming it; it never silently boots the wrong product.

## What to tell me

- Did Blank feel like a starting point you would grow, or too bare? What is the one thing you reached for and it was not there?
- Did the agent build the organizer without help, and how many tries did it take?
- Does branding cover what you would need for your own product (what else must change: window icon, first-launch text, login)?
- Which starter Blueprints beyond blank would you want first (the category list is `docs/acrylbelnds_100ctgs/`)?

## Known gaps

The Electron window title, dock icon and tray are not branded yet; the CLI banner and palette are not branded (only the agent's identity line is); the first-launch
"Internal Testing Notice" is the harness's; Blueprints come from the two built-ins or a YAML file, not yet from a hub.
