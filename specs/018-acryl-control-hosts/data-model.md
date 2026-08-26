# Data Model: ACRYL Standalone Agent and Peer Hosts

## Design rule

These records describe ACRYL-owned identity and control state. They do not replace native Cordis Loader entries, Fibers, services, effects, Harness agents, Harness sessions, Market installation records, or profile manifests. Where those systems are authoritative, ACRYL stores a typed reference and projects current state on demand.

## Host identity

### HostKind

One of:

- `tui`
- `gui`
- `web`

Host kind selects presentation and native adapters. It does not select a different domain model.

### HostInstance

| Field | Meaning |
| --- | --- |
| `hostId` | Opaque identity for one running host process and generation |
| `kind` | `HostKind` |
| `profile` | Canonical selected profile name and directory reference |
| `generationId` | Current application/Cordis generation identity |
| `pid` | Local process identity when meaningful on the platform |
| `startedAt` | Host generation start time |
| `protocolVersion` | Attach protocol generation advertised by the host |
| `status` | `starting`, `ready`, `stopping`, `failed` |

`hostId` changes when a process or owning generation is replaced. It is not a durable profile identity.

## Profile ownership

### ProfileOwnershipLease

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Lease record schema generation |
| `profileKey` | Stable collision-resistant identity derived from the canonical profile authority |
| `ownerHostId` | Current `HostInstance.hostId` |
| `ownerKind` | Host presentation kind |
| `generationId` | Owning runtime generation |
| `endpoint` | Platform-local attach endpoint descriptor |
| `protocolVersion` | Control protocol generation |
| `issuedAt` | Initial ownership time |
| `heartbeatAt` | Last bounded liveness publication, if the transport requires one |
| `authReference` | Reference to owner-only attach credentials, never a project secret |

### Lease states

```text
UNOWNED
  -> ACQUIRING
  -> OWNED
  -> RELEASING
  -> UNOWNED

ACQUIRING -> CONFLICT
OWNED -> SUSPECT -> RECOVERING -> UNOWNED | OWNED
OWNED -> LOST
```

Rules:

- Only an exclusive platform authority can move `ACQUIRING` to `OWNED`.
- A lease record alone is not proof that its owner is alive.
- Stale recovery verifies process/generation and endpoint state before removal.
- Authentication or protocol mismatch never grants ownership automatically.
- Attached clients do not become owners.

## Control transport

### ControlEndpoint

A discriminated descriptor for a local IPC endpoint. It includes endpoint kind, opaque address, protocol generation, and host identity. It never exposes service objects or Cordis contexts.

### ControlCapability

A negotiated stable capability identifier, such as:

- host status and event observation;
- profile inspection;
- runtime architecture inspection;
- plugin lifecycle mutation;
- package/Market preview and execution;
- agent session query and command;
- approval response;
- shutdown or restart request.

Capabilities are generation-scoped. Clients must renegotiate after host replacement.

### ControlOperation

| Field | Meaning |
| --- | --- |
| `operationId` | Unique request identity |
| `kind` | Typed operation name |
| `profileKey` | Target profile identity |
| `requestedBy` | Local user/client identity and host reference |
| `requestedAt` | Request time |
| `state` | Current operation state |
| `restartClass` | `HOT`, `WARM`, or `COLD` when mutation is involved |
| `policy` | Approval/protection decision and rationale |
| `result` | Typed canonical result when settled |
| `error` | Stable structured error when failed |

State transitions:

```text
CREATED
  -> VALIDATING
  -> DENIED | READY
READY
  -> RUNNING
  -> CANCELLING
RUNNING
  -> SETTLING
  -> CANCELLING
SETTLING
  -> SUCCEEDED | FAILED | RECOVERABLE
CANCELLING
  -> CANCELLED | FAILED
```

A success receipt is emitted only after the durability and lifecycle settlement required by that operation.

## Runtime projections

### RuntimeArchitectureSnapshot

A bounded generation-scoped projection over native runtime state:

- Host and Client/TUI plane identity;
- native Fiber UID, parent UID, plugin identity, and phase;
- Loader ownership and stable entry ID where available;
- declared injects and resolution state;
- provided service names and owning Fibers;
- labeled effect ownership;
- protected/mutable policy projection.

The snapshot contains no service values, executable callbacks, private configuration, credentials, or unrestricted paths.

### PluginLifecycleReceipt

References the stable Loader entry, prior and resulting desired state, Host and presentation-plane settlement, restart class, protection decision, rollback outcome, and resulting generation identity. It does not become a second lifecycle authority.

## Agent identity

### AcrWorkerId

Stable logical worker identity in the ACRYL room/project layer.

### AgentRuntimeId

Identity for one live in-process agent, protocol connection, SDK run, or CLI process.

### ProviderSessionRef

Opaque adapter-owned reference used for resume when the provider supports it.

### AgentSessionBinding

| Field | Meaning |
| --- | --- |
| `workerId` | ACRYL logical worker |
| `runtimeId` | Current live runtime, if any |
| `providerId` | Registered provider identity |
| `providerSessionRef` | Optional opaque native session reference |
| `harnessSessionId` | Durable Harness session when the trajectory is Harness-native or projected there |
| `workspace` | Canonical workspace identity and cwd |
| `capabilities` | Generation-scoped truthful provider capabilities |
| `fidelity` | `native`, `structured`, `derived`, or `opaque-terminal` |
| `status` | `idle`, `running`, `waiting`, `stopping`, `stopped`, `failed` |

Presentation tab IDs and PTY IDs are explicitly excluded from logical identity.

## Agent trajectory

Harness durable session events remain authoritative for the built-in ACRYL agent. TUI projections fold those events into transcript blocks, tool cards, approvals, jobs, usage, and completion state.

External agent observations retain:

- provider and transport provenance;
- native sequence/session reference where available;
- fidelity classification;
- mapper version;
- reference to preserved raw evidence when retention policy allows it.

No projection upgrades terminal bytes to structured semantic messages without a verified protocol.

## Plugin candidate and promotion

### PluginCandidate

| Field | Meaning |
| --- | --- |
| `candidateId` | Unique candidate generation |
| `source` | Trusted catalog, package, local build, or agent-generated origin |
| `packageIdentity` | Package name, version, and immutable source reference |
| `targetProfile` | Profile to modify |
| `requestedPermissions` | Declared capability requirements |
| `provenance` | Creator, reason, source references, and parent generation |
| `restartClass` | Expected `HOT`, `WARM`, or `COLD` activation |
| `validation` | Build, typecheck, test, Loader, health, and compatibility results |
| `state` | Candidate state |
| `rollback` | Previous composition/generation and recovery instructions |

State transitions:

```text
DISCOVERED
  -> PREVIEWED
  -> APPROVED
  -> BUILDING
  -> VALIDATED
  -> STAGED
  -> ACTIVATING
  -> HEALTHY
  -> COMMITTED

any mutable phase -> FAILED -> ROLLED_BACK | QUARANTINED
```

External install scripts and filesystem mutations are not reversible merely because a Fiber is disposable. Their compensation and recovery results are recorded explicitly.

## TUI contributions

### TuiContribution

A lifecycle-owned descriptor registered by a TUI-facing plugin:

| Field | Meaning |
| --- | --- |
| `id` | Stable contribution identity |
| `kind` | `screen`, `command`, `keybinding`, `status`, `modal`, or `renderer` |
| `label` | Human-readable localized label key |
| `priority` | Deterministic presentation ordering, not dependency ordering |
| `requiredCapabilities` | Control capabilities needed to render or act |
| `availability` | Optional predicate over negotiated capabilities and host mode |
| `ownerFiberUid` | Diagnostic owner identity |

Contribution registration and any subscriptions/resources it creates disappear with the owning Fiber. A local TUI face may contain rendering code; an attached remote Host never sends executable UI code through the control protocol.

## Relationships

```text
Profile 1 --- 0..1 ProfileOwnershipLease
ProfileOwnershipLease 1 --- 1 HostInstance
HostInstance 1 --- 1 ControlEndpoint
HostInstance 1 --- * ControlCapability
ControlOperation * --- 1 Profile
AcrWorkerId 1 --- 0..* AgentRuntimeId
AgentSessionBinding * --- 1 provider
AgentSessionBinding 0..1 --- 1 Harness durable session
PluginCandidate * --- 1 target Profile
TuiContribution * --- 1 owning Fiber activation episode
```
