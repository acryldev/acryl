# Human test: the blank canvas, branding, and growing a Blend

You need a model key configured the way you normally use ACRYL (sign in from the app, or a provider key). Everything below runs in its own home, so your real
ACRYL profile is never touched. From the worktree root, once: `corepack pnpm install --frozen-lockfile` and `corepack pnpm run build` (or run your usual dev build).

## 1. See the blank canvas (2 minutes)

```bash
node scripts/blank.mjs web --name Orbit --accent '#e8590c'      # then open the "dsh web:" URL it prints (port 3081; 3080 is the main-branch app)
node scripts/blank.mjs cli --name Orbit                          # terminal
node scripts/blank.mjs desktop --name Orbit                      # Electron, isolated dev home
```

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
