# Data Model: ACRYL Shared Harness Runtime

## ProfileRuntimeGeneration

One live ownership generation for a named Harness profile.

| Field | Rules |
|---|---|
| `profileKey` | Non-empty canonical profile identity |
| `generationId` | Random new value for each owner boot |
| `ownerHostId` | Identifies owning presentation host |
| `endpoint` | Local Unix socket or Windows named pipe, protocol-versioned |
| `capabilityToken` | Cryptographically random, user-private, never logged, invalid after generation ends |
| `state` | `starting`, `ready`, `disposing`, `disposed`, `failed` |

Only `ready` accepts attachments. A failed or disposed generation cannot be
attached, and its metadata and endpoint are removed.

## SurfaceAttachment

A live authenticated connection from one presentation surface.

| Field | Rules |
|---|---|
| `attachmentId` | Unique per connection |
| `surfaceId` | Caller supplied stable local surface identity |
| `generationId` | Must equal the active owner generation |
| `mode` | `read-only` or `active-control` |
| `expiresAt` | Bounded channel expiry renewed by authenticated heartbeat |

An attachment becomes read-only on creation. It may become `active-control`
only after explicit lease acquisition.

## ActiveControlLease

The singular authority to submit an agent action.

| Field | Rules |
|---|---|
| `leaseId` | Unique lease instance |
| `attachmentId` | Must reference a current authenticated attachment |
| `generationId` | Must reference the active owner generation |
| `expiresAt` | Lease expires with attachment channel expiry |

At most one active lease exists for a profile generation. Disconnect, process
death, expiry, owner disposal, and generation replacement revoke it. There is
no automatic takeover.

## DurableAgentSession

A native Harness session selected by the ACRYL runtime.

| Field | Rules |
|---|---|
| `sessionId` | Harness-owned durable session identifier |
| `origin` | `new-owner-terminal` or explicit resume action |
| `agentHandleId` | Harness-agent identity when an agent is active |
| `status` | Projection of durable/live Harness state |

A standalone owner terminal creates a new session. Resumption is an explicit
future action. Terminal scrollback is never a source field.

## State transitions

```text
absent -> starting -> ready -> disposing -> disposed
                 \-> failed -> disposed

read-only attachment -> active-control -> read-only (release/expiry)

new durable session -> native agent created -> running -> disposed
```
