# 02 — Package Topology: Who Depends on Whom, and Why

ACRYL is a pnpm monorepo (`nodeLinker: isolated`, root release pinned via Corepack).
This file explains the workspace packages relevant to the CLI surface and the dependency
directions between them — and why the split looks the way it does.

## The packages

| Package | Version | Role |
|---|---|---|
| `acryl-cli` | 0.1.31 | The terminal surface: CLI entry, pi-tui shell, overlays, stores. The `acryl` bin. |
| `acryl-harness-runtime` | 0.1.31 | The runtime assembly layer: boots the pinned Harness into a Cordis root; owns the session bridge and ACRYL capability patches. **160 runtime dependencies** on `@deepseek-ai/dsh-*` + Cordis plugins. |
| `acryl-control` | — | Presentation-neutral contracts: session snapshot/attachment types, agent providers (dsh-native/codex/claude/acp), protocol client, lifecycle service. |
| `acryl-web` | — | Browser surface distribution (separate install; not wired into the CLI). |
| `acryl-desktop` | — | Electron surface distribution (separate install; not wired into the CLI). |
| `deepseek-harness/` | pinned submodule | Read-only upstream source of the `@deepseek-ai/dsh-*` packages; excluded from the workspace; **never edited** from desktop feature branches. |

## Dependency directions (CLI surface)

```
                        ┌────────────────────────────┐
                        │   deepseek-harness (git    │  source of truth for the
                        │   submodule, read-only)    │  published @deepseek-ai/*
                        └─────────────┬──────────────┘  packages (0.1.1-rc.2)
                                      │ published as
                                      ▼
┌───────────────┐   workspace:*   ┌──────────────────────────┐
│ acryl-control │◄────────────────│  acryl-harness-runtime   │
│ (contracts,   │◄────────────────│  (boot factory, session  │
│  providers)   │    workspace:*  │   bridge, capability     │
└──────▲────────┘                 │   patches) ~160 deps     │
       │                          └───────────▲──────────────┘
       │ workspace:*                          │ workspace:*
       │                                      │
       │                          ┌───────────┴──────────────┐
       └──────────────────────────│       acryl-cli          │
          (snapshot/attachment     │ (CLI + pi-tui surface)   │
           types for the bridge)   │ also imports ~24 dsh-*   │
                                   │ TYPES/services directly  │
                                   │ + @earendil-works/pi-tui │
                                   └──────────────────────────┘
```

## `acryl-cli` — deliberately a *presentation* package

Direct dependencies of `acryl-cli` (`acryl-cli/package.json`):

- **Workspace:** `acryl-harness-runtime` (boot factory + session bridge), `acryl-control`
  (snapshot/attachment types used by the bridge consumer).
- **Surface framework:** `@earendil-works/pi-tui` — the terminal UI toolkit the shell,
  overlays, and editors are built on.
- **A focused set of ~24 `@deepseek-ai/dsh-*` packages** used *directly by the surface*
  for types and small services it manipulates itself: `dsh-session` (`SessionId`,
  `Session`, events), `dsh-llm` (`createUserMessage`, content types), `dsh-compaction`
  (`ManualCompactionError`), `dsh-goal` (`GoalError`), `dsh-app-boot` (re-exported boot
  types), `dsh-settings`/`dsh-tools`/`dsh-token-meter`/`dsh-session-stats`, Cordis plugin
  descriptors for `/plugins` display, etc.

The design intent (stated in `cli/run.ts`'s doc comment) is that the CLI stays
lightweight and does **not** pull the `dsh-web-app`/client-UI bundle into its publish
closure. `acryl web` and `acryl gui` are hard errors — those surfaces are separate
distributions.

## `acryl-harness-runtime` — the only package that "knows the harness"

`acryl-harness-runtime/src` is tiny (five modules) but its `package.json` declares
**160 runtime dependencies**: essentially the whole `@deepseek-ai/dsh-*` catalog plus
Cordis plugin primitives (`cordis-plugin-loader/include/hmr/timer/group`).

Why: composition-time patch entries reference plugins **by npm package name**
(`{ id: 'session', name: '@deepseek-ai/dsh-session' }`). For the Loader to resolve those
rows, the packages must be resolvable from the booting package. Concentrating that
dependency weight in one package is what lets every surface (`tui`, `web`, `desktop`)
boot through the same factory without each surface re-declaring the harness catalog.

The five modules:

| Module | Exports |
|---|---|
| `index.ts` | `bootAcrylHarnessProfile()` (tui + generic), `bootAcrylWebProfile()` (web profile + webserver seam) |
| `coding-capabilities.ts` | `ACRYL_CODING_CAPABILITIES`, `createAcrylCodingCapabilityPatches(surfaces)` |
| `session-bridge.ts` | `createAcrylSessionBridge(ctx, options)` |
| `durable-message.ts` | Durable message port types |
| `plugin-acryl-workspace-status.ts` | The `acryl_workspace_status` model-facing tool plugin |

## `acryl-control` — the shared language between surfaces

`acryl-harness-runtime/session-bridge.ts` imports its **snapshot vocabulary** from
`acryl-control`:

- `AcrylSessionSnapshot`, `AcrylSessionSubscription`, `AcrylSessionAttachment`
  (`'owner'` vs attached), `AcrylTranscriptItem`, `AcrylToolProjection`

so the web/desktop protocol layer (`acryl-control/protocol/client.ts`) and the TUI's
in-process bridge project the *same shapes*. A session viewed in the terminal and the
same session viewed in the browser are described identically.

## The pinned submodule

`deepseek-harness/` is a git submodule (github.com/deepseek-ai/deepseek-harness)
excluded from the workspace (`!deepseek-harness/**` in `pnpm-workspace.yaml`). The
published `@deepseek-ai/dsh-*@0.1.1-rc.2` packages are patched locally
(`patchedDependencies` — 8 packages patched) but their behavioral source of truth is the
submodule. One ACRYL patch reads from it at runtime: the **agent-presets roster** points
at `deepseek-harness/packages/preset/agent-presets/presets/` when that directory exists
(`trust: 'system'`), falling back to user roots only.

> **Full inheritance map:** who imports what across TUI / web / desktop, the exact copy
> topology (submodule source vs npm store variants vs profile symlinks), the
> `upstream.json` contract, the `verify-layout` gates, and the recommended ideal state —
> see [07-harness-inheritance.md](07-harness-inheritance.md). Note that
> `acryl-desktop` declares its own 131-package `dsh-*@0.1.1-rc.2` family directly — it
> does **not** inherit them through `acryl-harness-runtime`, and no surface imports the
> submodule as code (gate-enforced).

## The dependency rule

```
surfaces (tui/web/desktop)  →  acryl-harness-runtime  →  pinned harness packages
surfaces                    →  acryl-control          (types only)
acryl-harness-runtime       →  acryl-control          (types only)
nothing depends on a surface
```

Surfaces are interchangeable because the runtime factory never imports a surface; the
surface calls the factory. That is what makes "one runtime, three presentations" hold.
