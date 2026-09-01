# Ideas to Take for ACRYL — consolidated register

> Purpose: capture the verified, best ideas from the coding-agent codebases studied
> and the Cordis reference repo, and map each one onto ACRYL (a Cordis/DSH product).
> This is the **knowledge extraction** artifact behind `specs/026-acryl-rework/`.
>
> Method: each source codebase was read directly (not only the pre-existing analysis
> docs). The analysis docs were treated as hypotheses and verified against source.
> Corrections are recorded inline. Every idea cites a file path or doc path as evidence.
>
> Date: 2026-09-01. This is a living register; add ideas as they land.

---

## Cross-cutting synthesis (the five that matter most)

Across all five codebases, five ideas recur and are load-bearing. If ACRYL adopts only
these, it fixes the biggest problems already identified in the ACRYL critique.

1. **One agent runtime, many surfaces; surfaces are thin consumers, never state owners.**
   pi.dev proves the loop is a transport-neutral event stream and the TUI is just one
   consumer. CodeWhale enforces "exactly one turn loop" with a single runtime behind
   protocol. DSH puts the agent loop behind a stable `Agent` interface. **ACRYL's
   `acryl-desktop` must stop owning agent state.**

2. **Capability = interface + provider + consumer, composed by configuration, never a
   parallel framework.** DSH calls this the *capability seam*. If ACRYL names a new
   capability, it must define all three roles over Cordis — and must consume the native
   seam, not re-declare it.

3. **The session is append-only; projections and history derive from it.** DSH, pi.dev,
   and OpenClaude all converge on an event log with derived (not mutated) messages.
   ACRYL must not build a second session/persistence store.

4. **Authorization is an ordered, monotonic, fail-closed pipeline that lives OUTSIDE the
   capability system.** CodeWhale's single strongest lesson. A plugin may register a
   *capability* but must never grant authority; a remembered grant must never erase a
   later safety layer.

5. **A small, swappable loop + behavior-by-listening.** DSH keeps the loop "boring" and
   adds guards/context/subagents/approval via events. OpenClaude proves one
   recursion-friendly loop with subagents as an ordinary tool. Never "patch the
   privileged core" to change behavior.

---

## pi.dev

Verified architecture (monorepo root `/Users/musichen/src/codingagents/pi`):

- Surface-independent agent runtime `@earendil-works/pi-agent-core` — `packages/agent`
  depends only on `pi-ai`, `pi-telemetry`, `diff`, `ignore`, `typebox`, `yaml`; **no**
  TUI/shell/pty/node-pty. The TUI is a mode, not the agent.
- The loop is a pure typed event stream. `packages/agent/src/agent-loop.ts`:
  `agentLoop()` returns `EventStream<AgentEvent, AgentMessage[]>`, converts to `Message[]`
  only at the LLM boundary (`convertToLlm`), with `beforeToolCall`/`afterToolCall`/
  `prepareNextTurn` hooks.
- Provider abstraction is a **registry of swappable providers**, not one hardwired client.
  `packages/ai/src/providers/` has ~30 modules (anthropic, openai, deepseek, google,
  openrouter, bedrock, azure, zai, moonshot, copilot, opencode, …). `Models` exposes
  `getProvider/getProviders/setProvider/refreshModels`.
- Transport-neutral wire protocol: `@earendil-works/pi-protocol` ("transport-neutral CBOR
  protocol"), with `@earendil-works/pi-client` over framed CBOR bytes. The server exposes
  `PiServerService { listSessions; listModels; createSession; openSession }`
  (`packages/server/src/types.ts:55-59`) and transports are plugins
  (`packages/server/src/transports/unix/preset.ts`).
- Self-extension is a **typed extension API**, not a runtime container:
  `packages/coding-agent/src/core/extensions/types.ts` — `ExtensionAPI` with
  `registerTool` (`:1308`), `registerCommand` (`:1317`), keyboard shortcuts, flags, event
  subscription (`:1247`), and mode-aware `ExtensionMode = "tui" | "rpc" | "json" | "print"`.
- Session persistence is decoupled via a separate `SessionBackend`/sqlite workspace
  (`packages/session-backends/sqlite-node`), so the core has no native sqlite dependency.

Ideas worth taking, ranked:

- **HIGH — Agent as a transport-neutral runtime behind a typed session/protocol boundary.**
  Replace any ACRYL "control surface middleman" with a clean protocol/service contract so
  TUI/desktop/web are thin adapters over one event source. Evidence: `agent-loop.ts`,
  `PiServerService`, `pi-protocol`. ACRYL map: your `acryl-control` protocol + `ctx.agents`
  event stream should be the single source of truth, and surfaces subscribe.
- **HIGH — Swappable provider registry with pluggable auth.** Evidence:
  `packages/ai/src/providers/` + `packages/ai/src/auth/`. ACRYL map: consume DSH's
  `ctx.llm` adapapters + `llm-pi-ai` instead of building a provider layer.
- **MED — Typed, mode-aware extension API (`registerTool`/`registerCommand`) as a
  functional surface.** Evidence: `extensions/types.ts`. ACRYL map: ACRYL plugins are
  Cordis plugins; the *functional* extension API (per-mode) is a good complement to "all
  plugins," but don't replace Cordis with it.
- **MED — One session-boundary message normalization.** pi.dev converts domain → wire DTOs
  at the server boundary only. ACRYL map: keep DSH `SessionEventMap` canonical; normalize
  only at surface adapters.

Corrections to the pre-existing analysis doc: it is directionally accurate. Two retitles:
PTY/terminal belongs to the *surface* layer (`packages/coding-agent`), not the core agent;
the provider set is far larger than the illustrated table. "No universal `ctx` / no Cordis
equivalent" is accurate — pi.dev uses direct imports + event subscription, not DI.

**Most important lesson:** make the agent a transport-neutral runtime behind a typed
session/protocol boundary, and let the TUI be just one consumer of its event stream.

---

## CodeWhale

Verified architecture (monorepo `/Users/musichen/src/codingagents/codewhale`):

- Multi-crate Rust workspace (22 crates), but the live runtime is in `crates/tui`:
  `Engine::run_turn` in `crates/tui/src/core/engine/turn_loop.rs`; AGENTS.md warns there is
  **exactly one turn loop** (guarded by `crates/core/tests/single_turn_loop.rs`).
- `crates/core` is the provider-independent agent *domain* (request, session, role,
  journal, fragments, tool_parser, ids) — it runs no turns.
- `crates/agent` is the model/provider **registry** (`ModelRegistry`, `ModelInfo`,
  `ModelResolution`, typed `ModelResolutionError`).
- `crates/config/src/provider_kind.rs` is ~50-variant `ProviderKind` with serde aliases and
  a `secret_store_slot()`.
- `crates/execpolicy` is a layered, typed rule engine: `Ruleset` layers
  (BuiltinDefault < Agent < User), `ToolAskRule` (tool/command/path/workspace/action),
  **deny always wins**, shell word-splitting (`shell_expand`, `deny_scan_targets`) so a
  deny rule survives every shell spelling, plus a chaining guard so `allow "git log"` cannot
  sweep `git log ; rm -rf /`.
- Durable state = SQLite via `rusqlite` (`StateStore`, WAL) + append-only JSONL session
  index (`crates/state`).
- Orchestration nouns are real and separated: **Lane** = a running workflow instance (one
  issue/goal) with a `RuntimeBackend` (`tmux | inline | vm | ci`), git-worktree
  provisioning, NDJSON logs, and typed private `LaneExitReceipt`. `crates/workflow-js` is an
  embedded **QuickJS** VM that is deliberately single-threaded and bridges to the
  multi-threaded engine over channels. `docs/FLEET.md`: **Pod** = product/roster (WHO),
  **Fleet** = persisted name.
- Safety is a documented **monotonic** pipeline: `docs/AUTHORIZATION_ORDER.md` fixes the
  order (config/posture → mode/admission → hooks (deny>ask>allow) → registered-tool
  baseline → typed `permissions.toml` → auto-review + built-in floor → repo law → human
  approval → execution sandbox). Each later layer can only *tighten*, never convert a
  block/prompt into an unreviewed run.
- Surfaces all drive one runtime: TUI, `exec` (stream-json), `app-server` (HTTP/SSE +
  JSON-RPC), ACP, web — converging via `crates/protocol` + `crates/command-contract`.

Ideas worth taking, ranked:

- **HIGH — Monotonic, fail-closed authorization pipeline owned OUTSIDE the capability
  system.** A plugin/capability existing must never grant authority, and a remembered
  grant must never defeat a later safety layer. Evidence: `docs/AUTHORIZATION_ORDER.md`,
  `crates/execpolicy/src/lib.rs`, regression tests. ACRYL map: implement authorization as
  an ordered chain of Cordis services (posture → admission → registered baseline → repo law
  → human) with an invariant that each stage only tightens.
- **HIGH — Typed, layered permission rules with deny-wins and "remembered grant ≠
  persistent authority."** Evidence: `ToolAskRule`, `RulesetLayer`,
  `remember_session_approval`, chaining guard. ACRYL map: model shell/git/file permission
  as typed rules with a hard-deny floor; a session "remembered" approve must be exact and
  still fail closed on chained/segmented invocations.
- **HIGH — KV-cache stable pinned prefix with attributable misses.** Systems prompt + tool
  catalog frozen, history only grows, volatile facts appended as user-role `<context_update>`
  messages, every miss names a reason. Evidence: `docs/CACHE.md`
  (`PrefixStabilityManager`, `/cache stats`). ACRYL map: pin the ACRYL header per session;
  append workspace updates as user messages; require every context contributor to declare
  KV-cache effect. (The prior analysis doc omits this entirely.)
- **HIGH — Identity/Capability strictly separated from Authority.** The roster (who) is
  resolved independently of the authority envelope (what it may do); no authority value may
  reselect a member or change its route. Evidence: `docs/FLEET.md` ("Pod does not define
  trust/permission… load-bearing"), `docs/SUBAGENTS.md`. ACRYL map: bind capability to a
  service resolved *after* identity; refuse capability fields that pretend to grant
  execution authority.
- **MED — Durable, verifiable receipts / artifact refs.** Child and lane work ends in typed
  receipts (exit code, artifact refs) rather than trusting child self-report. Evidence:
  `crates/lane/src/runtime.rs`, `docs/RECEIPTS.md`. ACRYL map: every delegated run and tool
  call produces a bounded, replayable receipt with artifact refs.
- **MED — LSP diagnostics wired into the post-edit path.** Evidence:
  `crates/tui/src/core/engine/lsp_hooks.rs`. ACRYL map: run type/lint checks after a file
  mutation and surface as a tool result.
- **MED — Workflow as a deterministic orchestrating layer over capabilities, with a
  single-threaded VM boundary.** Evidence: `crates/workflow-js` + `rquickjs` "not parallel"
  comment. ACRYL map: author workflows in TS but expose only a capability-invocation API;
  keep the agent runtime separate.

Corrections to the pre-existing analysis doc: **no claim is outright false.** Every
load-bearing claim checks out. One nuance: "one runtime, many surfaces" is a *target*, not
yet fully true in source — the HTTP/SSE runtime API is "served by the `crates/tui` runtime
today," and AGENTS.md warns smaller crates are still being extracted. The provider diagram
is accurate but reorders/omits Anthropic, Sglang/Vllm, HuggingFace, and many Chinese cloud
vendors.

**Most important lesson:** authorization must be an ordered, monotonic, fail-closed
pipeline that lives *outside* the plugin/capability system, and a remembered grant must
never erase a later safety layer.

---

## OpenClaude

Verified architecture (monorepo `/Users/musichen/src/codingagents/openclaude`):

- Central orchestration spine = `src/query.ts` + `src/QueryEngine.ts`. `query.ts` is the
  stateful query loop (`turnCount`, tool recursion, compaction transitions, streaming tool
  executor over `canUseTool`). Transitions for `context_overflow_compact_retry`,
  `provider_max_tokens_retry`, `max_output_tokens_escalate` (`query.ts:2262, 2308, 2357`).
- Tool system: `src/Tool.ts` defines `Tool`, `ToolUseContext`, `ToolPermissionContext`;
  `src/tools/` holds ~60 tools (Bash, File*, Grep/Glob, LSP, RepoMap, WebSearch, Task*,
  AgentTool, SkillTool, MCP, ExitPlanMode, TodoWrite…), run by a `StreamingToolExecutor`.
- Permission/approval = a first-class, switchable state machine. `permissions/PermissionMode.ts`
  defines `default | plan | acceptEdits | bypassPermissions | fullAccess | dontAsk`
  (plus feature-flagged `auto`, internal `bubble`). `permissions/permissions.ts` is the gate:
  `PermissionRule` parser, `bashClassifier`, `yoloClassifier`,
  `bypassPermissionsKillswitch`, `denialTracking`.
- Provider/model layer = declarative multi-provider gateway purely via env
  (`ANTHROPIC_*`, `OPENAI_*`, `CLAUDE_CODE_USE_OPENAI`, `OPENROUTER`, `ATLAS_CLOUD`, …),
  covering anthropic/openai/xai/gemini/codex/custom/OpenRouter/Kimi/Z.AI/GLM/Ollama/Bedrock/
  NVIDIA-NIM. `utils/model/providers.ts`, `modelOptions.ts`, `openaiModelDiscovery.ts`.
- Agent-as-tool / subagents: `src/tools/AgentTool/` — `runAgent.ts`, `resumeAgent.ts`,
  `builtInAgents.ts`, `loadAgentsDir.ts` (markdown agent files), `forkSubagent.ts`,
  `agentMemory.ts`. Subagents recurse into the same `query()` loop with a distinct
  `agentId`/session and its own `canUseTool`.
- Hooks: `src/utils/hooks/` (`preToolUse`, `PostToolUse`, `stop`), `query/stopHooks.ts`.
- MCP: `src/services/mcp/` (`MCPConnectionManager`, `client`, `auth` OAuth port,
  `officialRegistry`, `channelPermissions`/`channelAllowlist`, `InProcessTransport`).
- Context/memory building is in `memdir/`, `services/compact/` (autoCompact, microCompact,
  reactiveCompact), and `context/repoMap/` (PageRank ranking with token budget) — **not**
  `src/context/`, which holds React overlay/modal/mailbox UI.
- Heavy `feature('…')` bundler flags gate optional subsystems
  (`REACTIVE_COMPACT`, `TOKEN_BUDGET`, `TRANSCRIPT_CLASSIFIER`, `CONTEXT_COLLAPSE`,
  `KAIROS`) enabling zero-cost dead-code elimination rather than a DI container.

Ideas worth taking, ranked:

- **HIGH — Permission mode as an explicit, switchable, visibly-styled state machine + rule
  engine.** Evidence: `PermissionMode.ts` (mode enum, titles, symbols/colors),
  `permissions.ts` (rules, classifiers, deny-track, killswitch). This is where an agent feels
  pleasant vs annoying. ACRYL map: a `PermissionMode` + `PermissionRule` Cordis module over
  DSH's approval gate, with the mode visible in every surface.
- **HIGH — Agent-as-tool: subagents as an ordinary tool inside one query loop.** Evidence:
  `tools/AgentTool/runAgent.ts`, `builtInAgents.ts`, `resumeAgent.ts`. Keeps the primitive
  small; recursion reuses the same loop/context/permission machinery; child has its own
  `agentId`/session/`canUseTool` and is resumable. ACRYL map: the `Agent({type, prompt})`
  tool; tie each child to a Cordis scoped context and `dispose()` (ACRYL can exceed
  OpenClaude here).
- **HIGH — Declarative multi-provider gateway with route/context-window catalog.** Evidence:
  `utils/model/providers.ts`, `modelOptions.ts` (+ `modelOptions.gateways.test.ts`),
  `openaiModelDiscovery.ts`, `modelAllowlist.ts`. Any model/provider via env; per-endpoint
  context windows and model limits. ACRYL map: the provider-descriptor idea — but consume
  DSH's `ctx.llm` seam.
- **MED — Repo-map via PageRank with a token budget.** Evidence:
  `context/repoMap/pagerank.ts` (`graphology`, alpha 0.85, focus-files boost),
  `renderer.ts` (`maxTokens`). ACRYL map: an optional context provider plugin.
- **MED — Failure-loop + step-limit hardening inside the loop.** Evidence:
  `query/toolFailureLoopGuard.ts`, `query/agentStepLimit.ts`, retry/escalate transitions.
  ACRYL map: continuation/step budget in the context engine.
- **MED — Zero-cost feature-flag gating (`feature()`).** ACRYL map: rollout/lab toggles.
- **MED — Prompt-cache instrumentation (provider-route-aware break classification).**
  Evidence: `services/api/promptCacheBreakDetection.ts`. ACRYL map: cost/token tracker.

Corrections to the pre-existing analysis doc (these matter — the doc has errors):

- **"Removed guardrails and limits on models" is overstated / FALSE.** The guardrail
  machinery is still present: `services/policyLimits`
  (`isPolicyAllowed('allow_remote_sessions')`), `utils/model/modelAllowlist.ts`
  (`isModelAllowed`, enforced in `runAgent.ts:382`), `services/claudeAiLimits.js` quota,
  `USER_TYPE === 'ant'` internal-only commands, `bypassPermissionsKillswitch.ts`. What
  changed is the community *added* `bypassPermissions`/`fullAccess`/`dontAsk` modes and more
  providers — **bypass is user-driven, not code-deleted.**
- **A rich persisted session transcript is NOT present.** `services/sessionTranscript/`
  is an explicit stub behind `feature('KAIROS')`; real persistence is `memdir` + `history.ts`
  + compact services.
- **The "Context Builder" location is wrong** — `src/context/` is React UI
  (overlay/modal/mailbox/repoMap), not the context builder; prompt/memory building is in
  `memdir/`, `services/compact/`, `utils/context.js`.

**Most important lesson:** build the agent as ONE integrated, stateful query loop — tools as
pluggable capabilities, subagents as an ordinary tool that recurses through the same loop,
permission mode as an explicit switchable state + rule engine with failure/step-limit
guards — rather than a decoupled multi-agent orchestrator. That combination is the design
gap vs ACRYL's current multi-agent/Cordis orchestration.

---

## DeepSeek Harness

(The substrate ACRYL builds on. Key facts, verified against
`/Users/musichen/src/codingagents/deepseek-harness`.)

Verified architecture highlights (`packages/`, all scoped `@deepseek-ai/dsh-*`, 248
packages, vendored Cordis in `vendor/`):

- **Capability seam = Service Definition + Provider + Consumer.** One role alone is not a
  seam. Evidence: `docs/architecture.md` ("Capability seams"),
  `packages/llm/llm/src/index.ts` (`ctx.llm.registerAdapter`,
  `registerConfigurableProviders`), `packages/fs`, `packages/subprocess`, `packages/shell`,
  `packages/subagent`. Swapping a config row moves whole families of behavior.
- **Stable `Agent` interface + swappable default driver.** `packages/core/agent` declares
  the `Agent` handle, `ctx.agents` registry, and `agent/*` events with **zero loop
  dependency**; `packages/core/agent-loop` registers its factory into `ctx.agents`
  ("the harness's only concrete loop"; everything beyond 'call the model, run the tools,
  repeat' belongs to plugins listening on the event taxonomy").
- **Everything is a plugin / no privileged core.** Plugins contribute services, typed
  events, and reversible effects to a shared context; unload unwinds its registrations.
  "There is no privileged core to patch."
- **Session = append-only event log + a projection seam, plus a separate durable data
  plane.** `packages/core/session` is the logical contract (`SessionEventMap`, append-only
  events, derived frozen messages, `SESSION_FORMAT_VERSION=0`);
  `packages/session` adds `session-persistence*`, `session-projection`
  (`ctx.sessionProjections` folds committed events into typed current values via
  `stateOf()`/`snapshot()`), `session-title*`, `session-stats`.
- **Behavior-by-listening.** `packages/guard` (repeat-tool-reminder, timeout-policy),
  `packages/extensions` (self-modification via `ctx.dynamicCordisRunner` +
  `ctx.cordisInspect`), `packages/interaction` (`ctx.approval`, `permission-presets`),
  `packages/compaction`, `packages/skill`, `packages/preset`, `packages/bundle`.

Ideas worth taking, ranked:

- **HIGH — The seam invariant (interface + provider + consumer).** If ACRYL adds a
  capability, define all three roles; never let a model-facing tool know a concrete provider.
  This is the single most important DSH discipline.
- **HIGH — Loop-as-interface + event taxonomy.** Add behavior by listening on `agent/*` and
  `tools/*` events, not by editing the loop. The loop stays swappable.
- **HIGH — Session log with projections.** UI/history/persistence all derive from one
  append-only log; projections cache incremental fold to avoid replay. This is exactly the
  piece ACRYL currently re-implements by hand in 3 places.
- **MED — Guard hygiene, interaction/approval capability family, profile+bundle+patch
  composition.** Use these native seams rather than building approval/profile/patch by hand.
- **MED — Subagent provider seam.** `ctx.subagents` already ships claude-code, codex, acp,
  and dsh-sdk backends. Reuse it; do not build a parallel delegation layer.
- **LOW (defer) — Self-modification.** `packages/extensions` ("creator mode") is a later,
  optional capability; only meaningful once you already have a live plugin-graph runtime.

Corrections to the pre-existing analysis doc: **no substantive claim is contradicted.** It
is a faithful (if loose) AI summary. Nits only: `guard` is a package **group** holding
`repeat-tool-reminder` + `timeout-policy`; `mcp` IS in the current tree (the doc's "absent
from a slightly older table" is timing drift); "extensions is the architectural basis for
Creator Mode" is an *interpretation* — Creator is a preset composition, not a package.

**Most important lesson:** separate contracts from capabilities, treat every capability as a
three-role seam composed by configuration, keep the agent loop as an interface (not an
editor target), and make the session an append-only event log with a projection seam.

---

## Cordis (reference metaframework)

Verified from `/Users/musichen/src/codingagents/cordis` (`packages/core`, v4.0.0-rc.9):

- **Context** = DI container + event bus + service registry + lifecycle manager + scope.
  `Context` exposes `events`, `logger`, `reflect`, `registry`, `root`, `isolate`,
  `intercept`. `ctx.effect()`/`ctx.on()` register reversible effects; `Context.isolate`
  creates scoped child contexts.
- **Events** dispatch in 5 modes: `emit | parallel | serial | bail | waterfall`
  (`packages/core/src/events.ts`). Waterfall has explicit `next()` semantics.
- **Fiber** = the plugin lifecycle/load-unload unit; scopes isolation and effect ownership.
- **Registry / Service** = `inject`-style dependency injection by service key.
- **Loader** = config rows → plugin tree (`packages/loader/src/`); this is *composition as
  data*, the mechanism for bundles/presets/profiles + `cordis.patch.yml` + HMR.

Ideas worth taking, ranked:

- **HIGH — Everything is a plugin; composition is data.** ACRYL modes/features should be
  Cordis presets/bundles, never `if (mode === 'creator')` feature switches. Change behavior
  by composing a different plugin tree.
- **HIGH — Reversible effects own every resource.** Every process, socket, watcher, timer,
  PTY, subscription, route, plugin registration has exactly one owning `ctx.effect()` and an
  ordered disposer. ACRYL's `acryl-control`/canvas must stop leaking raw resource ownership.
- **HIGH — Service/scope in, concrete provider out.** Consumers depend on stable service
  keys (`ctx.fs`, `ctx.tools`, `ctx.llm`), never concrete providers or YAML row order.
- **MED — Typed events with explicit dispatch mode + waterfall `next()`.** ACRYL's event
  declarations should pick a dispatch mode deliberately and document waterfall semantics
  for replay-critical facts.
- **MED — Hot activation via Loader/HMR.** Cordis Loader reconciles a plugin tree; ACRYL can
  inspect and re-compose a live profile (this is what DSH `extensions` and ACRYL's own
  "Generated capability / hot activation" specs should build on).

---

## ACRYL adoption shortlist (merged, ranked)

Highest value, do first:

1. **Delete parallel-framework files in ACRYL-owned packages; consume the native seam.**
   (session projection, agent control, architecture inspector, desktop terminal, web server
   duplication.) Evidence: the ACRYL code map + verified `dsh-*` packages.
2. **Authorization as monotonic fail-closed pipeline outside the plugin system.**
   (CodeWhale) — the safety foundation for a plugin-native agent.
3. **Session append-only + projection seam** (DSH/pi/OpenClaude) — the canonical state model;
   also the route to ACRYL's "room/checkpoint" differentiators without a second store.
4. **One agent runtime, surfaces as thin consumers** (pi/CodeWhale/DSH) — finish the
   `acryl-desktop` shrink so agent state lives in the runtime, never the surface.
5. **Agent-as-tool + permission-as-switchable-state machine** (OpenClaude) — the UX and
   recursion model that makes an agent pleasant and its subagents uniform.

Implementation of these is planned and task-decomposed in
`specs/026-acryl-rework/` (spec.md / research.md / plan.md / tasks.md).
