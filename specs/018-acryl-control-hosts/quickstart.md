# Quickstart: ACRYL Standalone Agent and Peer Hosts

Validation guide for the `acryl` terminal host and peer host separation. Prerequisites, setup, run, and expected outcomes only; implementation detail lives in `tasks.md`.

## Prerequisites

- Repository checkout with `corepack yarn install --immutable` completed and the pinned upstream submodule initialized.
- Node `^22.19.0` or `>=24.0.0` for the DSH control plane.
- Bun `1.3.0+` or Node `26.4.0+` for the `@opentui/core` presentation spine (see `research.md`).

## Setup

```bash
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn build
```

## 1 - Standalone direct mode

```bash
acryl --profile desktop
```

Expected:

- The TUI starts in `direct` mode.
- The status region shows owner kind `tui`, the `desktop` profile, generation, and protocol version.
- The agent workspace shows a persistent session list, composer, and transcript.
- Exiting and re-running resumes the same durable session rather than replaying terminal scrollback.

## 2 - Single-writer ownership

```bash
acryl --profile desktop &     # acquires ownership
acryl --profile desktop       # second instance attaches
```

Expected:

- The second instance reports `attached` mode and projects the live owner.
- It does not start a second writable runtime.

## 3 - Architecture and lifecycle

```bash
acryl architecture --plane host --json
acryl plugin enable <admitted-entry-id> --json
acryl plugin reload <admitted-entry-id> --json
```

Expected:

- Architecture output projects native Fiber/service state without inventing a registry.
- Lifecycle receipts report settlement and restart class.
- Protected rows reject mutation with a reason.

## 4 - Non-interactive contract

```bash
acryl profile list --json
acryl plugin list --json
```

Expected:

- stdout contains exactly one canonical JSON result per invocation.
- Diagnostics and progress use stderr.
- Success commands exit `0`; denied/invalid/failed commands use documented nonzero classes.

## 5 - GUI and Web launchers

```bash
acryl gui --profile desktop
acryl web --profile desktop
```

Expected:

- Each launches its host; convenience `acryl-gui` / `acryl-web` delegate to the same commands.

## 6 - Disable the TUI presentation plugin

With the terminal presentation plugin disabled, `acryl` still offers narrow recovery commands (`acryl plugin enable <id>`, read-only diagnostics) but no normal TUI contributions.

## Verification gate

```bash
corepack yarn verify
corepack yarn check
```

All existing and new run-once tests must pass; no watch or interactive test modes are used.
