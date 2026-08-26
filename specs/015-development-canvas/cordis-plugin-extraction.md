# Cordis Mini-Design: Standalone Development Canvas Plugin

**Status:** approved by the user for implementation on 2026-08-24

## 1. Capability and plugin boundary

Development Canvas is an independently replaceable workspace capability. It
owns its Host PTY transport, browser Client contribution, styles, tab state,
and PTY-view bindings. It becomes the standalone
`dsh-plugin-development-canvas` package rather than a subpath and child plugin
inside `dsh-plugin-desktop`.

Desktop continues to own the Electron shell and advanced frame. It declares a
small `desktop.main` Client slot whose default entry renders the upstream
conversation. Development Canvas contributes a higher-priority entry to that
slot. Removing the Canvas Loader row therefore removes both Host and Client
behavior and reveals the default conversation without Desktop importing Canvas
code.

## 2. Provides and consumes

The Canvas package provides:

- one Host Cordis plugin at the package root;
- one browser Cordis plugin at `./client`;
- one `desktop.main` slot contribution;
- loopback PTY routes owned by its Host Fiber.

The Host plugin hard-injects `webServer`. The Client plugin hard-injects
`slots` and uses `ctx.slots.inject('desktop.main', ...)` so registration exists
only during a live declaration epoch. The package consumes the Desktop slot
contract but never imports Desktop implementation at runtime.

Canvas does not provide a general terminal or agent-control Service. Its PTY
registry remains private because no other plugin consumes it. Agent-room and
agent-provider seams remain out of scope.

## 3. Effects and disposal

The Host owns route registration and the complete PTY table in one
`ctx.effect()`. Setup rolls back every earlier route if a later registration
fails. Disposal removes routes first, then awaits termination of every PTY and
its subscriptions.

The Client owns its slot registration, styles, and a PTY client-session
controller inside the `desktop.main` declaration effect. Removing the Canvas
Fiber or collapsing the Desktop slot declaration removes the UI and closes all
Host PTYs known to that Client activation. Late start completions are closed
instead of becoming unreachable.

React effects own only view-local resources: DOM listeners, xterm instances,
ResizeObservers, animation frames, and polling timers.

## 4. Configuration and composition

The root workspace adds `dsh-plugin-development-canvas` as a Yarn workspace.
`dsh-plugin-desktop` depends on its published package version and inserts one
stable Loader row:

```yaml
- id: desktop-development-canvas
  name: dsh-plugin-development-canvas
```

The Canvas package declares `dsh.client` and exports `./client`, allowing the
DSH Client module graph to load and lifecycle-manage its browser face from the
same root Loader entry. There is no configuration in this slice, so no empty
runtime Config schema is introduced.

## 5. Events and durability

No new Cordis event is needed. Host operations are direct same-origin route
calls, and UI replacement uses the lifecycle-aware slot registry.

Canvas tabs remain intentionally in-memory. Terminal output is transient
presentation data and is not promoted to durable agent or room history. Room
events and agent control are explicitly deferred.

## 6. Verification

Tests must prove:

- real package exports and stable Loader composition;
- Host activation rollback after a partial route-registration failure;
- Host disposal removes routes and terminates all PTYs;
- Client slot contribution appears only while `desktop.main` is declared;
- Canvas priority replaces the default conversation and disposal restores it;
- Client-session disposal closes all tracked PTYs, including a start that
  settles during disposal;
- repeated mount/dispose does not duplicate slot entries, routes, timers, or
  PTYs;
- root typecheck, build, test, Loader smoke, and layout checks pass.
