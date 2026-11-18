# ACRYL under one roof

One clone holds everything ACRYL is made of. This page says where each part lives, what it is for, and which way the parts depend on each
other. The plan that gets here is [spec 051](../../specs/051-acryl-monorepo/spec.md).

## What you install, and where its code is

| What people use | What it is | Where its code lives |
|---|---|---|
| `npx acryl` | the one command: the launcher in the terminal, `acryl new`, `acryl ade`, update | `apps/acryl-cli`, `apps/acryl-launcher-tui`, `plugins/acryl-launcher` |
| ACRYL Control Center | the desktop and web launcher: make, open, update apps | `plugins/acryl-launcher`, `plugins/acryl-launcher-desktop` (release: Phase 4 moves it to `products/`) |
| ACRYL ADE | the agentic IDE | `plugins/acryl-workspace`, `plugins/acryl-agent-control`, `runtime/acryl-control`, `apps/acryl-desktop` |
| `npm create acrylblends` | makes a new app (a Blend) | `framework/packages/create`, `framework/packages/cli` (templates) |
| `npx acrylblends` | the framework CLI: add, upgrade, update, plugins | `framework/packages/cli` |
| the frame of every Blend | settings, sign-in, chat, Skills & MCP, versions | `framework/ide/*`, `framework/frame/packages.json` |
| the desktop shell of every Blend | windows, in-app updater, one home per product | `framework/plugins/desktop`, `framework/plugins/instance` (Phase 3: packages) |

## The groups

```
apps/        surfaces people run: the acryl command, the desktop app, the web app, the terminal launcher
runtime/     the stable core everything else stands on: agent control, the harness runtime, loopback HTTP, persistence
plugins/     Cordis plugins, each replaceable on its own: launcher, workspace, settings, sign-in, plugin hub, market
framework/   acrylblends, the framework that apps are made with (imported with its history from acrylblends/acrylblends)
examples/    demo packages that ship nothing production-facing
distribution/ release shims
deepseek-harness/  the pinned upstream harness (code we do not own; never edited here)
```

## Which way dependencies point

```
apps, products  ->  plugins, framework  ->  runtime
```

The core never depends on a surface, a product or the framework. A Blend repository outside this one depends on published npm packages,
never on copied source.

## Why one roof

- A fix to code that several products share is one commit, one review and one release, not a copy per repository.
- `git clone` plus `pnpm install` gives a contributor the core, the framework and the products together.
- Users notice nothing: the npm names (`acrylblends`, `create-acrylblends`, `@acrylblends/*`) and the installers stay the same.
