# Local Control Contract

## Scope

This is a local, single-user, profile-runtime control contract. It is not a
remote API and must not be exposed on a network interface.

## Connection preconditions

1. The client reaches the endpoint through OS-permitted local transport.
2. The first request supplies `protocolVersion`, `generationId`, and the
   current owner-issued capability token.
3. The owner validates all three before returning any runtime projection.
4. The token and endpoint metadata are user-private and never appear in logs,
   errors, or telemetry.

A version, generation, or token mismatch fails closed without capability data.

## Operations

| Operation | Required attachment mode | Result |
|---|---|---|
| `runtime.inspect` | authenticated read-only or active | profile/generation/status/auth availability projection |
| `runtime.subscribe` | authenticated read-only or active | live derived runtime/session projection |
| `lease.acquire` | authenticated read-only | grants active control only when no current lease exists |
| `lease.release` | holder | returns attachment to read-only |
| `agent.create` | active control | creates a new durable Harness session/agent as requested |
| `agent.resume` | active control | resumes an explicitly identified durable Harness session |
| `agent.send` | active control | dispatches against a named durable Harness session |
| `agent.cancel` | active control | forwards cancellation to native agent handle |

All mutating operations require the active-control lease. Unsupported operations
and absent provider authentication produce typed, non-secret errors.

## Lease rules

- One active-control lease per profile generation.
- Lease ownership is explicit, never silently transferred.
- Disconnect, process death, endpoint close, or authenticated heartbeat expiry
  revokes the lease.
- Owner disposal revokes all attachments and invalidates the generation token.

## Provider authentication boundary

The runtime may expose states such as `authenticated`, `unauthenticated`, or
`expired`, plus a provider-owned re-authentication command or guidance. It must
not transmit credentials, provider cookies, OAuth refresh tokens, or API keys.
