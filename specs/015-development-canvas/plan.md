# Implementation Plan: Development Canvas

**Branch**: `015-development-canvas` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-development-canvas/spec.md`

## Summary

Advanced-mode DSH Desktop presents an Orca-inspired tab workspace that replaces the main column while the independently composed `dsh-plugin-development-canvas` package row is active. `+` opens Terminal/agent, File, and Browser tabs; one active tab fills the pane. Chat remains a projection of the upstream conversation slot. The Host row owns routes and process-session lifetime as one Cordis effect. Disabling it restores the ordinary conversation surface. Compatibility mode is unchanged.

## Technical Context

**Language/Version**: TypeScript 5, Node `^22.19.0 || >=24.0.0`, React (bundled Web Client)

**Primary Dependencies**: `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-slots`, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`; `dsh-plugin-desktop` declares the replaceable `desktop.main` slot

**Storage**: In-memory canvas snapshot for this slice (no durable canvas log yet)

**Testing**: Vitest (headless). State machine, Cordis lifecycle, PTY TTY-allocation, resize/input, and session disposal tests required.

**Target Platform**: DSH Desktop advanced mode on macOS and Windows. Compatibility mode and Linux advanced remain as today.

**Project Type**: Desktop Web Client contribution + Host process sessions

**Performance Goals**: Adding/closing a tile feels immediate (<100ms UI). PTY output appears without a full window reload.

**Constraints**: No `deepseek-harness/` edits. Canvas is its own Yarn workspace and published package seam. No Electron IPC for plugins. Headless-safe tests. Least privilege: allowlisted commands, `http`/`https` only.

**Scale/Scope**: One canvas per advanced renderer. Tens of tiles max in this slice, not hundreds of worktrees.

## Constitution Check

- Everything is a plugin: Canvas has its own package, bundle patch, Host entry, Client entry, stable Loader row, `desktop.main` slot contribution, and reversible resource effects. PASS. Host and Client share the Canvas distribution package and are not children of the Desktop plugin.
- Agents disposable / room persistent: PTY sessions die with tiles. PASS for
  lifecycle, TRANSITIONAL for architecture: the hardcoded agent command list is
  transport R&D, not the canonical room/provider scene. ACRYL-2 must replace
  agent tabs with the `acrAgentControl` service/provider seam.
- Compose DSH, do not fork: conversation slot reused; no new agent loop. PASS.
- Durable canonical state: deferred (in-memory snapshot). Documented in research. Acceptable for P1 walking skeleton.
- Generated capabilities outside kernel: N/A (hand-authored Desktop contribution).

Post-design: same gates. No unjustified kernel path.

Cordis audit note (2026-08-24): Canvas Host/Client lifecycle is aligned. Do not
extend `CANVAS_PTY_COMMAND_IDS` into relay, handoff, resume, or orchestration.
Those consumers must inject `acrAgentControl` after ACRYL-2 defines it.

## Project Structure

### Documentation (this feature)

```text
specs/015-development-canvas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/canvas.md
├── spec.md
├── tasks.md
└── checklists/requirements.md
docs/cordisplugins/hello-world-plugin-guide.md
```

### Source Code

```text
dsh-plugin-development-canvas/
  cordis.patch.yml
  src/index.ts
  src/canvas-pty.ts
  src/canvas-pty-contract.ts
  src/canvas-pty-route.ts
  src/client/index.ts
  src/client/development-canvas/
  tests/
```

AdvancedFrame is the trusted Desktop root and declares `desktop.main`. Desktop contributes a low-priority conversation fallback. The independent Canvas Client plugin contributes the higher-priority Canvas entry through `ctx.slots.inject`, while its Host plugin registers process routes behind the same-origin loopback policy. Removing either declaration or the Canvas row disposes the contribution and restores conversation without polling.

## Phase 0 / Phase 1

See `research.md`, `data-model.md`, `contracts/canvas.md`, `quickstart.md`.
