# How ACRYL Works — The CLI Surface (`pnpm acryl`)

This directory documents, in detail, what actually happens when you type `pnpm acryl`
and the ACRYL terminal (TUI) coding agent comes up: which files load, in what order,
what gets composed into the runtime, and how data flows between the parts.

**Audience:** any engineer or agent working on the ACRYL runtime. Read `01`–`07` in order
for the full picture; each file also stands alone.

## The one-paragraph mental model

`pnpm acryl` runs **one Node process that owns one local Cordis root**. The process is
launched and styled by **`acryl-cli`** (the terminal surface), but the runtime itself is
assembled and booted by **`acryl-harness-runtime`**, which is the only package that knows
how to compose the pinned DeepSeek Harness (`@deepseek-ai/dsh-*` packages) into a live
profile. The TUI never talks to a server — it is a *direct host* over an in-process
runtime, connected through a single seam: `bootAcrylHarnessProfile()` to boot it and
`createAcrylSessionBridge()` to drive a durable session through it.

```
pnpm acryl
  └─ acryl-cli/bin/dev-run.mjs        rebuild-if-stale launcher (owned by acryl-cli)
      └─ acryl-cli/lib/bin.js         CLI entry (bin.ts)
          └─ re-exec node --expose-internals      (Cordis HMR prerequisite)
              └─ runAcryl()           cli/run.ts — arg parsing, probes
                  └─ runAcrylTui()    tui-app/session.ts — TUI session driver
                      ├─ startDirectHost()             host/direct.ts
                      │    └─ bootAcrylHarnessProfile()   acryl-harness-runtime
                      │         └─ Cordis root Context  (dsh-base + ACRYL patches)
                      └─ createAcrylSessionBridge(ctx)    acryl-harness-runtime
                           └─ durable DSH session ⇄ TuiStore ⇄ pi-tui UI
```

## Document map

| File | Contents |
|------|----------|
| [01-launch-chain.md](01-launch-chain.md) | Step-by-step: `pnpm acryl` → running TUI. Launcher, bin entry, `--expose-internals` relaunch, arg grammar, TTY gating, `--json` probe. |
| [02-package-topology.md](02-package-topology.md) | The monorepo packages and their dependency directions. Why `acryl-cli` is slim and `acryl-harness-runtime` is fat (160 deps). Role of `acryl-control` and the pinned `deepseek-harness` submodule. |
| [03-runtime-boot.md](03-runtime-boot.md) | `bootAcrylHarnessProfile()` deep dive: DSH home, profile directory, `initProfile`/`loadProfile`, the patch composition pipeline, the HMR guard, the ACRYL workspace-status tool. |
| [04-service-composition.md](04-service-composition.md) | What actually gets mounted: the complete `dsh-base` include tree (LLM, sessions, agents, tools, sandbox, compaction, subagents…), grouped by domain, plus the ACRYL coding-capability patches layered on top. |
| [05-session-bridge-and-tui.md](05-session-bridge-and-tui.md) | The TUI ↔ runtime seam: `createAcrylSessionBridge()`, durable session events, `TuiStore` projection, submit/cancel flow, slash commands, resume. |
| [06-surface-parity.md](06-surface-parity.md) | TUI vs Web vs Desktop: same runtime factory, three presentation surfaces. Direct host vs served loopback runtime. Why `acryl web` / `acryl gui` are rejected by the CLI. |
| [07-harness-inheritance.md](07-harness-inheritance.md) | How every surface inherits the DeepSeek Harness: pinned `deepseek-harness/` submodule vs published `@deepseek-ai/dsh-*` npm packages, who imports what, the presets exception, and the layout gates that enforce the boundary. |

## Key source files (ground truth)

| File | Role |
|------|------|
| `acryl-cli/bin/dev-run.mjs` | `pnpm acryl` launcher (owned by `acryl-cli`); mtime-based stale rebuild |
| `scripts/update-upstream.mjs` | Submodule updater: moves `deepseek-harness/` + rewrites `upstream.json` |
| `scripts/verify-layout.mjs` | Layout gate: domain-driven layout + npm/submodule boundary contract |
| `acryl-cli/src/bin.ts` | CLI entrypoint; relaunch + error unwrapping |
| `acryl-cli/src/cli/node-launcher.ts` | `relaunchWithExposedInternals()` |
| `acryl-cli/src/cli/run.ts` | `runAcryl()` — commands, TTY gating, dependencies injection |
| `acryl-cli/src/host/direct.ts` | `startDirectHost()` — one local runtime |
| `acryl-cli/src/tui-app/session.ts` | `runAcrylTui()` — session driver, overlays, commands |
| `acryl-harness-runtime/src/index.ts` | `bootAcrylHarnessProfile()` / `bootAcrylWebProfile()` |
| `acryl-harness-runtime/src/coding-capabilities.ts` | ACRYL capability patches (persona, presets, authorization) |
| `acryl-harness-runtime/src/session-bridge.ts` | `createAcrylSessionBridge()` |
| `acryl-harness-runtime/src/plugin-acryl-workspace-status.ts` | ACRYL's model-facing tool |
| `acryl-cli/src/tui/store.ts`, `acryl-cli/src/tui/TuiApp.ts` | TUI state + pi-tui shell |

All statements in these docs were verified against the sources above
(`@deepseek-ai/dsh-app-boot@0.1.1-rc.2`, `@deepseek-ai/dsh-base@0.1.1-rc.2`, workspace
packages at `0.1.31`).
