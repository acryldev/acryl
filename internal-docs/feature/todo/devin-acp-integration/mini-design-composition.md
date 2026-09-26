# Cordis Mini-Design — Devin ACP Provider Composition

**Feature**: devin-acp-integration (stories 11+)
**Written**: 2026-09-25, before implementation per `AGENTS.md` Cordis protocol
**Scope**: composing `acpProvider(devinAcpTransport(config))` into real profiles
via a new installable plugin package; the transport itself is covered by the
mini-design in `prd.md`.

## 1. Capability and plugin boundary

New package `plugins/acryl-agent-devin/` — the installable "Devin via ACP"
agent-provider capability. It needs independent lifecycle (Loader row,
disabled by default — Devin is opt-in), independent configuration (binary,
auth mode, cwd, model, permission mode), and independent replacement (a later
package can fill the ACP provider slot differently without touching runtime
code). It lives in `plugins/` per the repo layout discipline: an
independently replaceable capability, not stable-core contract.

A second capability row mounts `acryl-control` (`AcrAgentControlService`,
whose default export is the plugin) because nothing mounts it in any profile
today — every provider plugin's `inject: ['acrAgentControl']` PENDs forever
without it. The service is declared for all surfaces; it is the control
surface, not a vendor detail.

## 2. Provides and consumes

- **Provides**: an `AgentProvider` (`id: 'acp'`, `fidelity: 'structured'`,
  capabilities from `PROVIDER_CAPABILITIES.acp`) registered into
  `ctx.acrAgentControl` via `registerProvider(ctx, provider)`. The provider
  delegates `execute` to `devinAcpTransport(config)`.
- **Consumes**: hard `inject: ['acrAgentControl']`. No other service is
  injected. `ctx.get('approval')` is deliberately NOT used — see §5.
- **Durable facts**: none. `sessionId` lives in
  `AgentSnapshot.providerSessionRef`, already durable through the service.

## 3. Effects and disposal

Inside `apply(ctx, config)`:

- `const transport = devinAcpTransport(transportConfig)` — a plain object;
  spawned `devin acp` children appear lazily on `start`/`resume` commands.
- `ctx.plugin(acpProvider(transport))` — child Fiber; its `apply` calls
  `registerProvider(childCtx, provider)`, so `owner.effect()` removes the
  provider entry when this plugin unloads.
- `ctx.effect(() => () => transport.dispose())` — the owning Fiber's
  disposer kills every spawned child (SIGTERM → SIGKILL after 2 s), drains
  stdio, and clears the JSON-RPC correlation map.

Cleanup order on unload: child Fiber (provider entry dropped) and the
transport disposer run under the same unload — no orphan `devin acp` PID may
survive a row unmount, a disable flip, or an HMR swap. `dispose()` is
idempotent; a second activation creates a fresh transport/process pair.

## 4. Configuration and composition

`Config` (schemastery, validated by the Loader **before** `apply` — invalid
config fails the Fiber loudly):

- `binaryPath: Schema.string()` optional → `which devin` fallback
- `authMode: Schema.union(['devin-auth','windsurf-key','interactive'])`
  default `'devin-auth'`
- `cwd: Schema.string()` optional → falls back to the process cwd at
  composition (per-worker workspace cwd is a follow-up; noted, not built)
- `model: Schema.string()` optional
- `permissionMode: Schema.union(['normal','dangerous','bypass'])`
  default `'normal'`

**Loader row id = package name** (`acryl-agent-devin`). No naming exception —
this is not a multi-provider swap slot; the ACP provider *kind* is the shared
identity and it lives inside the row's plugin, not in the row id.

Composition via `ACRYL_CODING_CAPABILITIES` (the declared-capability seam in
`runtime/acryl-harness-runtime/src/coding-capabilities.ts` — data, not
per-surface `if`s):

- `agent-control`: all surfaces → `{insert:[{id:'acryl-control',name:'acryl-control'}]}`
- `devin-acp`: all surfaces →
  `{insert:[{id:'acryl-agent-devin',name:'acryl-agent-devin',disabled:true}]}`.
  Disabled rows never load the module, so non-Devin surfaces pay nothing and
  no `devin` binary is probed at mount time.

Desktop enablement: `profile.ts` parses a `devin-acp` section from the
Desktop settings document (same parse-then-validate path as `mode`/`port`/
`blend`, defaults `DEFAULT_DEVIN_ACP_SETTINGS`, malformed values throw) and
pushes an id-targeted patch `{id:'acryl-agent-devin', disabled: !enabled,
config: {...}}`. Enabling Devin is a settings write + restart generation —
no user YAML editing.

**Service fix required by this composition** (found during design):
`AcrAgentControlService.dispatch` currently rejects every command with
`unknown-worker` while `binding.runtimeId === null` — but `attach` always
produces `runtimeId: null`, so `start` could never reach a transport whose
process spawns lazily, and the `runtimeId`/`sessionId` a start returns were
never folded into the stored binding. The dispatch must (a) allow
`start`/`resume` when `runtimeId === null`, (b) merge a start/resume result's
`{runtimeId, sessionId→providerSessionRef, status}` into the stored binding,
and (c) on `stop`, clear `runtimeId` and mark the binding `stopped`/`idle`
per the result. This is a service-semantics fix in `agent-control.ts`, not a
workaround in the provider.

## 5. Events and durability

No Cordis events are dispatched and no waterfall is added.

`session/request_permission` is answered **inside the transport** by the
`permissionMode` policy plus an optional
`onPermissionRequest(params) → Promise<{optionId}>` callback supplied at
composition. Explicit decision on `ctx.approval`: `ApprovalService.request`
(`@deepseek-ai/dsh-user-approval`) requires a DSH `Agent` and an **open
session turn** for its `approval/asked`+`approval/decided` audit pair —
an `AgentSnapshot` is a different identity model, and fabricating a DSH
Agent/session to satisfy it would violate the no-parallel-framework rule
more seriously than a typed callback seam does. So: `permissionMode`
normal → reject-kind option (fail closed) when no callback answers;
`dangerous`/`bypass` → allow-kind option. The callback is the seam a future
worker-scoped approval bridge (or a Desktop answerer plugin) plugs into.
The `'acp'` capability map stays truthful — `approval.respond` is NOT
declared. Surfaced as a design-gap item in the blocker report.

Also fixed here: `JsonRpcClient` registers `onRequest` handlers but
`handleLine` only reads `EventEmitter.emit`'s boolean — the handler's return
value never reaches the wire, so inbound agent requests could never be
answered at all. The client must await the handler result and write a real
JSON-RPC response (`result` or `error`).

Durable: nothing new — `providerSessionRef` already carries the session id.

## 6. Verification

- **Loader-level** (real composition, not `ctx.plugin` alone): row mounts →
  provider registered; `acryl-agent-devin` PENDING without `acryl-control`,
  ACTIVE once control mounts (ordering independence); row unload →
  `unknown-provider` on attach **and** no surviving stub PID; remount →
  reactivation with a fresh provider instance; invalid row `config:` →
  FAILED Fiber before `apply`; duplicate provider id → registration error.
- **Service-level E2E**: attach → `start` → `send` → `cancel` → `stop`
  through `AcrAgentControlService` against `tests/stub-acp-server.mjs`
  (via a wrapper executable, the pattern already in
  `devin-acp-transport.spec.ts`).
- **Permission**: stub server sends `session/request_permission`; assert
  `permissionMode` policy answers and the callback path wins when present.
- **Gated smoke**: `DEVIN_ACP_SMOKE=1` + real `devin` on PATH → real
  round-trip; skipped otherwise.
- Headless-safe: no GUI launch, no network, no real `devin` required.
