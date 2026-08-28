# Data Model: ACRYL Agent, Plugin, Registry, and Blend Ecosystem

## Authority

```text
Profile runtime owner: one writable Cordis/Harness root
Active controller: one CLI, GUI, or Web surface with mutation lease
Delegated agent: worker with scoped capability token, never a root owner
Observer: attached read-only surface or job viewer
```

The owner lifecycle and active-control lease are separate. The owner starts/stops the root. The active controller alone may authorize or execute mutations. A delegated agent acts only through a capability granted by the active controller and global policy.

## GlobalPluginPolicy

Stored in `.acryl/policy/plugin-permissions.yaml`.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Policy format version |
| `preset` | `safe`, `developer`, or `yolo` convenience selection |
| `permissions` | Map from permission to `deny`, `ask`, or `auto-allow` |
| `publication` | Marketplace publication policy |
| `defaultWorkspaceMode` | `current-workspace` or `isolated-worktree` |
| `pluginIsolation` | Default in-process mode and future isolation override rules |

Permission identifiers initially include `project-files-readwrite`, `plugin-storage`, `ui-slot`, `network`, `subprocess`, `external-agent-launch`, `agent-delegation`, `credentials`, `control-transfer`, `runtime-mutation`, and `marketplace-publish`.

The policy is global. Per-agent overrides are a future extension point, not a second policy engine.

## DelegatedAgentJob

Durable job root: `.acryl/agents/jobs/JOB-<id>/`.

| Artifact | Meaning |
| --- | --- |
| `task.md` | Objective, requested outcome, and bounded context |
| `agent.json` | Connector kind, agent identity, declared fidelity, launch configuration |
| `permissions.yaml` | Requested permissions and evaluated policy decision |
| `workspace.json` | Current workspace or isolated worktree identity |
| `status.json` | Durable state, timestamps, pause reason, and resume reference |
| `result.md` | Completed work, changed files, and open problems |
| `diff-summary.md` | Recorded diff before runtime mutation |
| `handoff.md` | Explicit continuation packet |
| `evidence/` | Build, test, and integration evidence |

Job states:

```text
CREATED -> RUNNING -> READY_FOR_RUNTIME -> WAITING_FOR_CONTROLLER
RUNNING -> PAUSED -> RUNNING
READY_FOR_RUNTIME -> ACTIVATING -> SUCCEEDED | QUARANTINED | FAILED
any live state -> CANCELLED
```

A disconnected controller changes only runtime-gated jobs to `WAITING_FOR_CONTROLLER`. Offline source creation, builds, and unit tests may continue.

## PluginProposal and PluginCandidate

Proposal root: `.acryl/plugins/proposals/PLUGIN-<id>/`.

A proposal contains an intended manifest before creation. Candidate validation compares the final manifest to the proposal and policy before activation.

| Field | Meaning |
| --- | --- |
| `pluginId` | Stable ACRYL plugin identity |
| `version` | Candidate semantic version |
| `origin` | Agent job, local user, registry package, external DSH store, or Blend |
| `distributionMode` | `editable-source` or `sealed-artifact` |
| `requestedPermissions` | Final declared permissions |
| `proposalPermissions` | Pre-creation declared permissions |
| `compatibility` | ACRYL, Cordis, profile, platform, and API ranges |
| `publisher` | Publisher identity and optional signature reference |
| `validation` | Build, tests, lifecycle settlement, health, and compatibility results |
| `healthCheckpoint` | Last healthy composition before mutation |
| `state` | Candidate lifecycle state |

Lifecycle:

```text
PROPOSED -> BUILDING -> VALIDATED -> STAGED -> ACTIVATING -> HEALTHY -> INSTALLED
any mutable state -> FAILED -> QUARANTINED -> ROLLED_BACK
```

`QUARANTINED` disables the candidate and preserves diagnostic evidence. Rollback restores the checkpointed healthy composition before a recovery report is emitted.

## RegistrySource and PackageRecord

ACRYL Registry and each external DSH store are distinct `RegistrySource` records.

| Field | Meaning |
| --- | --- |
| `sourceId` | Stable catalog identity |
| `kind` | `acryl-registry` or `dsh-store` |
| `trustIdentity` | Publisher/source signing and trust configuration |
| `adapter` | Source-specific discovery and installation adapter |
| `enabled` | User-selected connectivity state |

`PackageRecord` always retains `sourceId`, package type, publisher, immutable version reference, compatibility, permissions, and lifecycle adapter. A DSH package never silently becomes an ACRYL package.

## Blend

A Blend is a versioned application recipe stored as a package or local project artifact.

| Field | Meaning |
| --- | --- |
| `blendId` | Stable identity |
| `version` | Versioned composition |
| `publisher` | Publisher and signature/license identity |
| `dependencies` | Versioned registry packages |
| `privatePlugins` | Editable source or sealed artifact contributions |
| `configuration` | Declared configuration and templates |
| `requestedPolicy` | Permission requests that can only tighten effective policy |
| `roles` | Optional room/agent roles and starter tasks |
| `compatibility` | ACRYL runtime and platform constraints |

Install modes:

```text
CREATE_PROJECT: create an isolated project, .acryl/, profile, and composition
APPLY_TO_PROJECT: calculate a plan against an existing project
```

`APPLY_TO_PROJECT` never has implicit conflict precedence. Conflicts produce a `BlendApplyPlan` with `blocked` state until the active controller writes a resolution record.

## Fork and update state

An editable package changed by the customer becomes a `LocalFork`.

| Field | Meaning |
| --- | --- |
| `upstreamPackage` | Original publisher/version reference |
| `forkBase` | Immutable source revision used as base |
| `localDiff` | Recorded customer modification reference |
| `updateState` | `current`, `update-available`, `merge-required`, or `detached` |

A local fork never auto-applies upstream changes. ACRYL can offer a compare/merge operation.

## Relationships

```text
Profile 1 --- 1 RuntimeOwner
Profile 1 --- 0..1 ActiveControlLease
ActiveControlLease 1 --- 0..* DelegatedAgentJob
DelegatedAgentJob 1 --- 0..* PluginProposal
PluginProposal 1 --- 0..1 PluginCandidate
PluginCandidate * --- 1 Profile
RegistrySource 1 --- * PackageRecord
Blend * --- * PackageRecord
Blend * --- * private PluginCandidate
BlendApplyPlan * --- 1 Profile
PackageRecord 0..1 --- 0..* LocalFork
```
