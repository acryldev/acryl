# Implementation Plan: ACRYL Shared Harness Runtime

**Branch**: `019-acryl-harness-runtime` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

## Summary

Make `acryl-harness-runtime` the sole host-neutral owner of a pinned DeepSeek
Harness profile's preparation, boot, durable session bridge, and ordered
shutdown. Terminal, Desktop, and later Web surfaces acquire one profile owner
or attach to it through a local authenticated control protocol. Provider
credentials remain owned by Harness profiles and provider CLIs, never ACRYL.

The implementation delivers the smallest walking skeleton first: a normal
pinned profile that starts in one Cordis root and creates a durable session.
It then adds the owner/attach control boundary, one active-control lease, and a
native DSH agent adapter. Existing `acryl-tui` direct boot and `acryl-control`
services are integration points, not alternative runtime owners.

## Technical Context

**Language/Version**: TypeScript 6.0.3, Node.js `^22.19.0 || >=24.0.0`

**Primary Dependencies**: Yarn 4.18.0 workspaces; Cordis 4.0.1; pinned
`@deepseek-ai/dsh-*` 0.1.1-rc.2 packages; Vitest 4.1.8

**Storage**: Existing Harness profile configuration and durable session
persistence. ACRYL control metadata is local, per-profile, and user-private.
No new ACRYL session store.

**Testing**: `corepack yarn workspace acryl-harness-runtime test`; `corepack
yarn workspace acryl-control test`; `corepack yarn workspace acryl-tui test`;
workspace typechecks and headless loader smoke tests.

**Target Platform**: Local macOS, Linux, and Windows terminal/Desktop hosts.
Unix domain sockets are used on Unix; Windows named pipes use a platform ACL
adapter before they are considered equivalent.

**Project Type**: Node.js workspace packages and terminal host, with Electron
as a separate presentation host.

**Performance Goals**: A local boot reaches a live agent/session root in one
command. Ten sequential boot/dispose cycles leave no owner, listener, socket,
or process from a prior generation.

**Constraints**:

- Do not modify `deepseek-harness/`.
- One profile has at most one writable runtime owner and one active-control
  lease.
- Provider secrets are never read, stored, transmitted, or logged by ACRYL.
- The control token is random, owner-generation-scoped, user-private, rotated
  on owner generation change, and never logged.
- All resources are acquired in lifecycle-owned Cordis effects and fully
  disposed.
- Existing user profile patches/settings survive preparation.

**Scale/Scope**: One local user may attach Terminal and Desktop to one named
profile. Remote networking, cross-user collaboration, provider login flows,
and migration of the complete Desktop presentation are outside this feature.

## Constitution Check

| Gate | Result | Evidence |
|---|---|---|
| Capability is a Cordis plugin/service, not a privileged kernel path | Pass | Runtime services use Cordis `Service`, `inject`, and `ctx.effect()` ownership. |
| Pinned Harness is composed, not forked | Pass | Reuses `dsh-app-boot` profile composition and native `sessions`/`agents` services. |
| Durable facts are not terminal-derived | Pass | Session identity, events, and history remain Harness durable-session facts. |
| Services have stable contracts and explicit cleanup | Pass | Contract defines runtime, attachment, and lease state; boot root owns disposal. |
| New complexity is justified | Pass | The local control boundary is necessary to prevent two writable owners and to support presentation-independent attachment. |

**Post-design check**: Pass. The design creates no parallel session store,
provider auth store, dependency-injection system, or event system.

## Cordis Mini-Design

### Capability and plugin boundary

`acryl-harness-runtime` owns one started Harness profile generation. It is the
only package allowed to call profile preparation and `boot()` for an ACRYL
profile. It provides a stable host-neutral runtime handle. `acryl-control`
owns generic ownership and protocol mechanics. Presentation packages consume
those contracts and never boot a second root.

### Provides and consumes

The runtime provides:

- `AcrylHarnessRuntimeHandle`: profile, generation, root `Context`, session
  creation/projection, durable native-agent bridge, and idempotent disposal.
- `AcrylRuntimeAttachment`: authenticated read projection plus an explicit
  lease-acquisition operation.
- `AcrylActiveControlLease`: exclusive authority to submit agent actions.

It consumes the pinned Harness `sessions`, session-persistence integration,
`agents`, and profile composition through the root context. The native agent
adapter injects `sessions` and `agents`; it is PENDING or fails loudly if the
profile lacks either required capability.

### Effects and disposal

The owner lifecycle is:

```text
prepare profile -> acquire owner generation -> write token metadata (0600)
-> boot one Harness root -> install runtime services -> publish endpoint
-> accept authenticated attachments

close listener -> revoke active lease -> close attachments -> dispose Cordis
root -> remove token/endpoint metadata -> release profile owner
```

Startup failure reverses every completed acquisition in reverse order. A
surface disconnect, dead process observation, or authenticated channel expiry
releases only its active-control lease. It never silently transfers that lease.

### Configuration and composition

The runtime preserves a profile's user patch and settings layers. It rewrites
only the generated empty `cordis.yml` Loader anchor, using the upstream
`profile-boot.ts` pattern. Stable Loader row IDs and the pinned profile bundle
composition remain authoritative. The HMR requirement is honored: runtime
startup either receives a valid HMR configuration or fails with the explicit
existing launch requirement, never suppresses it implicitly.

### Events and durability

Control connection status and lease transitions are runtime observations.
Harness session events and agent history are durable facts. Every agent action
is tied to a named Harness session before model invocation. Read projections
are derived from durable session state; terminal output is not replay history.

### Verification

Tests cover fresh boot, preserved user patches, dependency closure, startup
rollback, attach authentication, capability-token rotation, single active
lease, disconnect expiry, repeated start/dispose, a new durable session on
owner terminal boot, native create/resume behavior, and no leaked listeners or
owners.

## Project Structure

### Documentation

```text
specs/019-acryl-harness-runtime/
├── spec.md
├── research.md
├── plan.md
├── data-model.md
├── contracts/local-control.md
├── quickstart.md
└── tasks.md
```

### Source Code

```text
acryl-harness-runtime/
├── src/
│   ├── index.ts                 # public runtime boundary
│   ├── profile.ts               # upstream-compatible profile preparation
│   ├── runtime-service.ts       # one-root owner lifecycle
│   ├── attachment.ts            # authenticated attachment and lease projection
│   ├── native-agent.ts          # durable DSH sessions/agents adapter
│   └── durable-message.ts       # durable message contract
└── tests/
    ├── profile.spec.ts
    ├── runtime-service.spec.ts
    ├── attachment.spec.ts
    └── native-agent.spec.ts

acryl-control/
├── src/ownership/               # existing profile owner records
├── src/protocol/                # hardened local protocol service/client
└── tests/

acryl-tui/
├── src/host/direct.ts           # owner-or-attach entry point
├── src/cli/run.ts               # real session-backed terminal flow
└── tests/
```

**Structure Decision**: Extend the existing `acryl-harness-runtime`,
`acryl-control`, and `acryl-tui` packages. Do not create an Electron dependency
in the terminal host or a second runtime package for Desktop.

## Delivery Sequence

1. Establish profile preparation and dependency-closure tests in the runtime
   package.
2. Replace the current direct-only host boot with the runtime-owned one-root
   handle and prove new durable session creation.
3. Harden `acryl-control` with a local authenticated protocol handshake,
   generation token rotation, and lease protocol.
4. Add owner-or-attach behavior to TUI, retaining a read-only attached surface
   until it explicitly acquires the active-control lease.
5. Add the native DSH adapter over `ctx.sessions` and `ctx.agents`; prove no
   terminal-history persistence path exists.
6. Run ten-cycle lifecycle evidence and all package gates.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Local control protocol | Presentation hosts must attach to one durable writable runtime without sharing a process | A shared in-memory singleton cannot work across Terminal and Desktop processes |
| Active-control lease | Durable agent actions need deterministic single-surface submission | Concurrent uncoordinated writes would make session ordering and ownership ambiguous |
