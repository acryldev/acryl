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

## If something goes wrong

- `acryl doctor` diagnoses an app from its files and logs, even when it cannot start: `node apps/acryl-cli/lib/bin.js doctor`.
- Builds write each package's `lib/` in place; never run two builds at once in the same checkout. For a long build use
  `node scripts/with-build-lock.mjs corepack pnpm run check`.
- Write down the command, the last 30 lines of its output and your OS and Node version (guide 5).

In the following guides, `acryl` means `node <your clone>/apps/acryl-cli/lib/bin.js`. A shell alias saves typing:

```bash
alias acryl="node $PWD/apps/acryl-cli/lib/bin.js"
```
