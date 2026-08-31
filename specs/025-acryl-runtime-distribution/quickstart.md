# Validation Guide: Runtime and Distribution Milestone

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0`
- Corepack enabled
- Pinned submodule initialized
- Dependencies installed with `corepack pnpm install --frozen-lockfile`

## Core regression gate

```sh
corepack pnpm --filter acryl-control run build
corepack pnpm --filter acryl-harness-runtime run check
corepack pnpm --filter acryl-tui run check
corepack pnpm --filter acryl-desktop run verify:closure
```

Expected: all checks pass, including the authorization-enabled terminal tests.

## CLI archive gate

```sh
corepack pnpm --filter acryl-control run build
corepack pnpm --filter acryl-harness-runtime run build
corepack pnpm --filter acryl-tui run build
node scripts/build-cli-archive.mjs darwin-arm64 24.19.0 release-artifacts
node scripts/verify-cli-archive-payload.mjs release-artifacts/acryl-cli-darwin-arm64.tar.gz darwin arm64
```

Extract the archive in an empty directory and verify:

```sh
env PATH=/usr/bin:/bin ./bin/acryl --version
env PATH=/usr/bin:/bin ./bin/acryl tui --json
```

Expected: no host Node requirement, valid version/readiness output, and artifact verification reports no foreign native or forbidden release files.

## Optional capability gate

1. Install the terminal-only product.
2. Run `acryl tui --json` and an authorization/session fixture.
3. Verify Web, Market, Canvas, and plugin-management optional capability identifiers are absent from its production closure.
4. Install/enable one optional capability.
5. Verify its surface boots and then unload/reload it repeatedly without stale routes, registrations, processes, or subscriptions.

## Shared composition gate

1. Boot the same fixture profile through the direct TUI adapter and the Web/Desktop transport.
2. Create/resume the same durable session.
3. Submit one prompt, observe a tool event, cancel a turn, and dispose the client.
4. Compare durable event sequence and final projection.

Expected: surface presentation differs, but durable operation/result semantics match.

## Local runtime gate

1. Run `acryl serve`.
2. Attach a supported client and begin a fixture session.
3. Detach it and attach a second supported surface.
4. Verify the same durable session remains available.
5. Stop the server and inspect the endpoint record and process/socket diagnostics.

Expected: incompatible clients are rejected without mutation; shutdown removes endpoint metadata and leaves no owned resources.
