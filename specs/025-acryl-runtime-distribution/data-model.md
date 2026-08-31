# Data Model: Runtime and Distribution Milestone

## RuntimeCapability

| Field | Meaning | Validation |
|---|---|---|
| `id` | Stable capability identity | Unique, namespaced, immutable after publication |
| `version` | Capability version | Compatible with the running core range |
| `kind` | `core`, `surface`, `plugin-management`, `market`, `agent-control` | One canonical value |
| `requires` | Required capability/service identifiers | Each must be available before activation |
| `permissions` | Requested permission set | Validated against policy before activation |
| `hostContribution` | Optional host plugin entry | Lifecycle-owned by the capability Fiber |
| `clientContribution` | Optional surface contributions | Declares compatible surfaces explicitly |
| `provenance` | Source/publisher/content identity | Required for non-builtin capabilities |

## RuntimeComposition

| Field | Meaning | Validation |
|---|---|---|
| `profile` | Selected user profile | Must resolve to a valid profile |
| `surface` | `tui`, `web`, or `desktop` | Selects only allowed surface capabilities |
| `capabilities` | Ordered capability identities | Dependency graph must settle without duplicate providers |
| `hostAdapters` | Surface-owned native/transport adapters | Not exposed to unrelated surfaces |
| `generationId` | One boot generation identity | New for each root activation |

State transition:

```text
requested -> validating -> booting -> active -> disposing -> disposed
                              |           |
                              v           v
                            failed      restarting
```

## ArtifactManifest

| Field | Meaning | Validation |
|---|---|---|
| `artifact` | Artifact path and product kind | One manifest per produced artifact |
| `platform` / `arch` | Intended target | Must match all permitted native paths |
| `requiredFiles` | Runtime files known to be necessary | Every path must exist and be nonempty |
| `forbiddenPatterns` | Files never allowed in release payload | Must produce zero matches |
| `allowedNativePackages` | Target-native package directory allowlist | All discovered native packages must be listed |
| `byteBudget` | Maximum allowed size | Enforced after comparable build inputs |

## RuntimeEndpoint

| Field | Meaning | Validation |
|---|---|---|
| `url` | Loopback transport location | Loopback-only URL |
| `runtimeVersion` | Protocol/runtime compatibility version | Client must reject incompatible major version |
| `ownerPid` | Owner process identity | Must still correspond to the running owner |
| `tokenReference` | Secret lookup reference, never a plain token | Resolved only by authorized local client |
| `createdAt` | Endpoint creation time | Used to reject stale records |

Endpoint transitions:

```text
absent -> starting -> active -> stopping -> absent
                   |             |
                   v             v
                 failed        stale
```
