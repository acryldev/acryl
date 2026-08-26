# Implementation Plan: Plugin Lifecycle Control

## Six-part Cordis mini-design

### 1. Boundary

`PluginLifecycleController` is a Desktop-owned Host module inside `dsh-plugin-desktop`. It is the only implementation allowed to combine Loader mutation, persistent entry policy, Client graph observation, and renderer-reload requirements.

Its small interface is:

```ts
interface PluginLifecycleController {
  snapshot(): PluginLifecycleSnapshot
  setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt>
  reload(entryId?: string): Promise<PluginLifecycleReceipt>
}
```

The module hides Loader lookup, mutable-entry policy, persistence rollback, Fiber settlement, Client graph observation, and safe response projection.

### 2. Provides and consumes

Provides:

- renderer-safe lifecycle snapshots and receipts through private same-origin Desktop routes;
- a global `/reload [entry-id]` human command when `ctx.commands` is available.

Consumes:

- required `ctx.loader` for entry authority;
- optional `ctx.clientModules` for Host-side Client graph membership;
- optional `ctx.commands` for the human shortcut;
- launcher-provided persistence bootstrap;
- Client `ctx.loader` for current-renderer root Fiber phases.

Controlled plugins never depend on this controller.

### 3. Effects and disposal

- Routes are registered with `ctx.effect()`.
- `/reload` registration belongs to an injected child Fiber and disappears with Desktop shell disposal.
- No lifecycle action retains a Fiber or Entry reference across an await without revalidating its entry id.
- Disable and reload await Fiber disposal before returning.
- Enable awaits Loader settlement and reports a failed phase as failure.
- Client keyboard or page hooks, if added, use `ctx.effect()` and reversible listeners.

### 4. Config and composition

- `desktop-shell` remains the protected controller owner.
- Launcher bootstrap identifies the active profile and a Desktop-private state file.
- Persisted overrides are applied last during `prepareDesktopProfile`.
- Initial mutable policy includes `include:desktop-development-canvas` only.
- Every other row is visible and carries a protected reason until explicitly admitted by policy and tests.
- The policy uses stable Loader entry ids and never string-guesses generated child entries into mutability.

### 5. Events and durability

- The Loader and each live `ctx.registry` remain lifecycle authorities.
- The persistent state file contains only desired enablement overrides for admitted entry identities.
- UI operation state is transient. A pending receipt may be stored in renderer `sessionStorage` only to verify the result after reload; it is not canonical lifecycle state.
- No new durable room or session event is introduced. `/reload` already receives the standard command run/done audit records.

### 6. Lifecycle verification

Tests must prove:

- snapshot merges Host rows, Client-capable packages, and Client Fiber phases;
- protected rows cannot mutate;
- Canvas disable persists, calls Loader update, awaits disposal, and requests renderer reload;
- Canvas enable rolls persistence back if Host activation fails;
- reload uses Fiber restart and does not alter enablement persistence;
- route security rejects foreign origins, non-loopback sockets, malformed bodies, oversized bodies, and unsupported methods;
- client response parsing rejects unknown or malformed fields;
- Client Settings contribution and styles dispose cleanly;
- post-reload verification distinguishes Host and Client results;
- exact profile composition applies persisted Canvas disabled/enabled state;
- Canvas route, PTY, style, and slot teardown tests remain green.

## Delivery sequence

1. Implement and test the persistent lifecycle policy and profile patch application.
2. Implement and test the Host controller with fake Loader entries and Fibers.
3. Add strict private routes and client boundary parsing.
4. Add the Settings -> Plugins -> Lifecycle tab and merged Host/Client cards.
5. Add `/reload [entry-id]` and renderer reload handoff.
6. Run focused tests, package typecheck/build, full `corepack yarn check`, then exact headed disable/enable/reload QA.
7. Update architecture and development log with verified behavior and limitations.
