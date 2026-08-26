# Tasks: Development Canvas

**Input**: `specs/015-development-canvas/`
**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/

## Phase 1: Setup

- [x] T001 Author Cordis Hello World guide at `docs/cordisplugins/hello-world-plugin-guide.md`
- [x] T002 Spec Kit artifacts under `specs/015-development-canvas/`
- [x] T003 Redraw Wayfinder destination for this first product feature

## Phase 2: Foundational

- [x] T004 Canvas state machine in `dsh-plugin-development-canvas/src/client/development-canvas/state.ts`
- [x] T005 Allowlisted agent commands in `dsh-plugin-development-canvas/src/client/development-canvas/agent-commands.ts`
- [x] T006 Host process-session prototype in `dsh-plugin-desktop/src/canvas-pty.ts` with injected spawn
- [x] T006A Extract Host and Client ownership into the standalone `dsh-plugin-development-canvas` Cordis package row
- [x] T006B Add Client child fiber and Host-presence activation handshake
- [x] T007 Headless tests `tests/development-canvas-state.spec.ts` and `tests/canvas-pty.spec.ts`

## Phase 3: User Story 1 - Canvas + tiles (P1) 🎯 MVP

- [x] T008 [US1] `DevelopmentCanvas.tsx` with Orca-style tab strip and `+` menu
- [x] T009 [US1] One active tab fills the entire main area; Chat projects `renderSlot('conversation')`
- [x] T010 [US1] Canvas activates only while its Host Cordis row is present in advanced mode
- [x] T011 [US1] Canvas styles via existing advanced-shell stylesheet installer

## Phase 4: User Story 2 - PTY tile (P1)

- [x] T012 [US2] Same-origin process routes owned by the Canvas Host plugin
- [x] T013 [US2] Terminal prototype: allowlisted agent tabs, output, line input, close disposes session
- [x] T013A [US2] Replace child-process pipes with true `node-pty` sessions (resize + byte input)
- [x] T013B [US2] Add xterm.js renderer for ANSI and alternate-screen coding-agent TUIs

## Phase 5: User Story 3 - File + Browser (P2)

- [x] T014 [US3] In-memory File tab editor prototype
- [ ] T014A [US3] Load/save File tabs through the DSH filesystem capability
- [x] T015 [US3] Browser tab address bar + iframe (`http`/`https` only)

## Phase 6: Polish

- [x] T016 Update `docs/README.md` and `docs/README.en.md` to link the Hello World guide
- [x] T017 `corepack yarn workspace dsh-plugin-desktop test` for new specs
