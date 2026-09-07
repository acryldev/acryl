# Contract: `AcrylEngine` engine-neutral runtime seam

**Owner**: `acryl-harness-runtime/src/engine/`
**Consumers**: `acryl-tui` (Phase A), later `acryl-desktop` / `acryl-web`
**Status**: proposed (Phase A)

This is a design contract, not final code. Names may adjust in implementation;
the *shape* and *guarantees* are the contract.

## Types (illustrative TypeScript)

```ts
export type AcrylEngineName = 'dsh' | 'pi'

/** One-field marker service registered at engine root; read as ctx.runtime. */
export interface AcrylRuntimeMarker {
  readonly engine: AcrylEngineName
}
declare module '@deepseek-ai/cordis' {
  interface Context { runtime: AcrylRuntimeMarker }
}

/** Live handle for one started engine. Owned by the adapter's effect tree. */
export interface AcrylEngineHandle {
  readonly ctx: import('@deepseek-ai/cordis').Context
  readonly engine: AcrylEngineName
  readonly readiness: 'ready' | 'unavailable'
  /** Engine-neutral session operations (see acryl-control/contracts/session.ts). */
  readonly sessions: AcrylSessionClient
  /** Ordered, idempotent, quiescent teardown. */
  dispose(): Promise<void>
}

export interface AcrylEngineStartOptions {
  readonly profile: string
  readonly resumeSessionId?: string
}

/** ACRYL-owned mapping between one concrete engine and this contract. */
export interface AcrylEngineAdapter {
  readonly name: AcrylEngineName
  /** Declared fidelity - must assert HMR + sandbox + approval parity (FR-012). */
  readonly fidelity: {
    readonly hmr: boolean
    readonly sandbox: boolean
    readonly approvals: boolean
    readonly notes: string
  }
  start(options: AcrylEngineStartOptions): Promise<AcrylEngineHandle>
}

export type AcrylEngineErrorCode =
  | 'unknown-engine'        // name not registered            → AcrylExitClass 'usage'
  | 'fidelity-rejected'     // adapter cannot meet HMR/sandbox/approval → 'unavailable'
  | 'engine-start-failed'   // boot/auth/version failure       → 'unavailable'
  | 'engine-collision'      // a second engine already ACTIVE  → 'conflict'

export class AcrylEngineError extends Error {
  constructor(readonly code: AcrylEngineErrorCode, message: string) { super(message) }
}

/** Registry (module-level in acryl-harness-runtime). */
export function registerAcrylEngineAdapter(
  owner: import('@deepseek-ai/cordis').Context,
  adapter: AcrylEngineAdapter,
): void   // effect-owned; deregisters on Fiber unload

export function resolveAcrylEngineAdapter(name: string): AcrylEngineAdapter
// throws AcrylEngineError('unknown-engine', ...) listing valid names
```

## Guarantees

| # | Guarantee | Maps to |
| --- | --- | --- |
| G1 | `resolveAcrylEngineAdapter` throws **before any `boot()`** for an unknown name, naming valid engines. | FR-005, SC-005 |
| G2 | `adapter.start()` either returns a fully-ready handle or throws; no partial activation. | Cordis Law 6 |
| G3 | `handle.dispose()` releases every engine-owned resource (root fiber, sessions, subscriptions, processes, PTYs, timers) in LIFO order, aborts any in-flight turn first, and resolves only after quiescence. Idempotent. | FR-010, FR-011, SC-003, SC-007 |
| G4 | At most one adapter is `ACTIVE` per profile; a second `start()` throws `engine-collision`. | FR-009 |
| G5 | `start()` refuses (`fidelity-rejected`) if the adapter's `fidelity` does not assert HMR + sandbox + approval parity. | FR-012, SC-008 |
| G6 | `handle.sessions` is the **only** session path the surface uses; the surface does not import `bootAcrylHarnessProfile`, `startDirectHost`, or `createAcrylSessionBridge`. | FR-002, FR-003, SC-001 |
| G7 | `handle.ctx.runtime.engine` equals `adapter.name`; a surface re-renders engine identity from this, not from the launch flag. | FR-001 |
| G8 | The `dsh` adapter's observable behavior with default options equals today's `startDirectHost` path exactly. | SC-004 |

## `AcrylSessionClient` (reused, from `acryl-control/src/contracts/session.ts`)

Already defined: `snapshot(sessionId)`, `subscribe(sessionId, listener, onError)`,
`submitPrompt({ sessionId, text, clientCommandId })`, `cancel({ sessionId })`,
with `AcrylSessionSnapshot` (`transcript`, `tools`, `agentStatus`, `attachment`,
`generationId`) and the `parseAcrylSessionSnapshot` boundary validator.

Phase A promotes this to the surface-facing contract: `AcrylEngineHandle.sessions`
returns an `AcrylSessionClient`. Phase A confirms every field is engine-neutral
(no DSH-only leakage); if not, the type is tightened as part of M2-slice-α.

## Selection composition

| Input | Effect |
| --- | --- |
| `acryl-engine` Loader row `{ engine }` (default `'dsh'`) | mounts `resolveAcrylEngineAdapter(engine)` |
| `--engine <name>` launch flag | patches the composed `acryl-engine` entry's `engine` before `boot()`, this launch only; row file unchanged |
| `/reload` after editing the row | HMR transactional apply: old adapter fiber disposed (G3), new adapter activated (G2); failure → rollback to prior composition |

## Events

`engine.swap` — dispatch `emit` (sync, no veto). Payload
`{ from: AcrylEngineName, to: AcrylEngineName, operationId: string }`. Observation
only; surfaces re-render `ctx.runtime`. No waterfall, no interception.
