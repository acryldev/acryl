# Shared Coding Capability Composition

**Status:** Approved design, pending implementation plan
**Date:** 2026-08-31

## Decision

ACRYL coding-agent behavior is one product capability layer, not an accidental
property of a particular surface.

A coding capability must be composed by every applicable ACRYL surface:

```text
shared ACRYL coding capability
├── CLI/TUI adapter
├── Web adapter
└── Desktop adapter
```

A surface may render or invoke the capability differently. It may not copy its
behavior, credentials, state model, or Loader composition. A missing surface
must be an explicit, reviewed exception with a product reason.

This rule applies to user-facing coding-agent behavior: authorization, agent
commands, tools, sessions, model behavior, context, and future capabilities
such as auto-research. It does not apply to Desktop-only platform concerns such
as Electron lifecycle, windows, tray, native file picking, installer behavior,
or packaging.

## Current gap

`/login` and `/logout` demonstrate the gap:

- `acryl-tui/src/tui/commands.ts` recognizes the slash commands.
- `acryl-tui/src/tui-app/session.ts` provides the login overlay and invokes the
  Harness `authorization` service.
- `acryl-harness-runtime` inserts the `authorization` Loader row only through
  `bootAcrylHarnessProfile()`.
- Desktop independently composes the upstream Web profile and substitutes its
  `webserver` row with `acryl-desktop/webserver`.

Consequently, TUI currently has an ACRYL OAuth interaction that Desktop did not
explicitly compose or adapt. Rebuilding an Electron artifact aligns release
version, but does not create feature parity.

## Chosen module boundary

`acryl-harness-runtime` becomes the narrow shared composition boundary for
ACRYL coding capabilities. It must expose a surface-neutral, immutable function
that returns the ACRYL coding Loader patches. It must not expose a second
runtime, command registry, event bus, credential store, or UI framework.

Conceptually:

```ts
createAcrylCodingCapabilityPatches(options): readonly PatchOptions[]
```

The existing `bootAcrylHarnessProfile()` becomes a CLI-oriented composition
helper that consumes these patches. Desktop profile construction consumes the
same function before it applies Desktop-only patches. The `acryl web` helper
uses the same shared coding composition only when the Web profile supports that
capability.

A future capability is added to this shared patch factory and declares its
surface adapters in the capability contract. It is not added directly to a TUI
switch statement, Desktop profile, or Web route as its sole implementation.

## Capability contract

Each coding capability has a small, colocated declaration. This is source code
and tests, not a generic runtime registry.

The declaration records:

1. stable capability id and product description;
2. its shared Loader rows and configuration;
3. hard `inject` requirements and intentionally optional services;
4. durable state owner, if any;
5. applicable surfaces: `tui`, `web`, `desktop`;
6. adapter contract for every applicable surface;
7. explicit exclusion reason when a surface is not applicable; and
8. lifecycle and parity tests.

The first migrated capability is `authorization`:

```text
shared behavior: authorization service and provider flows
TUI adapter: /login and /logout plus interactive overlay
Web adapter: existing compatible Web/profile settings surface, or a new
             Web adapter only if the upstream bundle lacks the required flow
Desktop adapter: Desktop Web/client entry that invokes the same authorization
                 service and exposes login/logout in the Desktop surface
credentials: Harness credentials service and its configured durable provider
```

The capability contract does not require every surface to use the literal
`/login` text. Desktop may use a settings action. It requires the same provider
flows, credentials, success/failure semantics, logout behavior, and durable
state.

## Composition rules

1. Shared coding patches are applied once per surface root, before surface-only
   overlays.
2. Desktop retains authority over its `acryl-desktop/webserver` replacement.
   Shared coding composition must not overwrite that row.
3. Desktop-native Loader rows remain in `acryl-desktop/cordis.patch.yml` and
   must never enter the shared capability layer.
4. CLI-only terminal presentation remains in `acryl-tui`; Desktop-only UI
   remains in Desktop client code; neither layer owns domain behavior.
5. Web and Desktop may use the upstream `dsh-web-app` bundle, but an upstream
   bundle alone does not prove ACRYL capability parity.
6. A surface must fail loudly during composition if a required shared coding
   provider is absent. It must not silently omit the feature.

## Cordis mini-design

### 1. Capability and plugin boundary

The shared boundary is composition of existing Harness coding capabilities,
starting with authorization. It belongs in `acryl-harness-runtime` because that
package already owns ACRYL's Harness profile composition. No new generic plugin
runtime is introduced. A feature that needs independently replaceable runtime
behavior is an ordinary Cordis plugin with a stable Loader row; surface code
remains a consumer/adapter.

### 2. Provides and consumes

Authorization consumes the Harness `authorization` service and its configured
provider flows. It relies on the existing Harness credentials and LLM adapter
composition. TUI, Web, and Desktop adapters consume that stable service through
`inject` for mandatory behavior or `ctx.get()` only where the capability is
explicitly optional. Adapters must not import a concrete OAuth provider.

### 3. Effects and disposal

The shared patch factory owns no process, browser, route, timer, subscription,
or credential resource. Those remain owned by the existing Harness providers
or the relevant surface adapter Fiber. Any future capability-owned resource is
acquired in one `ctx.effect()` with an idempotent disposer. If ordered cleanup
is required, it occurs inside one async disposer.

### 4. Configuration and composition

Shared patches use stable Loader IDs and validated configuration. Surface roots
compose shared patches before their own patches. Desktop-only row replacement,
including `desktop-webserver`, remains a later Desktop overlay. Provider
replacement follows normal Cordis unload/reactivation rather than configuration
row order.

### 5. Events and durability

This migration creates no private event bus. Authorization durability remains
in Harness credentials storage. Future shared capabilities identify their
existing durable owner or introduce one deliberate domain record. Surface
notifications are projections, not canonical state.

### 6. Verification

Tests must prove real Loader activation for TUI, Web, and Desktop compositions;
that required authorization is present after shared composition; and that the
Desktop overlay still owns its Web server. Tests must prove a provider can be
removed and restored without stale adapters or duplicate registrations.
Authorization parity tests must cover provider discovery, start, cancellation,
success, logout, persisted credentials, and unavailable-provider behavior on
every applicable surface. A capability added only to one applicable surface
fails the parity gate.

## Delivery sequence

1. Extract and test the shared coding-patch factory without changing behavior.
2. Make CLI composition consume it, preserving the existing TUI OAuth flow.
3. Make Desktop profile composition consume it while retaining Desktop Web
   server substitution.
4. Add the Desktop authorization adapter and parity tests.
5. Define Web applicability from the actual upstream Web authorization seam;
   add an ACRYL Web adapter if needed.
6. Add a narrow capability-contract test helper that checks declared applicable
   surfaces have a composition test and adapter test. It must not become a
   runtime registry.
7. Apply the same path to the next shared feature, rather than creating a
   separate feature-parity framework.

## Acceptance criteria

- A shared authorization capability is composed by CLI, Web when applicable,
  and Desktop roots from one ACRYL-owned patch source.
- Desktop uses the same Harness authorization service and durable credentials
  as CLI, but keeps Desktop-specific UI and Web server ownership.
- `/login` and `/logout` retain their TUI behavior.
- Desktop exposes equivalent login/logout behavior through its UI.
- Removing a required authorization provider yields a clear unavailable state;
  restoring it reactivates the consumer without stale registrations.
- A new coding capability cannot be accepted with only a surface-local
  implementation unless its explicit exclusion is reviewed and tested.
- No changes modify the pinned `deepseek-harness/` submodule.

## Non-goals

- Embedding the TUI executable in Electron.
- A generic cross-surface command registry or second dependency-injection
  system.
- Replacing the Desktop Web server customization.
- Moving Electron windows, tray, native file picker, process management, or
  packaging into shared code.
- Implementing auto-research in this migration.
