# Plan and Cordis mini-design: Agent UI Control

**Spec**: [spec.md](./spec.md). **Status**: draft, nothing built. Follows the six-point protocol in root `CLAUDE.md`.

## Package granularity

| Unit | Own package? | Reason |
|---|---|---|
| `acryl-ui-control` (Host + Client) | new, under `plugins/`, row id `acryl-ui-control` | Distinct lifecycle and security surface; user must be able to turn it off; plausible second provider (a WebMCP or Electron-CDP backend) |
| Layer 1 tools | not here | Each owning package (settings, workspace, lifecycle) registers its own tools; this plugin only owns generic UI driving |
| CLI operator and rescue (Scope B) | commands and an agent toolset in `apps/acryl-cli`; shared logic in `runtime/acryl-harness-runtime` | The CLI is a surface (renders and drives); repair and config logic belongs in the stable runtime so Desktop, Web and CLI share it. Nothing under `runtime/` may depend on `apps/` |
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

## Scope B design: CLI operator and rescue

### 1. Boundary
Two seams, both inside existing packages, so no new Loader row is needed for offline work:
- **Offline repair and config** live in `runtime/acryl-harness-runtime` next to `plugin-lifecycle-state.ts` and `plugin-doctor.ts` (extend, do not fork): a `ProfileInspector` (read-only diagnosis of profile, overrides, packages, boot logs), a `RepairPlan` (ordered, reversible steps) and a `ProfileBackup` (pre-image store with undo).
- **Online control** is a client of the Scope A channel: the CLI speaks the same `ui.*`, `settings.*`, `plugin.*` tools to a running instance.
The CLI (`apps/acryl-cli`) only renders reports, asks for approval and calls those services.

### 2. Provides and consumes
| Piece | Provides | Consumes |
|---|---|---|
| Runtime `ProfileInspector` | typed findings (extends `PluginHealthFinding`) | profile layout, overrides, package manifests, logs |
| Runtime `RepairPlan` + `ProfileBackup` | dry-run plan, apply, undo | inspector findings, atomic file writes |
| CLI commands | `acryl doctor`, `acryl repair [--dry-run\|--undo]`, `acryl config get/set`, `acryl plugin install/enable/disable`, `acryl app open/click/type` | the runtime services above and the online channel |
| CLI agent toolset | the same operations as tools plus orientation tools (`repo.map`, `docs.route`, `graft`) | CLI runtime |
| Online channel (Host side, in the app) | authenticated local endpoint exposing the Scope A tool contract | `tools`, profile secret |

### 3. Effects and disposal
Offline commands hold no long-lived resources: each mutation is one backup, one atomic write, one log line, and is fully undoable. The online channel client owns one connection with an abort signal and closes it on exit. The in-app endpoint is one `ctx.effect` (listener, secret file) with a disposer that closes the socket and removes the discovery file.

### 4. Configuration
The CLI reads the target profile from `--profile` or the default resolution in `acryl-home.ts`. Recipes (named, versioned repair steps) are data, not code paths, so they can be reviewed and added without editing the engine. The per-profile secret lives in the profile home with owner-only permissions and is regenerated on request.

### 5. Events and durability
The audit log from Scope A is shared. Backups are durable facts under the profile home. Diagnosis reports are ephemeral unless the user saves them.

### 6. Verification
| Case | Expected |
|---|---|
| Profile with a plugin that fails activation | `acryl doctor` names it; `acryl repair` disables that row only; undo restores it; app boots |
| Corrupt override file | detected, backed up, replaced with the last valid content; nothing else touched |
| pnpm store mismatch | diagnosed with the exact known cause (see the profile-homes note), fix is proposed, not guessed |
| Offline edit while the app runs | refused, routed through the online channel |
| Online: enable three plugins by request | applied live, state read back and matches, audit lines written |
| Install plugin into Desktop | installed, row enabled, live reload; dependency missing reports PENDING, not failure; failed activation rolls back |
| Channel security | wrong secret rejected, non-loopback refused, secret file has owner-only mode |
| Interrupted repair (kill mid-apply) | atomic write means the previous state or the new state, never a partial file |

Tests use temporary profile homes and real files, never the user's home.

### Risks
1. The strongest power in the product sits behind a local secret; the threat model (another local process, a malicious plugin reading the secret file) must be written before the channel ships.
2. A repair engine that guesses is worse than none; every step must be a named recipe with a precondition and an undo, or it does not ship.
3. Keeping the CLI runnable when the build itself is broken means it must not import the app bundle; it depends on `runtime/` only.
