# acryl-web

The ACRYL **browser surface** — a separate 3rd-surface distribution for the
local web UI, kept out of the lightweight `acryl` terminal CLI.

## Why separate

`acryl` (the terminal CLI) is built from `tomowang/dsh-tui` + pi-tui and should
be lightweight: it ships only `acryl-harness-runtime` and the TUI closure, not
the browser client. The web server (`dsh-base` + `dsh-web-app` → host + client)
lives here instead.

## Usage

```sh
# Build
pnpm --filter acryl-web run build

# Serve the local web runtime (boots the 'web' profile via the shared runtime)
node lib/bin.js

# Headless readiness probe (boot, print URL, dispose)
node lib/bin.js --json
```

`acryl-web` bundles `acryl-control` + `acryl-harness-runtime` into
`lib/bin.js` (self-contained) and declares the audited `@deepseek-ai/dsh-*` web
closure as external deps, so a standalone install resolves the full runtime.
