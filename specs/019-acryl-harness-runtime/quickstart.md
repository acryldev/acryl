# Validation Quickstart: ACRYL Shared Harness Runtime

## Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`
- Corepack-enabled Yarn 4.18.0
- Dependencies installed with `corepack yarn install --immutable`
- Pinned Harness submodule initialized with `git submodule update --init --recursive`
- A normal provider-owned Harness profile authentication path configured when
  testing real model interaction

## Fast verification

Run after each focused implementation slice:

```bash
corepack yarn workspace acryl-harness-runtime typecheck
corepack yarn workspace acryl-harness-runtime test
corepack yarn workspace acryl-control test
corepack yarn workspace acryl-tui test
```

## Walking-skeleton acceptance

1. Start from an isolated `DSH_HOME` and ACRYL control state directory.
2. Run the standalone terminal profile command in a headless/status mode.
3. Verify a single runtime generation reports live `sessions` and `agents`.
4. Verify the owner terminal created a new durable Harness session.
5. Start a second surface for the same profile.
6. Verify it attaches to the first owner and cannot submit an agent action
   before an explicit active-control lease is acquired.
7. Verify a request with wrong generation or token receives no runtime data.
8. Close the active surface and verify its lease is released, not transferred.
9. Dispose the owner and verify endpoint/token/owner metadata no longer exists.
10. Repeat the boot/dispose sequence ten times and inspect that no owner,
    listener, socket, or runtime process remains.

## Full headless gate

```bash
corepack yarn check
```

Do not use a GUI launch as a substitute for the headless lifecycle and contract
gates. GUI validation, when needed, is an explicit final acceptance observation.
