# Feature Specification: ACRYL pi-tui Durable Session Surface

**Feature Directory**: `specs/019-acryl-harness-runtime`
**Status**: Active - re-scoped 2026-08-28
**Authority**: `docs/ACRYL-RUNTIME-SURFACE-CONTRACT.md`

## Objective

Deliver the first usable ACRYL terminal surface. `acryl tui --profile acryl` starts one normal local DeepSeek Harness and Cordis profile, opens or explicitly resumes one native durable session, and provides a full-screen pi-tui interface for prompts, streamed transcript/tool projection, cancellation, and clean exit.

The runtime owns coding-agent behavior and durability. The TUI is a direct TypeScript presentation adapter only.

## User Stories

### US1 - Use a live durable coding session (P1)

As a terminal user, I can start `acryl tui --profile acryl`, submit a prompt, see the running/idle state plus streamed transcript and tool activity, cancel a running turn with `Ctrl+C`, and exit without losing the durable DSH session.

**Independent acceptance**: an authenticated profile accepts a prompt and shows native DSH response events in a full-screen pi-tui, then restores the terminal and disposes its local runtime when exited.

### US2 - Resume a durable session (P2)

As a terminal user, I can provide an explicit session ID through `--resume <session-id>` and see its durable history before continuing the same native DSH session.

**Independent acceptance**: a session created in US1 is resumed in a later `acryl tui --resume` invocation and its preceding messages render before a new prompt is submitted.

## Functional Requirements

- **FR-001**: `acryl tui --profile <profile>` MUST use `startDirectHost()` to boot one normal local Harness/Cordis root.
- **FR-002**: The interactive renderer MUST be `@earendil-works/pi-tui` exactly `0.84.2`, with a full-screen alternate terminal screen.
- **FR-003**: The terminal controller MUST create or resume a native durable DSH session exclusively through the existing ACRYL session bridge.
- **FR-004**: The UI MUST render transcript messages, running/idle state, active and completed tool calls, bridge errors, and a documented cancellation binding.
- **FR-005**: Prompt submission and cancellation MUST invoke the native bridge, not a terminal-owned agent/session loop.
- **FR-006**: Renderer shutdown MUST restore the terminal and dispose the subscription, session bridge, and direct runtime in order.
- **FR-007**: `--json` MUST remain a headless direct-host readiness probe and MUST not mount pi-tui or a session bridge.
- **FR-008**: `--resume <session-id>` MUST validate a non-empty session ID and call the bridge resume path.
- **FR-009**: Stale `.acryl/control` artifacts MUST not affect direct launch.
- **FR-010**: The port MUST adapt concrete compatible Tomo modules, not vendor the repository or reuse Tomo's direct runtime bootstrap.

## Non-goals

No daemon, listener, socket, lease, ownership protocol, heartbeat, endpoint polling, attachment/recovery path, RLM, routing, Fleet, marketplace, GUI/Web parity, session picker, approval/question UI, model/preset controls, plans, goals, context controls, shell mode, or plugin presentation.

## Success Criteria

- **SC-001**: Full-screen `acryl tui` renders native durable session state and accepts a prompt.
- **SC-002**: Focused automated tests prove prompt dispatch, stream/tool projection, cancel dispatch, renderer/runtime cleanup, and ignored stale control artifacts.
- **SC-003**: All required package tests and TUI typecheck pass.
- **SC-004**: A provenance note records Tomo commit `f7663341f604c3ad96e9b2b838a7ca2de8e84fd1`, MIT license, pi-tui 0.84.2, adapted behavior, and deferred parity.
