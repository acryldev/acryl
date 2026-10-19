# 1. Set up

About 10 minutes on a fast connection. Tested on macOS (Apple Silicon), Ubuntu 24.04 and Windows 10 (Git Bash).

## You need

- **Node.js** `^22.19.0` or `>=24.0.0`, native to your CPU. On an Apple Silicon Mac, check `node -p process.arch` says `arm64` (an Intel-build Node
  under Rosetta is a known problem, spec 001 T093).
- **corepack** (it ships with Node; it supplies the exact pnpm this repository pins).
- **git**, and for guide 4 the GitHub CLI `gh`, signed in.
- **A model key**, for example a DeepSeek API key.

## Clone, install, build

```bash
git clone https://github.com/acryldev/acryl.git
cd acryl
corepack pnpm run upstream:sync          # the pinned DeepSeek Harness submodule (about 2 min)
corepack pnpm install --frozen-lockfile
corepack pnpm run build                  # about 2 to 4 min
```

Expected: every step ends without an error. Note the times.

## Check it

```bash
corepack pnpm run check                  # typecheck, tests and build, the same gate CI runs
```

Expected: it ends green. If one test fails, run it again once: a test that passes the second time is a flaky test, and worth reporting as such.

## Start ACRYL

```bash
corepack pnpm run dev                    # ACRYL Desktop, in its own isolated home (~/.acryl-dev)
corepack pnpm run web                    # or the same in your browser; it prints the URL to open
```

On first start, open **Settings** (bottom left) or the "Add an API key" prompt and enter your model key. Send "hello" in the chat: the agent answers.

## Get the `acryl` command

The `acryl` command is the CLI you just built: `apps/acryl-cli/lib/bin.js` in your clone. Every other guide uses it (`acryl new my-app`,
`acryl plugin pull ...`), so put it on your PATH once.

Do **not** use `npm install -g acryl` for these tests: the published package (0.2.5) runs ACRYL, but it cannot create Blend apps yet (`acryl new`
needs the framework clone, spec 036 T013).

macOS and Linux:

```bash
mkdir -p ~/.local/bin
printf '#!/usr/bin/env bash\nexec node "%s/apps/acryl-cli/lib/bin.js" "$@"\n' "$PWD" > ~/.local/bin/acryl   # run this inside your clone
chmod +x ~/.local/bin/acryl
export PATH="$HOME/.local/bin:$PATH"     # add this line to ~/.zshrc or ~/.bashrc to keep it
```

Windows (Git Bash): the same three lines work; or call it directly as `node <your clone>/apps/acryl-cli/lib/bin.js`.

Check it:

```bash
command -v acryl          # ~/.local/bin/acryl, not a global npm install
acryl --help              # lists new, save, remote connect, plugin pull, ...
```

`acryl --version` prints the last release number (0.2.5), also when built from `main`; `command -v acryl` is how you tell which one you run.

After you pull new commits, run `corepack pnpm run build` again: the `acryl` command runs the build in your clone.

## If something goes wrong

- `acryl doctor` diagnoses an app from its files and logs, even when it cannot start: `node apps/acryl-cli/lib/bin.js doctor`.
- Builds write each package's `lib/` in place; never run two builds at once in the same checkout. For a long build use
  `node scripts/with-build-lock.mjs corepack pnpm run check`.
- Write down the command, the last 30 lines of its output and your OS and Node version (guide 5).
