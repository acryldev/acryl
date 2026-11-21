# 1. Set up

About 10 minutes on a fast connection. Tested on macOS (Apple Silicon), Ubuntu 24.04 and Windows 10 (Git Bash).

## You need

- **Node.js** `^22.19.0` or `>=24.0.0`, native to your CPU. On an Apple Silicon Mac, check `node -p process.arch` says `arm64` (an Intel-build Node
  under Rosetta is a known problem, spec 001 T093).
- **git**, and for guide 4 the GitHub CLI `gh`, signed in.
- **A model key**, for example a DeepSeek API key.

## Get ACRYL: `npx acryl@latest`

`acryl` is one npm package, and it is the entry to everything: it opens **ACRYL Control Center** (your apps, the Blends store, sharing, the model key).

```bash
npx acryl@latest                    # Control Center in this terminal
npx acryl@latest --gui              # in its own window (the installed app, else the Blend in ~/.acryl/control-center)
npx acryl@latest --web              # in your browser; it prints the address and opens it
npm install -g acryl@latest        # optional: puts `acryl` on your PATH, so the guides can say `acryl new my-app`
acryl --version                     # the selector's version (0.3.3 or later)
```

Everything ACRYL keeps is under `~/.acryl`; new apps go in `~/ACRYL`.

Enter your model key once, without echo: `acryl model set deepseek` (or in Control Center, the model key screen). Every app started from ACRYL gets it.

The terminal coding agent is a separate download (about 450 MB, the first time only, after you answer `y`): `acryl ade --tui`. Its source and releases are
https://github.com/acryldev/acryl-terminal; the earlier browser surface (`acryl-web`) is there too.

Check it:

```bash
acryl --help             # Control Center, apps, the store, new/make/plugin/blends, ade, model
acryl ade --tui --version   # downloads the agent runtime on first use, then prints its version (0.3.0 or later)
```

## Make an app

```bash
acryl new my-app         # from a starter (blank, nodejs, notes, chat, todo, agent): runs create-acrylblends
acryl store              # the Blends in the store: id, name, category, Official or Community
acryl make my-app --from <id>
```

## Building ACRYL itself (only to change this repository)

This repository holds the reusable building blocks (the control plane, the harness runtime, the plugins, the framework). Products are built on their
published packages in their own repositories: the terminal agent in acryl-terminal, Control Center and ADE as acrylblends apps.

```bash
git clone https://github.com/acryldev/acryl.git
cd acryl
corepack pnpm run upstream:sync          # the pinned DeepSeek Harness submodule (about 2 min)
corepack pnpm install --frozen-lockfile
corepack pnpm run build                  # about 2 to 4 min
corepack pnpm run check                  # layout checks, typecheck, tests and build: the gate CI runs
```

Expected: every step ends green. If one test fails, run it again once: a test that passes the second time is a flaky test, and worth reporting as such.
Builds write each package's `lib/` in place; never run two builds at once in the same checkout. For a long build use
`node scripts/with-build-lock.mjs corepack pnpm run check`.

```bash
corepack pnpm run dev                    # Control Center from source, in its desktop window, on an isolated home (~/.acryl-dev)
corepack pnpm launcher web               # or in the browser (corepack pnpm launcher tui in the terminal)
```

To try a change made here in the terminal agent or the browser surface, build acryl-terminal against it and boot it with its `scripts/live-run.mjs`
(an isolated home; see AGENTS.md).

## If something goes wrong

- `acryl doctor` diagnoses an app from its files and logs, even when it cannot start.
- Write down the command, the last 30 lines of its output and your OS and Node version (guide 5).
