# Tasks: Devin ACP Integration

**Input**: `prd.md` in this folder
**Status**: In Progress

## Task Index

| ID | Story | Status | Deps |
|----|-------|--------|------|
| 01 | ACP JSON-RPC over stdio client | [ ] Pending | — |
| 02 | Devin ACP transport config + factory | [ ] Pending | 01 |
| 03 | Devin ACP transport — spawn + initialize + session/new | [ ] Pending | 02 |
| 04 | Devin ACP transport — session/prompt + session/update + cancel | [ ] Pending | 03 |
| 05 | Devin ACP transport — disposal + lifecycle + SIGTERM | [ ] Pending | 04 |
| 06 | Wire devinAcpTransport into acpProvider + export from index | [ ] Pending | 05 |
| 07 | Desktop settings for Devin ACP (binary path, auth mode, model) | [ ] Pending | 06 |
| 08 | Tests — JSON-RPC client unit tests | [ ] Pending | 01 |
| 09 | Tests — transport lifecycle + cancellation + collision | [ ] Pending | 05, 06 |
| 10 | Verify — typecheck + test + build pass | [ ] Pending | 09 |

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
