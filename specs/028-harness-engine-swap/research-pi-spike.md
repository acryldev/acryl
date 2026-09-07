# Research spike: consuming `pi` as an in-process ACRYL engine

**Feature**: `specs/028-harness-engine-swap` (Phase B1 gate)
**Date**: 2026-09-07
**Source inspected**: local clone at
`/Users/musichen/_projects/p11_acr_agentcontextrelay/acryldev/pi`,
HEAD `9767ba275` = `v0.85.1-4-g9767ba275` (tag `v0.85.1`), MIT
(Copyright 2025 Mario Zechner). Read-only sibling clone; nothing copied.

This closes the `NEEDS PIN`, entry-point-map, and Chord-shim open items in
[research.md](./research.md).

---

## 1. Package layout and what the engine needs

`pi` is an npm monorepo (`pi-monorepo`, workspaces `packages/*`), lockstep
versioned - every package is `0.85.1`. Relevant packages:

| Package | npm name | Role for the ACRYL `pi` engine |
| --- | --- | --- |
| `packages/agent` | `@earendil-works/pi-agent-core` | The raw agent loop: `Agent` class, `runAgentLoop`, event stream. Depends only on `@earendil-works/pi-ai` (+ telemetry). |
| `packages/ai` | `@earendil-works/pi-ai` | Unified LLM API: providers, model catalog, OAuth/credential store, tool-call streaming, cost/token tracking. Provider impls are tree-shakeable subpath exports (`./providers/*`). |
| `packages/coding-agent` | `@earendil-works/pi-coding-agent` | The full harness. Its **SDK export** (`createAgentSession*`, `AgentSession`, `SessionManager`, `ModelRuntime`, coding tools, compaction) composes agent-core + ai + sessions coherently. `bin: pi`. |
| `packages/chord` | `@earendil-works/chord` | pi's Cordis-parallel composition runtime. Transitive dep of the three above. **Not adopted** - see §3. |
| `packages/tui` | `@earendil-works/pi-tui` | Rendering only. ACRYL already pins `0.84.2`; bump to `0.85.x` is a separate concern (M1), not this engine. |
| `session-backends/sqlite-node` | `@earendil-works/pi-session-backend-sqlite-node` | Optional SQLite session store. ACRYL will project into its own record instead. |
| `protocol` / `client` / `server` | - | RPC / WebUI. Not used (in-process engine). |

### Decision: build the `pi` engine on the `pi-coding-agent` **SDK**, not raw `pi-agent-core`

`coding-agent/src/core/sdk.ts` exposes `createAgentSession`,
`createAgentSessionRuntime`, `createAgentSessionServices`,
`createAgentSessionFromServices` - a layered factory. It already wires:

- `Agent` (from `pi-agent-core`) + `streamSimple` (from `pi-ai/compat`)
- `ModelRuntime` / `ModelRegistry` / `resolveCliModel` (model + auth resolution)
- `SessionManager` + `SessionEntry` model (pi's JSONL-style session log,
  `parseSessionEntries` / `migrateSessionEntries` / `sessionEntryToContextMessages`)
- `createCodingTools` / `createReadOnlyTools` (bash, edit, read, write, grep,
  find, ls, powershell) with per-`cwd` factories
- `compact` / `shouldCompact` / `generateBranchSummary` (compaction, branching)
- an `EventBus` (`createEventBus`) and `AgentSessionEvent` stream

Rebuilding this on raw `pi-agent-core` would be re-implementing pi. The SDK is
the in-process embedding path pi itself documents ("SDK for embedding in your
own apps").

## 2. Entry-point map (ACRYL `AcrylEngineAdapter('pi')`)

| `AcrylEngine` contract point | pi SDK call |
| --- | --- |
| `adapter.start({ profile, resumeSessionId })` | `createAgentSessionRuntime({ cwd, model, sessionManager, tools, settings })` inside the adapter's owned Cordis effect tree |
| `handle.sessions.submitPrompt({ text })` | `agentSession.prompt(text, PromptOptions)` |
| `handle.sessions.cancel()` | abort the `PromptOptions.signal` `AbortController` the adapter owns |
| `handle.sessions.subscribe(listener)` | `agentSession` event listener (`AgentSessionEvent` / `AgentSessionEventListener`) mapped to `AcrylSessionSnapshot` |
| canonical `DurableSessionMessage` write | translate each `SessionEntry` / `AgentSessionEvent` into a `DurableSessionMessage` on ACRYL's port (the same port the `dsh` adapter writes) |
| cross-engine resume (read) | load prior `DurableSessionMessage`s for the `sessionId`, translate to pi `SessionEntry[]` via `SessionManager` + `sessionEntryToContextMessages`, seed the new session |
| model + auth | `ModelRuntime` + `pi-ai` OAuth / credential store; align with `specs/024-acryl-cli-login` |
| approvals (FR-012) | pi tool-call interception (`ToolCallEvent` / `BeforeAgentStartEvent` extension hooks, `ProjectTrustHandler`) bridged to Cordis `ctx.approval` |
| `ctx.runtime.engine = 'pi'` | adapter registers the marker service on its root |

`createAgentSessionServices` + `createAgentSessionFromServices` is the
decomposed seam if the adapter needs to substitute individual services (custom
session store, custom tool set, ACRYL-supplied model runtime).

## 3. Chord coupling: near zero on the chosen path

Grep of the clone (`grep -rl "@earendil-works/chord"`):

- `packages/coding-agent/src`: **20 files, every one under `src/experimental/`**
  (`experimental/server.ts`, `session-worker*.ts`, `client-runtime.ts`,
  `client-tui.ts`, `plugins/*`, `services/*`). This is the RPC / WebUI / plugin
  runtime - the "run pi as a server with a separate client" path.
- `packages/agent/src`: **3 files** - `harness/context.ts`,
  `harness/agent-harness.ts`, `harness/session/types.ts` - i.e. the
  `@earendil-works/pi-agent-core/harness/*` **subpath exports** only.
- `packages/coding-agent/src/core/sdk.ts` and `core/agent-session.ts`:
  **0 chord imports**.
- `packages/agent/src/agent.ts` and `agent-loop.ts`: import **only**
  `@earendil-works/pi-ai` + local files. **0 chord imports.**
- `pi-agent-core` README: "Transport-neutral facet-service primitives live in
  `@earendil-works/chord`. **The agent core does not export the service
  runtime.**"

### Decision

The lean engine path - `Agent` (pi-agent-core root export) + the
`pi-coding-agent` SDK factory + `SessionManager` + `ModelRuntime` +
`createCodingTools` - **never activates chord's facet host**. chord is present
in `node_modules` as a transitive dependency but ACRYL calls none of its
lifecycle / DI / event / replicated-state runtime. Constitution invariant "one
Cordis lifecycle system" and FR-013 hold with **no shims required**, provided
the adapter:

1. does **not** import `@earendil-works/pi-coding-agent/src/experimental/*`
   (the RPC/server/plugin path), and
2. does **not** import `@earendil-works/pi-agent-core/harness/*` subpaths
   (uses the root `Agent` export and the SDK instead).

Both are lint-enforceable (a forbidden-import rule in `acryl-harness-runtime`).

`@earendil-works/chord` stays a **reference to mine** for ideas (its
replicated-state / delta model is interesting for the future ACRYL room), never
a loaded runtime.

### Strategic note: Chord and Cordis are converging

Chord is under active development (commits within days of 2026-09-07) and is
pi.dev's take on the same composability model Cordis implements - plugins that
declare provides/requires, activate providers before consumers, dispose in
reverse dependency order, stable service facades across provider replacement.
The vocabularies map almost one-to-one (Chord *facet* ~ Cordis *plugin/fiber*,
Chord *service token* ~ Cordis *service key*, Chord *replicated state* ~ a
future ACRYL room projection).

This does **not** change the M9 decision (one Cordis lifecycle system; consume
pi's `Agent`/SDK, not its composition runtime). But it is worth a Wayfinder
ticket **after M9 ships**: if Chord stabilizes, an ACRYL engine could in
principle host pi's chord facets *under* a Cordis-owned boundary, or the two
runtimes could share a service-token bridge. Recorded as a future decision, not
M9 scope. Flag: `specs/000-wayfinding` candidate "Cordis <-> Chord
interop".

## 4. Version pin

- Pin `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`,
  `@earendil-works/pi-ai` to an **exact published version**, matching pi's own
  lockstep rule. Latest tag in the clone is **`v0.85.1`**; use the newest
  published `0.85.x` at implementation time.
- These are `npm`-published packages; add them to `acryl-harness-runtime`'s
  `package.json` with exact versions (repo rule: exact pins) via
  `corepack pnpm add -E`.
- Keep the pin **separate** from any `deepseek-harness/` submodule pin bump
  (repo rule).

## 5. Bundle-size impact (feeds `specs/025` size gate)

`@earendil-works/pi-ai` direct deps include `@anthropic-ai/sdk` (0.123.0),
`openai` (6.40.0), `@google/genai` (1.52.0), and
`@aws-sdk/client-bedrock-runtime` (3.1048.0 - the heavy one). `pi-coding-agent`
also pulls `photon-node`, `highlight.js`, `grok-mermaid`, `undici`.

### Decision (to confirm in Phase B1 with a real measurement)

Gate the `pi` engine behind an **optional dependency** of `acryl-harness-runtime`
(or a thin `acryl-engine-pi` package) so the default `acryl` CLI publish closure
(TUI + `dsh` engine) stays within the `specs/025-acryl-runtime-distribution`
size limits. `resolveAcrylEngineAdapter('pi')` throws a clear "pi engine not
installed - `npm i -g acryl-engine-pi`" style error when the optional dep is
absent. Measurement task in Phase B1 decides optional-dep vs separate-package.

## 6. Open items now closed / remaining

| Item | Status |
| --- | --- |
| `NEEDS PIN` | Closed: exact `0.85.x`, packages `pi-coding-agent` + `pi-agent-core` + `pi-ai`, MIT. |
| pi entry-point map | Closed: §2 (SDK `createAgentSessionRuntime` path). |
| Chord-shim surface area | Closed: **none needed** on the SDK path; enforce two forbidden-import rules (§3). |
| pi bundle-size impact | Partially open: strategy chosen (optional dep / separate package); real measurement is a Phase B1 task. |
| pi auth vs `024-acryl-cli-login` | Open: Phase B1 design task - reconcile `pi-ai` credential store with the ACRYL login seam. |
| `DurableSessionMessage` DSH-only fields? | Open: Phase A task (unchanged). |
| pi approval bridge to `ctx.approval` | Open: Phase B1 design task - map pi `ToolCallEvent` interception to Cordis approval. |
