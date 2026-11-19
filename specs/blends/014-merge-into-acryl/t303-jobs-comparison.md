# T303: aimbrace `tasks` against Harness `jobs`

Read from the pinned Harness: `docs/subsystems/jobs.md`, `packages/jobs/{jobs,jobs-local,tool-jobs}`.

## What each one is

| | Harness `jobs` | aimbrace `tasks` |
|---|---|---|
| Contract | `ctx.jobs`, an abstract `JobRegistry` seam: `start`, `list`, `get`, `read`, `readAt`, `kill`, `wait`, `events`, `attachController` | `ctx.tasks`: `start`, `get`, `list`, `cancel`, plus progress/complete/fail on the handle |
| Ownership | owner session; one agent never sees another's jobs; per-owner admission limit (10) | none (one app, one owner) |
| Lifecycle | `running`, `stopping`, `completed`, `killed`, `failed` | `running`, `completed`, `failed`, `cancelled`, `interrupted` |
| Output | byte ring (live and settled retention), pull sources | `progress` and `detail` values in the record |
| Storage | in memory, **by design**: "records die with the harness process" | append-only change log behind `TaskStore` (jsonl, sqlite), survives restart |
| After a restart | nothing | `interrupted`, never re-run |
| Extras | model tools (`tool-jobs`), completion notices delivered in-session | manifest digest per task |

## Finding

They are not rivals. `jobs` is the live registry (ownership, output, notices, model tools). `tasks` is a durable record. The Harness
says it itself: for work that must survive a restart "a durable or cross-process backend must implement the same contract
differently". That sentence is the whole answer.

## Decision

1. aimbrace `tasks` is **not** ported as a second concept next to `jobs`. A parallel registry is exactly what the ACRYL rules forbid.
2. What aimbrace adds is **durability**. If ACRYL wants it, the place is a second provider of the `JobRegistry` seam (a durable
   `jobs-*` package) built on a `TaskStore`-like append-only log, with the two rules that were proven here: restart marks a running
   record `interrupted` and never re-runs it, and every record carries the digest of the manifest that was live.
3. That provider is **deferred**, not scheduled: nothing in ACRYL asks for cross-restart jobs today, and writing it before a consumer
   exists is the speculative work this project avoids. Trigger: a real feature (WebBoxes.ai long runs, or an agent run that must
   survive a Desktop restart) names the need.
4. The `TaskStore` (jsonl, sqlite) code is kept in aimbrace as the reference for that provider.

## Side finding that changes T302

The Harness already has a process sandbox (`packages/sandbox`): Linux bwrap then Landlock, macOS Seatbelt, Windows restricted token,
`ctx.sandbox.confine(argv, policy)`. Its vocabulary is file *writes* only (`read-only`, `workspace-write`); reads stay open, and
network and process visibility are explicitly outside it. aimbrace's sandbox is the opposite shape: Node's permission model denies
reads outside an allow-list, child processes, workers and addons, but not writes through allowed paths or the network. They
**compose**: the `acryl-sandbox` tool runner should be the Node permission child (read allow-list, no spawn) and, when `ctx.sandbox`
is present, wrap that child's argv with `confine(argv, read-only)` for write and OS-level enforcement. Reported enforcement
(`full`/`partial`) must be surfaced, not hidden. This is recorded in T302.
