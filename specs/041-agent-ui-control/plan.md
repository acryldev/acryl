# Plan and Cordis mini-design: Agent UI Control

**Spec**: [spec.md](./spec.md). **Status**: draft, nothing built. Follows the six-point protocol in root `CLAUDE.md`.

## Package granularity

| Unit | Own package? | Reason |
|---|---|---|
| `acryl-ui-control` (Host + Client) | new, under `plugins/`, row id `acryl-ui-control` | Distinct lifecycle and security surface; user must be able to turn it off; plausible second provider (a WebMCP or Electron-CDP backend) |
| Layer 1 tools | not here | Each owning package (settings, workspace, lifecycle) registers its own tools; this plugin only owns generic UI driving |
| MCP exposure for external agents (US5) | later, separate row `acryl-ui-control-mcp` | Different consumer and off by default |

## 1. Capability and plugin boundary

`acryl-ui-control` owns exactly one capability: a governed, snapshot-and-act interface to the accessibility tree of the current ACRYL window. It does not own settings, sessions or approvals; it consumes them.

## 2. Provides and consumes

| Half | Provides | Hard `inject` | Optional `ctx.get()` |
|---|---|---|---|
| Host | Tools `ui.snapshot`, `ui.click`, `ui.type`, `ui.select`, `ui.press`, `ui.scroll`, `ui.wait`, `ui.screenshot` via `ctx.tools` + `defineTool` | `tools`, `webServer` (or the transport spike's choice) | approval/policy service if separate |
| Client | The in-page driver: snapshot builder, ref table, action executor, indicator UI, kill switch | `slots` | `layout` (to place the indicator) |

Host and Client are two halves of one package joined by an authenticated channel (guide: Client plugins cannot inject Host services). The channel direction is the first open question; the Connection RPC is unary Client to Host today.

## 3. Effects and disposal

| Resource | Owner | Acquired in | Disposer |
|---|---|---|---|
| Tool registrations | Host | one `ctx.effect` | returned disposers, reverse order |
| Host to Client channel (stream or poll loop) | Host + Client | one `ctx.effect` each | close/abort, then await quiescence |
| Ref table and snapshot generations | Client | driver instance | cleared on dispose; all refs become stale |
| MutationObserver / event listeners for the driver | Client | one `ctx.effect` | disconnect/removeEventListener |
| "Agent is driving" indicator slot | Client | one `ctx.effect` | slot registration disposer |

Quiescence: after disposal no tool answers, no observer runs, no request is left pending (pending calls settle with a typed "driver unloaded" error).

## 4. Configuration and composition

Runtime-validated schema: `enabled` layers (1, 2, 3 individually), `snapshotMaxNodes`, `redactionRules`, `approval` mode, `auditLog` path, `allowedRegions`. Row id equals package name. Advanced mode only at first, next to `acryl-workspace`, and added to `MANAGED_PLUGIN_LIFECYCLE_ENTRIES` so the user can switch it off. The policy and approval settings are on a deny-list the tools themselves cannot write.

## 5. Events and durability

- Live driver events (indicator on/off, kill) are ordinary Cordis events; not durable.
- The audit log is a durable fact: append-only file under the profile home, one JSON line per call (tool, target role and name, outcome, approver). It is the record, no second store.
- Snapshots are ephemeral and never persisted (they can contain user content).

## 6. Verification

| Case | Expected |
|---|---|
| Activate host + client through a real Loader | tools appear; PENDING without a required provider; reactivation on return |
| Disable then re-enable | tools vanish and return, no duplicate registrations after 10 reloads, no leaked observers |
| Snapshot of a jsdom-rendered ACRYL tree | roles, names, states, stable refs; size cap and pagination honored |
| Stale ref | typed error, never an action on another element |
| Sensitive field | absent from snapshot, `ui.type` refused |
| Destructive click | requires approval; approval is per call |
| Self-protection | attempt to change policy or disable the plugin fails closed |
| Kill switch mid-run | pending calls settle, driver stops, user input unaffected |
| Web and Desktop | same tests pass on both renderers; layer 3 absent on Web is reported, not silent |

Tests use real Cordis Loader activation, real DOM (jsdom) for the driver, and never the user's data.

## Risks

1. The Host to Client transport may need a Harness change; if so it goes in a separate upstream-pin-style change, never an edit inside `deepseek-harness/`.
2. Poor accessibility names in existing components; an `aria-label` pass may be needed across `@acryl/ui` and upstream slots.
3. Security is the product here: an over-permissive default is worse than no feature. Default is approval-required for every mutating UI action until the user relaxes it.
