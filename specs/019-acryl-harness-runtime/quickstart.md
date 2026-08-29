# Validation Quickstart: ACRYL pi-tui Durable Session Surface

## Automated gate

```bash
corepack pnpm --filter acryl-control test
corepack pnpm --filter acryl-harness-runtime test
corepack pnpm --filter acryl-tui test
corepack pnpm --filter acryl-tui typecheck
git diff --check
```

## Human acceptance

With a normal authenticated DSH profile:

```bash
corepack pnpm --filter acryl-tui run build
node acryl-tui/lib/bin.js tui --profile acryl
```

1. Confirm the terminal enters a pi-tui alternate screen.
2. Submit a prompt with Enter.
3. Confirm durable user/assistant transcript, running/idle state, and tool state render.
4. Press `Ctrl+C` during a running turn to cancel; press it while idle to exit and restore the terminal.
5. Resume with `node acryl-tui/lib/bin.js tui --profile acryl --resume <session-id>` and confirm history plus continued prompting.
6. Confirm `node acryl-tui/lib/bin.js tui --profile acryl --json` stays headless.

No second running surface, owner discovery, lease, attachment, socket, or control artifact check is part of acceptance.
