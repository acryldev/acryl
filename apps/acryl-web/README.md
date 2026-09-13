# acryl-web

The ACRYL **browser surface** — a separate 3rd-surface distribution for the
local web UI, kept out of the lightweight `acryl` terminal CLI.

## Why separate

`acryl` (the terminal CLI) is built from `tomowang/dsh-tui` + pi-tui and should
be lightweight: it ships only `acryl-harness-runtime` and the TUI closure, not
the browser client. The web server (`dsh-base` + `dsh-web-app` → host + client)
lives here instead.

## Install and use

`acryl-web` is published as a public npm package. It starts a local server on
`127.0.0.1`; it is not a hosted ACRYL service and does not send your project to
an ACRYL cloud.

```sh
pnpm add --global acryl-web
acryl-web
```

Open the printed local URL in a browser. For automation or a readiness probe:

```sh
acryl-web --json
```

For repository development:

```sh
pnpm --filter acryl-web run build
node acryl-web/lib/bin.js
```

`acryl-web` bundles `acryl-control` + `acryl-harness-runtime` into
`lib/bin.js` (self-contained) and declares the audited `@deepseek-ai/dsh-*` web
closure as external deps, so a standalone install resolves the full runtime.
