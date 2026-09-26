# Tasks: Devin ACP Integration

**Input**: `prd.md` in this folder
**Status**: In Progress

## Task Index

| ID | Story | Status | Deps |
|----|-------|--------|------|
| 01 | ACP JSON-RPC over stdio client | [x] Done (8ee8d8e) | — |
| 02 | Devin ACP transport config + factory | [x] Done (8ee8d8e) | 01 |
| 03 | Devin ACP transport — spawn + initialize + session/new | [x] Done (8ee8d8e) | 02 |
| 04 | Devin ACP transport — session/prompt + session/update + cancel | [x] Done (8ee8d8e) | 03 |
| 05 | Devin ACP transport — disposal + lifecycle + SIGTERM | [x] Done (8ee8d8e) | 04 |
| 06 | Wire devinAcpTransport into acpProvider + export from index | [x] Done (8ee8d8e) | 05 |
| 07 | Desktop settings for Devin ACP (binary path, auth mode, model) | [x] Done (8ee8d8e) | 06 |
| 08 | Tests — JSON-RPC client unit tests | [x] Done (8ee8d8e) | 01 |
| 09 | Tests — transport lifecycle + cancellation + collision | [x] Done (8ee8d8e) | 05, 06 |
| 10 | Verify — typecheck + test + build pass | [x] Done (2026-09-24 rebase) | 09 |
| 11 | Composition — `acryl-agent-devin` plugin package + Loader rows + settings wiring + dispatch binding fix | [ ] Todo | 06, 07 |
| 12 | `session/request_permission` — JSON-RPC response fix + permissionMode/onPermissionRequest | [ ] Todo | 11 |
| 13 | `session-bridge.ts` provider-neutral routing via `acrAgentControl.dispatch()` | [ ] Todo | 11 |
| 14 | Loader-activation verification suite + E2E stub round-trip + gated real smoke | [ ] Todo | 11, 12, 13 |

## Post-rebase verification notes (2026-09-24)

Rebased onto `upstream/main` (316a375); package moved to
`runtime/acryl-control/` per the repo layout regroup. Verified:

- `corepack pnpm run typecheck` — clean across all packages
- `corepack pnpm run build` — clean
- `corepack pnpm --filter acryl-control run test` — 57/57 pass
  (8 new JSON-RPC + 8 new transport lifecycle tests)

Pre-existing upstream failures unrelated to this branch:

- `apps/acryl-cli` `tests/direct.spec.ts` — 5s timeout flake under
  full-suite parallel load (passes standalone)
- `apps/acryl-desktop` `tests/plugin-lifecycle-controller.spec.ts` —
  references `acryl-development-canvas`, a package upstream removed in
  095dd57 (canvas is now Market-installed)
- `plugins/acryl-ui` provenance tests — byte-identity drift after the
  DSH pin bump to `dsh-v0.1.5-alpha.1`

## Remaining follow-ups (beyond this PRD)

Stories 11–14 below absorb the composition/routing/verification items. The
rest stay deferred:

- ~~Compose `acpProvider(devinAcpTransport(config))` into a profile via a
  Cordis plugin / Loader row~~ → story 11 (`plugins/acryl-agent-devin`
  + `agent-control`/`devin-acp` coding-capability rows + settings wiring)
- ~~`session-bridge.ts` provider-neutral routing (M2/M4)~~ → story 13
- ~~`session/request_permission` routing~~ → story 12 (see
  `mini-design-composition.md` §5 for the `ctx.approval` decision —
  DSH `Agent`+open-turn precondition cannot host `AgentSnapshot`
  identities today)
- Interactive `authenticate` flow (currently throws) — deferred
- Settings UI wiring for `DevinAcpSettings` (settings-file parsing lands
  in story 11; the renderer UI is a separate follow-up) — deferred
- Per-worker workspace `cwd` (transport `cwd` is per-provider today) —
  deferred
- `acp-work` branch reconciliation (keep `3132bc1`+`f0bb3bc` Direction-B
  ACP server; drop `256e287`+`a78e4b7` subpar TUI subagent) — decision
  recorded in blocker report, executed after this feature lands
- Upstream PR → Phase 9

## Story Details

### Story 01 — ACP JSON-RPC over stdio client [ship]

Create `acryl-control/src/agent/transports/acp-json-rpc.ts` — a reusable
JSON-RPC 2.0 client over child process stdio.

- `JsonRpcClient` class that wraps a `ChildProcess` (or any object with
  `stdin`, `stdout`, `stderr` streams).
- `call(method, params): Promise<unknown>` — sends a request with an
  auto-incremented id, returns a promise that resolves on the matching
  response, rejects on error.
- `notify(method, params): void` — sends a notification (no id, no response
  expected).
- `onNotification(method, handler): void` — registers a handler for
  inbound notifications (e.g. `session/update`).
- `onRequest(method, handler): void` — registers a handler for inbound
  requests (e.g. `session/request_permission`).
- `dispose(): void` — removes all listeners, rejects pending calls.
- Line-delimited JSON framing (one JSON object per line on stdin/stdout).
- Correlation map: `Map<number, {resolve, reject}>`.
- Parse errors on stderr → log or surface via callback.

**Acceptance**: Unit tests in `acryl-control/tests/acp-json-rpc.spec.ts`
verify call/notify/onNotification/onRequest/dispose with a stub process.

### Story 02 — Devin ACP transport config + factory [ship]

Create `acryl-control/src/agent/transports/devin-acp-config.ts`:

- `DevinAcpTransportConfig` interface: `binaryPath?`, `authMode:
  'devin-auth' | 'windsurf-key' | 'interactive'` (default: `'devin-auth'`),
  `cwd: string`, `env?: Record<string,string>`, `model?: string`,
  `permissionMode?: 'normal' | 'dangerous' | 'bypass'`.
- `resolveDevinBinary(config): string` — uses `config.binaryPath` if set,
  else `which devin` via `child_process.execFileSync`, else throws.
- `devinEnv(config): Record<string,string>` — builds env for the subprocess,
  passing `WINDSURF_API_KEY` through if `authMode === 'windsurf-key'`.

**Acceptance**: Config type is exported; `resolveDevinBinary` and
`devinEnv` are pure functions testable without spawning.

### Story 03 — Devin ACP transport — spawn + initialize + session/new [ship]

Create `acryl-control/src/agent/transports/devin-acp.ts`:

- `devinAcpTransport(config: DevinAcpTransportConfig): AgentTransport`
  returns an object with `execute(binding, command, signal)`.
- On first `execute` with `command.kind === 'start'`:
  - Spawn `devin acp` via `child_process.spawn` with resolved binary path,
    `cwd: config.cwd`, `env: devinEnv(config)`, stdio: `['pipe','pipe','pipe']`.
  - Create a `JsonRpcClient` wrapping the child process.
  - Send `initialize` with `protocolVersion: 1`, client capabilities
    (`fs.readTextFile: true`, `fs.writeTextFile: true`, `terminal: true`),
    `clientInfo: { name: 'acryl-desktop', version: '0.1.0' }`.
  - If `authMethods` is non-empty and `authMode === 'interactive'`, surface
    via a callback (for now: throw `transport-unavailable` with a clear
    message — interactive auth is a follow-up).
  - Send `session/new` with `cwd: config.cwd`, `mcpServers: []`.
  - Store the `sessionId` and `runtimeId` (the child PID as string).
  - Return `{ sessionId, runtimeId, status: 'idle' }`.
- The child process and JsonRpcClient are stored in a closure-scoped state
  object keyed by `binding.workerId`.

**Acceptance**: A stub JSON-RPC server that responds to `initialize` and
`session/new` is spawned in tests; the transport completes the handshake
and returns a sessionId.

### Story 04 — Devin ACP transport — session/prompt + update + cancel [ship]

Extend `devin-acp.ts`:

- On `execute` with `command.kind === 'send'`:
  - Send `session/prompt` with `sessionId` and `prompt: [{ type: 'text',
    text: command.payload }]`.
  - Collect `session/update` notifications into a structured result array.
  - When the `session/prompt` response arrives with `stopReason`, return
    `{ stopReason, updates: [...] }`.
- On `execute` with `command.kind === 'cancel'`:
  - Send `session/cancel` notification.
  - The pending `session/prompt` call should resolve with `stopReason:
    'cancelled'` (the agent sends the response after cancel).
  - If `signal.aborted`, also send `session/cancel`.
- On `execute` with `command.kind === 'stop'`:
  - Kill the child process (SIGTERM → SIGKILL after 2s).
  - Dispose the JsonRpcClient.
  - Clear the state object.
- On `execute` with `command.kind === 'resume'`:
  - If `binding.providerSessionRef` (sessionId) is set and the agent
    advertised `loadSession`, send `session/load`. Otherwise, fall back to
    `session/new`.

**Acceptance**: Stub server tests verify send → updates → stopReason
round-trip, cancel resolves with cancelled, stop kills the process.

### Story 05 — Devin ACP transport — disposal + lifecycle [ship]

Extend `devin-acp.ts`:

- The transport factory accepts an optional `ownerEffect: () =>
  Disposable` callback. When the provider plugin registers via
  `registerProvider`, the `owner.effect()` disposer calls the transport's
  `dispose()` to kill any spawned process.
- `dispose()` iterates all worker state objects, kills each child process
  (SIGTERM → SIGKILL after 2s), drains stdio, disposes the JsonRpcClient,
  and clears the map.
- `signal.aborted` on any in-flight `execute` sends `session/cancel` then
  SIGTERM.
- No orphan process: after `dispose()`, no child PID from this transport
  remains alive.

**Acceptance**: Tests verify that after disposal, no child process is
alive; a second activation spawns a new process with a different runtimeId.

### Story 06 — Wire into acpProvider + export [ship]

- In `acryl-control/src/index.ts`, add `export * from
  './agent/transports/devin-acp.ts'` and `export * from
  './agent/transports/devin-acp-config.ts'`.
- No change to `acpProvider` — it already accepts a transport. The wiring
  happens at composition time: `acpProvider(devinAcpTransport(config))`.

**Acceptance**: `devinAcpTransport` and `DevinAcpTransportConfig` are
importable from `acryl-control`. `corepack pnpm run typecheck` passes.

### Story 07 — Desktop settings for Devin ACP [ship]

Add `DevinAcpSettings` type to `acryl-desktop/src/desktop-settings-api.ts`:

- `enabled: boolean` (default: false)
- `binaryPath: string | null` (default: null → auto-resolve)
- `authMode: 'devin-auth' | 'windsurf-key' | 'interactive'` (default:
  'devin-auth')
- `model: string | null` (default: null → Devin default)
- `permissionMode: 'normal' | 'dangerous' | 'bypass'` (default: 'normal')

This is a type-only addition for now; the settings UI wiring is a
follow-up. The type is exported so the Desktop can consume it.

**Acceptance**: Type is exported, typecheck passes.

### Story 08 — Tests — JSON-RPC client unit tests [ship]

Create `acryl-control/tests/acp-json-rpc.spec.ts`:

- Test call/notify/onNotification/onRequest/dispose with a stub process
  that echoes JSON-RPC responses.
- Test correlation: two concurrent calls get the right responses.
- Test error: a JSON-RPC error response rejects the call.
- Test dispose: pending calls are rejected.

**Acceptance**: `corepack pnpm --filter acryl-control run test` passes.

### Story 09 — Tests — transport lifecycle + cancellation + collision [ship]

Create `acryl-control/tests/devin-acp-transport.spec.ts`:

- **Stub server**: a small Node script that speaks ACP JSON-RPC over
  stdio (initialize → session/new → session/prompt → session/update →
  stopReason). Spawned as a subprocess in tests.
- **Attach + start**: verify the transport spawns the stub, completes
  initialize, returns a sessionId.
- **Send**: verify a prompt round-trip returns updates + stopReason.
- **Cancel**: verify cancel resolves with cancelled stopReason.
- **Stop**: verify the subprocess is killed.
- **Disposal**: verify after dispose(), no child process is alive.
- **Reactivation**: verify a second activation spawns a new process with
  a different runtimeId.
- **Capability rejection**: via `AcrAgentControlService.dispatch`,
  verify a command the ACP provider doesn't declare throws
  `capability-rejected`.
- **Collision**: verify a duplicate runtimeId throws
  `runtime-collision`.
- **Smoke (gated)**: if `DEVIN_ACP_SMOKE=1` and `devin` is on PATH, run
  a real `devin acp` round-trip. Skip otherwise.

**Acceptance**: All tests pass with the stub server. Smoke test is
skipped by default.

### Story 10 — Verify — typecheck + test + build [ship]

Run the full headless gate:

```bash
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build
```

Fix any failures. This is the final verification before commit.

**Acceptance**: All three commands exit 0.

### Story 11 — Composition: `acryl-agent-devin` package + Loader rows + settings wiring + dispatch binding fix [ship]

Read `mini-design-composition.md` in this folder FIRST — it is the binding
design (AGENTS.md Cordis protocol). Then implement:

**A. Service fix in `runtime/acryl-control/src/agent/agent-control.ts`**

`AcrAgentControlService.dispatch` currently throws `unknown-worker` for any
command while `binding.runtimeId === null`, but `attach` always produces
`runtimeId: null`. For a lazily-spawning transport (ACP) `start` must be
dispatchable before a runtime exists:

- Allow `start`/`resume` when `runtimeId === null` (all other command kinds
  still require a live runtime).
- Merge a `start`/`resume` result into the stored binding: `runtimeId ←
  result.runtimeId`, `providerSessionRef ← result.sessionId`, `status ←
  result.status`. Detect the shape defensively (result is `unknown`).
- On `stop`, clear `runtimeId` and mark the binding `stopped`.
- Keep the stored `AgentSnapshot` immutable — replace via
  `bindings.set(workerId, Object.freeze({...binding, ...}))`.

**B. New package `plugins/acryl-agent-devin/`** (TypeScript, modeled on
`plugins/acryl-mount-anchors/` minus the client half):

- `package.json`: `name: 'acryl-agent-devin'`, `"type": "module"`, `main`/
  `types`/`exports` (root + `./package.json`), `files`, `engines:
  ^22.19.0 || >=24.0.0`, `dsh.bundle.patch: './cordis.patch.yml'`, build via
  `tsdown` + declaration-only `tsc`; `peerDependencies`/`devDependencies` on
  `@deepseek-ai/cordis`, `devDependencies` on `acryl-control: workspace:*`,
  `@deepseek-ai/schemastery`.
- `src/index.ts` — function plugin, NO default export:
  - `export const name = 'acryl-agent-devin'`
  - `export const inject = ['acrAgentControl']`
  - `export const Config = Schema.object({...})` per mini-design §4
    (binaryPath?, authMode, cwd?, model?, permissionMode?)
  - `export function apply(ctx, config)`:
    `const transport = devinAcpTransport(normalizeDevinAcpConfig({...config,
    cwd: config.cwd ?? process.cwd()}))`,
    `ctx.plugin(acpProvider(transport))`,
    `ctx.effect(() => () => transport.dispose())`.
- `cordis.patch.yml`: one `- insert:` row, `id: acryl-agent-devin`,
  `name: acryl-agent-devin` (row id === package name — repo law).

**C. Workspace/layout plumbing (same commit)**

- `pnpm-workspace.yaml`: add `- plugins/acryl-agent-devin` to the explicit
  packages list.
- `scripts/verify-layout.mjs`: update the `OWNED_WORKSPACE_POLICY` literal
  (duplicated package list) — the CI gate fails otherwise. Add the package
  to the manifests name-check loop if the other plugins are listed there.
- Regenerate `pnpm-lock.yaml` via `corepack pnpm install` (NOT
  `--frozen-lockfile` — the new package changes the lockfile).
- `apps/acryl-desktop/package.json`: add `acryl-control: workspace:*` and
  `acryl-agent-devin: workspace:*` to `dependencies` (matches how
  `acryl-extension-context` etc. resolve through the desktop's closure);
  extend the `prebuild` script with `pnpm --filter acryl-agent-devin run
  build` (acryl-control is already built there).
- `apps/acryl-cli/package.json`: add `acryl-agent-devin: workspace:*` (its
  `acryl-control` dep already exists) if the `devin-acp` capability is
  declared for `tui`.

**D. Capability rows in
`runtime/acryl-harness-runtime/src/coding-capabilities.ts`**

- Extend `AcrylCodingCapabilityId` with `'agent-control'` and `'devin-acp'`.
- `agent-control` (all three surfaces):
  `{insert:[{id:'acryl-control',name:'acryl-control'}]}`.
- `devin-acp` (all three surfaces):
  `{insert:[{id:'acryl-agent-devin',name:'acryl-agent-devin',disabled:true}]}`.
- The capability table is the seam — do NOT special-case rows in callers.

**E. Desktop settings wiring in `apps/acryl-desktop/src/profile.ts`**

- Extend `DesktopStartupSettings`/`desktopStartupSettingsFromSettings` with
  a `devin-acp` section parsed from the settings document (namespace —
  follow the file's own convention; check `DESKTOP_SETTINGS_NAMESPACE`):
  `enabled` (bool, default false), `binaryPath` (string|null),
  `authMode` (union, default 'devin-auth'), `model` (string|null),
  `permissionMode` (union, default 'normal'). Reuse `DevinAcpSettings` +
  `DEFAULT_DEVIN_ACP_SETTINGS` from `desktop-settings-contract.ts` —
  one exported type per concept. Malformed values throw with the same
  `${BIN_NAME}` error style as `parseDesktopPort`/`parseDesktopBlend`.
- After the settings row is resolved (where `readDesktopStartupSettings`
  already runs), push an id-targeted patch `{id:'acryl-agent-devin',
  disabled: !devin.enabled, config: {binaryPath?, authMode, model?,
  permissionMode}}` — overrides the insert's `disabled:true` only when the
  user opted in. `cwd` is NOT settable from settings (mini-design §4).

**F. Tests**

- `plugins/acryl-agent-devin/tests/` (or colocated spec per repo
  convention): plugin `Config` rejects bad `authMode`/`permissionMode`;
  `ctx.plugin` + `AcrAgentControlService` → provider `'acp'` visible via a
  successful `attach`; without the service the plugin stays PENDING, then
  ACTIVATES when `AcrAgentControlService` mounts; `fiber.dispose()` →
  `attach` rejects `unknown-provider`.
- `runtime/acryl-control/tests/agent-control.spec.ts`: cover the dispatch
  fix — attach → `start` (mock provider returning `{sessionId, runtimeId,
  status}`) → stored snapshot carries runtimeId/providerSessionRef →
  `send` works → `stop` clears runtimeId.
- Desktop-side: settings parse test (absent → defaults; malformed → throw)
  next to the profile tests in `apps/acryl-desktop/tests/`.

**Acceptance**:

- `attach → start → send → stop` round-trips through
  `AcrAgentControlService` with a stub `AgentProvider` exercising the new
  dispatch path.
- The plugin registers provider `acp` end-to-end through `ctx.plugin`.
- `corepack pnpm --filter acryl-agent-devin run build` and
  `corepack pnpm run typecheck` pass; `pnpm-lock.yaml` updated;
  `node scripts/verify-layout.mjs` (or `corepack pnpm run check` layout
  step) green.

### Story 12 — `session/request_permission` handling [ship]

Depends on 11. Implements mini-design §5.

**A. Fix `JsonRpcClient` inbound-request responses**
(`runtime/acryl-control/src/agent/transports/acp-json-rpc.ts`)

`handleLine` currently emits `request:<method>` and reads `emit`'s boolean
— the handler's return value never reaches the wire, so no inbound agent
request can ever be answered. Rewrite so that:

- A registered `onRequest` handler's return value (sync or Promise) is
  written back as `{jsonrpc:'2.0', id, result}`; a thrown/rejected handler
  writes `{error:{code:-32603,message}}`.
- No handler → `-32601` method-not-found (current behavior, keep).
- Consider replacing `emitter` for requests with a `Map<method, handler>`
  (single handler per method) — document the choice. Notifications keep
  the emitter.
- Cover with tests in `acp-json-rpc.spec.ts`: handler result → response
  line on the stub's stdin; handler throw → error response; unknown
  request → -32601.

**B. Permission policy in the transport**

- `devin-acp-config.ts`: extend `DevinAcpTransportConfig` with
  `onPermissionRequest?: (params: DevinAcpPermissionRequest) =>
  Promise<DevinAcpPermissionResponse>` where the request type models the
  ACP params (`sessionId`, `toolCall`, `options[]`) and the response is
  `{optionId: string}` or an outcome selecting an option. Keep it a
  callback — NOT a service — per mini-design §5.
- `devin-acp.ts`: `rpc.onRequest('session/request_permission', handler)`:
  consult `config.onPermissionRequest` first; without it, apply
  `permissionMode`: `'normal'` → prefer a `reject`-kind option (fail
  closed); `'dangerous'`/`'bypass'` → prefer `allow_always` then
  `allow_once`. Option kinds come from the ACP spec — check the real
  `devin acp` docs
  (`/usr/local/Caskroom/devin-cli/*/share/devin/docs`, `devin acp --help`)
  for the exact option/kind vocabulary and whether `devin acp` accepts a
  `--permission-mode`-style flag that should be passed at spawn; wire the
  flag if it exists.
- The handler must NEVER leave the agent unanswered (timeout → reject
  outcome).

**C. Plugin passthrough**

`plugins/acryl-agent-devin`: thread `permissionMode` through `Config` →
transport config (already in Config per story 11); leave
`onPermissionRequest` unset (no answerer exists yet — the seam is the
deliverable). Do NOT declare `approval.respond` in the acp capability map.

**Acceptance**: stub server emits a `session/request_permission` mid-prompt;
the transport answers per policy (`normal` → reject-kind optionId,
`bypass` → allow-kind); `onPermissionRequest` override wins when set; the
JSON-RPC response is a real `result` frame, not an error; tests pass.

### Story 13 — `session-bridge.ts` provider-neutral routing [ship]

Depends on 11 (`acrAgentControl` must exist to dispatch through).

`runtime/acryl-harness-runtime/src/session-bridge.ts` today routes every
session through `ctx.agents`/`AgentHandle` (the DSH-native seam). Make the
bridge provider-neutral:

- `open(options)` accepts a worker/provider selection (extend
  `AcrylSessionBridgeOptions`): when the caller binds a worker to a
  non-`dsh-native` provider (e.g. `providerId: 'acp'`), open →
  `ctx.acrAgentControl.attach(...)`, then `dispatch(workerId,
  {kind:'start'})`; `submitPrompt` → `{kind:'send'}`; `cancel` →
  `{kind:'cancel'}`; `dispose` → `{kind:'stop'}`. DSH-native sessions keep
  the existing `ctx.agents` path — unchanged default when no acr provider
  is selected or `acrAgentControl` is absent.
- Use `ctx.get('acrAgentControl')` (optional service) — PENDING-safe when
  the row isn't mounted; never `inject` it unconditionally into existing
  consumers.
- Map the structured `execute` result (`{stopReason, updates[]}` — ACP
  `session/update` notifications) into `AssistantStreamFrame`s for
  `subscribeAssistantStream`. Keep provenance honest per the design doc:
  ACP structured updates are semantic events (message chunks, tool calls),
  not terminal text — project them as such; do NOT promote them into a
  DSH session transcript they didn't come from.
- `selectModel`/`installModelSelection` stay DSH-only — return an honest
  unsupported result for acr workers rather than faking it.

**Acceptance**: `session-bridge` spec additions — open/send/cancel/dispose
against the `acp` provider via a stub transport (or stub ACP server):
frames reflect the structured updates; DSH-native bridge tests keep
passing unchanged; `typecheck` green.

### Story 14 — Loader-activation verification + E2E + gated smoke [ship]

Depends on 11–13. Implements the design-doc verification matrix
(`docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` :183-195) for the ACP
provider end to end. Follow the real-composition precedents:
`runtime/acryl-harness-runtime/tests/extension-examples.spec.ts`
(PENDING→ACTIVE, provider replacement reactivation, Config failure →
FAILED Fiber), `tests/engine-host*.spec.ts` (Loader entry row swaps), and
`apps/acryl-desktop/tests/plugin-lifecycle-controller.spec.ts`
(package → Loader row → apply/dispose via `boot()`).

Cover, with real Loader/host activation (not only `ctx.plugin`):

- Row mounts `acryl-agent-devin` → provider `'acp'` registered.
- Ordering independence: devin row PENDING without `acryl-control`,
  ACTIVE once the control row mounts.
- Unload the devin row → `attach` rejects `unknown-provider` AND the
  spawned stub process is dead (assert the recorded PID is gone — no
  orphan `devin acp`).
- Remount → reactivation registers a fresh provider (no stale reference,
  no duplicate registration).
- Invalid row `config:` → Fiber FAILED before `apply` runs.
- Duplicate provider id → registration error surfaces.
- `capability-rejected` and `runtime-collision` through
  `acrAgentControl.dispatch` per existing service tests.
- E2E round-trip through `AcrAgentControlService` with the stub ACP
  server (wrapper-executable pattern from `devin-acp-transport.spec.ts`):
  attach → `start` → `send` (collect `session/update`s + `stopReason`) →
  `cancel` → `stop` (assert process dead).
- Real `devin acp` smoke gated behind `DEVIN_ACP_SMOKE=1` and `devin` on
  PATH — skip by default.

**Acceptance**: the suite passes headlessly (no GUI, no network, no real
`devin`); `corepack pnpm run test` green; no orphan processes after the
suite (assert via PID liveness checks in-test).
