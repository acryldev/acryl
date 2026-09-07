# Data Model: Interchangeable Harness Engine (M9)

Entities are Cordis/runtime concepts, not database tables. "Durable" means it
survives a process restart via the ACRYL-owned record; everything else is
process-scoped.

## Engine

The owner of the agent loop, durable sessions, tools, models, and approvals for
one profile episode.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | `'dsh' \| 'pi'` | Stable identifier. Extensible later; enum-closed in M9. |
| `marker` | `ctx.runtime` service | `{ engine: name }`, registered by the active adapter at root scope. |
| lifecycle | Cordis Fiber | `PENDING → LOADING → ACTIVE → FAILED → UNLOADING → DISPOSED`. Exactly one `ACTIVE` per profile (FR-009). |

Invariants:

- Exactly one engine `ACTIVE` per profile episode.
- Two engines requested at once (combo) is unrepresentable in M9 (single enum row).

## Engine adapter

ACRYL-owned mapping between one concrete engine and the `AcrylEngine` contract.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | engine name | Registry key. |
| `start(options)` | `→ Promise<AcrylEngineHandle>` | Boots the engine's Cordis root and returns a live handle. |
| `fidelityContract` | doc + typed capability set | What it can/cannot faithfully represent (FR-015). Must assert HMR + sandbox + approval parity or activation is refused (FR-012). |

State transitions: `registered → resolving → starting → started → disposing →
disposed`. `starting → failed` on boot/auth/version error → loud failure, no
partial activation (Cordis Law 6).

## AcrylEngineHandle

Live handle returned by `adapter.start()`. Owned by the adapter's effect tree.

| Field | Type | Notes |
| --- | --- | --- |
| `ctx` | `Context` | The engine's Cordis root. |
| `runtime` | `'dsh' \| 'pi'` | Mirrors the marker. |
| `sessions` | `AcrylSessionClient` | Engine-neutral session client (submit/cancel/snapshot/subscribe). |
| `readiness` | `'ready' \| 'unavailable'` | Engine-neutral, not a DSH-key probe (replaces `host/direct.ts` logic). |
| `dispose()` | `→ Promise<void>` | Ordered, idempotent, quiescent (plan §3). |

## Engine selection (`acryl-engine` Loader row)

Durable per-profile composition input.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| row `id` | `'acryl-engine'` | - | Stable. |
| `engine` | `enum('dsh','pi')` | `'dsh'` | Sync StandardSchema; config replaced not merged on `/reload`. |

Launch override: `--engine <name>` patches the composed entry's `engine` value
before `boot()` for that launch only; never rewrites the row file (FR-004).
Unknown `<name>` → throw before `boot()` (`AcrylExitClass = 'usage'`, FR-005).

## Canonical session record

Durable, engine-independent. The source of truth for cross-engine resume.

| Field | Type | Notes |
| --- | --- | --- |
| `sessionId` | string | ACRYL-owned, stable across engine swaps (distinct from any `ProviderSessionRef`). |
| messages | `DurableSessionMessage[]` | Existing `acryl-harness-runtime` port. Phase A confirms no DSH-only fields. |
| authoring engine (per message) | `'dsh' \| 'pi'` | Recorded so a resuming engine can surface a documented fidelity limitation (FR-007). |

Resume: new engine reads prior `DurableSessionMessage`s for `sessionId`, renders
them as history, appends new turns to the same stream.

## Worker identity

| Identity | Scope | Constant across engine swap? |
| --- | --- | --- |
| `AcrWorkerId` (canonical logical worker) | ACRYL room | Yes (FR-008) |
| engine root `ctx` / process | one episode | No - disposed and recreated on swap |
| `ProviderSessionRef` | engine-private | No - each engine has its own |
| `sessionId` | ACRYL-owned | Yes |

## Engine operation (`ControlOperation`)

Reuses `acryl-control/contracts/operations.ts`.

| Field | Value |
| --- | --- |
| `kind` | `'engine.select'` (launch) \| `'engine.swap'` (`/reload`) |
| `restartClass` | `'HOT'` |
| `state` | `CREATED → VALIDATING → RUNNING → SETTLING → SUCCEEDED` / `FAILED` / `RECOVERABLE` (rollback) |

`engine.swap` also emits a live `engine.swap` event `{ from, to, operationId }`
(`emit` dispatch, no veto) for surface re-render.
