# ACRYL ↔ DeepSeek Harness Gap Analysis

Status: living document, first pass
Scope: every ACRYL primitive the orientation spec (§26, §28) asks ACRYL to provide, mapped against the actual DeepSeek Harness (DSH) `0.1.1-rc.2` source and its Cordis seams.
Method: read the pinned upstream submodule (`deepseek-harness/` at `b150a551`), the DSH architecture + subsystem docs, and the `docs/capability-seams.md` service catalog. `ctx.*` names are the live Cordis service keys DSH actually registers.

> **Working-name update (2026-08-24):** This analysis uses the proposed
> `ctx.acrAgentControl` seam named in
> `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`. It is a working name, not an
> implemented service.

> **Headline finding (read this first).**
> The orientation spec repeatedly frames DSH as a substrate ACRYL must extend toward "agent-agnostic ADE". The source says DSH is already substantially there. Four of ACRYL's defining ambitions already exist as first-class DSH seams, not as future work:
>
> 1. **External coding agents as first-class providers** — `ctx.subagents` is a *named provider registry* with real `subagent-claude-code`, `subagent-codex`, `subagent-acp`, and `subagent-dsh-sdk` backends that spawn actual external processes through `ctx.subprocess`/`ctx.terminals`. ACRYL does not need to invent the provider seam; it needs to *compose* these and add room-level identity.
> 2. **Multi-agent room** — `ctx.agentTeams` (experimental, `packages/experimental/agent-team`) already has a durable roster, peer mailbox, shared task DAG, and continuable child lifecycle. ACRYL's "multi-agent room" largely exists, scoped to a Lead session.
> 3. **Self-extension / hot activation** — `ctx.dynamicCordisRunner` + `ctx.cordisInspect` (`packages/extensions/cordis-host-runner`) already define, version, approve, and hot-activate generated Cordis packages with Host + browser halves, without a core rebuild. ACRYL's "capability builder / hot install" is an *existing* DSH capability.
> 4. **Canonical durable event model** — `ctx.sessions` is an append-only typed `SessionEvent` log ("model-visible means logged", merge-extensible `SessionEventMap`, `deriveMessages()` projection, fork/resume). ACRYL's "canonical event ≠ model prompt, use projections" is DSH's core law already.
>
> **The real gap is not substrate.** It is the **ACRYL product layer and the agent-agnostic inversion**: (a) a persistent *room/project* identity that outlives and spans heterogeneous agents, (b) a *provider-neutral* contract so DSH-native is just one provider, (c) a *structured handoff/relay* artifact, and (d) *composed capability packages* (manifest + permissions + provenance + UI) rather than raw dynamic plugins. DSH's defaults are DSH-native-agent-centric; ACRYL's job is to invert emphasis, not add missing machinery.

---

## 0. Executive summary

| ACRYL primitive | DSH has it? | Reusable as-is | Neads extension | Missing seam is the real gap | New ACRYL work |
| --- | --- | --- | --- | --- | --- |
| Project / room identity | partial | `ctx.workspaceRegistry` (path-bound), `ctx.agentTeams` (session-bound) | yes | **room > workspace > agents** | new `ctx.acrRoom` |
| Canonical events | **yes** | `ctx.sessions` `SessionEvent` log | no | none | none (adopt) |
| Agent provider (DSH-native) | **yes** | `ctx.agents` + `ctx.agentLoop` | no | none | none (adopt) |
| Agent provider (external PTY/ACP) | **yes** | `ctx.subagents` (+ claude/codex/acp backends) | no | **needs room-level identity, not child-of-agent** | `ctx.acrAgentControl` compose |
| Handoff / relay | partial | `ctx.sessions.fork`, `agentTeams` mailbox, subagent continuation | yes | **structured handoff artifact** | new `ctx.acrRelay` |
| Context projection | **yes** | `ctx.systemPrompt`, `deriveMessages()`, `sessionProjections` | partial | agent-specific *external* projection | thin projection layer |
| Checkpoint | partial | `ctx.sessions.fork` + persistence + `request/header` | yes | cross-agent checkpoint *identity* | compose |
| Continuous mode | partial | subagent continuable, `agentTeams` | yes | durable task + resume across providers | `acrRelay` + room |
| Tasks | **yes** | `ctx.agentTeams` task DAG, `ctx.goals`, `ctx.todo` | yes | room-scoped tasks | thin |
| Artifacts | partial | `ctx.attachments`, `ctx.storageDomain` | partial | room-scoped artifact records | thin |
| Extension package | partial | `dynamicCordisRunner` plugin/package/run | yes | **capability package format + permissions + provenance** | new `@acryl/capability` |
| Dynamic UI | partial | `dynamicCordisRunner` client half, `ctx.clientModules` | yes | declarative trusted component registry | new `@acryl/ui` |
| Permissions | **yes** | `ctx.approval`, `ctx.sandbox`, `ctx.sandboxPolicy`, `ctx.permissionPresets` | partial | capability-scoped authorization | thin adapter |
| Hot activation | **yes** | Cordis HMR + `dynamicCordisRunner.run()` | no | none (adopt) | none |
| Auth / profile awareness | partial | `ctx.credentials`, `ctx.authorization`, desktop `desktopProfiles` | yes | cross-provider identity/profile | thin |
| Agent identity | partial | `session` brands, `agentTeams` membership | yes | stable room-wide agent identity | room |

Net: **DSH+Cordis supply the kernel; ACRYL must add a thin product layer + agent-agnostic composition, not duplicate runtime machinery.**

---

## 1. Verdict on the four bootstrap proofs (spec §26)

The spec says the first milestone must prove four things. Re-scored against source:

| Proof | Verdict | Evidence |
| --- | --- | --- |
| **1. ACRYL exists as clean plugin/bundle/profile layer on DSH** | **Already easy** | Bundles/profiles/patches are the composition model (`cordis.patch.yml`, `dsh.bundle`, `dsh.profile`). `acryl-desktop` is itself a profile/composition owner. ACRYL is another bundle. |
| **2. Persistent project/room launches 1 DSH-native + 1 external PTY/ACP agent** | **Mostly exists** | DSH-native: `ctx.agents`/`ctx.agentLoop`. External: `ctx.subagents` with claude/codex/acp providers. The missing piece is a *room* that holds both as peers, not an external child under a DSH parent. |
| **3. Minimal durable event/handoff lets work survive actor switch** | **Partial** | Durable events: `ctx.sessions`. Fork/lineage: `ctx.sessions.fork`. But handoff is *not* a structured artifact — it's session fork / resume / mailbox. ACRYL's handoff schema is the gap. |
| **4. Create/install/hot-activate ONE generated capability without core rebuild** | **Already exists** | `ctx.dynamicCordisRunner.define()/run()` + Cordis HMR + `cordis/dynamic-package` event. `dsh-tool-cordis` is the model-facing consumer. ACRYL would mostly *reuse* this, adding provenance/permissions. |

**Conclusion for §26:** The genuinely-creative proof is **#3 (handoff)** and the **room-level inversion**. Proofs #1, #2, #4 are largely already demonstrated by DSH. The spec's assumption that DSH is "a runtime substrate that might become ACRYL" understates Vancou... it understates that DSH is already an ADE-shaped host.

---

## 2. The three real seams ACRYL must define

These are what DSH does *not* cleanly provide, and what ordering the ACRYL roadmap should accept.

### 2.1 `ctx.acrRoom` — persistent, agent-agnostic project/room identity

DSH has two partial answers, neither is an ACRYL room:

- **`ctx.workspaceRegistry`** (`packages/workspace/workspace`) is a stable id over a *directory path* plus an ordered account of sessions. It is **invisible to models** and **path-bound** (canonical `cwd`). It is "workspace = folder + its sessions", not "room = persistent scene that spans heterogeneous agents".
- **`ctx.agentTeams`** (`packages/experimental/agent-team`) is a *session-rooted* team: a Lead session, teammate sessions, durable roster/mailbox/task-DAG. It is closer to a room but **requires a DSH Agent as the Lead** and is described as *experimental*. An external agent (Codex) that is not a DSH Session cannot be a first-class teammate.

**The ACRYL gap:** a `Room` whose identity is independent of any single agent/session, that can hold a DSH-native agent OR an external provider agent as peers, and that owns the canonical context, roster, tasks, mailbox, and handoff trail. This is the product layer on top of `workspace` + `agentTeams`.

```
proposed shape (conceptual, not final):
ctx.acrRoom {
  id: RoomId            // branded, agent-independent
  project: WorkspaceId  // the backing directory
  members: AcrMember[]  // heterogeneous: dsh-native session OR external provider handle
  canonical: Session    // optional owning DSH session hosting durable room context
  tasks, mailbox, artifacts, handoffs
}
```

Risk: overlaps `workspace` and `agentTeams`. Mitigation: `acrRoom` composes them, does not duplicate their storage — it is identity + orchestration, not a second event store.

### 2.2 `ctx.acrRelay` — structured handoff / relay artifact

DSH's continuity primitives are all *same-harness* or *child-of-agent*:

- `ctx.sessions.fork(source, boundary)` — fork a live DSH session to a new child session (same event vocabulary).
- `subagent` continuation — a durable child session, resumed by a DSH parent; followup/steer/report.
- `agentTeams` mailbox — peer messages between Team members, all DSH Sessions.
- `ctx.sessionReferenceResolver` — projects a current-surface snapshot into "durable untrusted message context" for mention syntax.

**None of these is a structured handoff artifact** carrying `{ objective, decisions, completed work, changed files, unresolved, next actions, provenance }` *across provider types*. ACRYL's §7 handoff spec is the genuine new work. It is not a DSH event type (handling it as a durable `SessionEvent` variant is possible but would be DSH-session-coupled).

**The ACRYL gap:** a provider-neutral, versioned handoff payload that a room can synthesize from canonical events + workspace diff, and that a *different* agent provider can consume as its entry context. The spec explicitly says: don't over-specify the final schema (accommodate evolution).

### 2.3 Capability package format (manifest + permissions + provenance) above `dynamicCordisRunner`

`ctx.dynamicCordisRunner` already does **define → approve → run → retract** generated Cordis packages with Host + browser halves (`cordis/dynamic-package`, `cordis/dynamic-retract`, `cordis/request-run`). `ctx.cordisInspect` adds an inspect/query surface. This covers ACRYL's §26-proof-4 and much of §11/§13.

**The ACRYL gap** is the *wrapper*, not the loader:
- a **capability manifest** (contract id, capability family, permissions it requests, UI contribution, tests, provenance);
- an explicit **permission model** over generated code (per §16), currently only the coarse `approval`/`sandbox`;
- **provenance + rollback** (who generated it, from what, which prior generation).
So ACRYL should define `@acryl/capability` as a thin contract, and let `dynamicCordisRunner` be one implementation backend — not fork it.

---

## 3. Full primitive-by-primitive table

Column meanings:
- **DSH primitive** — the live seam that already exists, with package path.
- **Cordis primitive** — which Cordis mechanism carries it (service / event waterfall / fiber / effect / isolation / HMR).
- **Reuse** — as-is / extend / new.
- **Gap** — what ACRYL must add.

| # | ACRYL primitive | DSH primitive (package) | Cordis primitive | Reuse | The actual gap |
| --- | --- | --- | --- | --- | --- |
| 1 | project/room | `ctx.workspaceRegistry` (`workspace`), `ctx.agentTeams` (`experimental/agent-team`) | service | extend | room identity independent of any single agent/session; holds heterogeneous members |
| 2 | canonical events | `ctx.sessions` `SessionEvent` log (`core/session`) | service + `session/event` emit | **as-is** | none — this IS the canonical event model |
| 3 | agent provider (DSH-native) | `ctx.agents` + `ctx.agentLoop` (`core/agent`, `core/agent-loop`) | service + `agent/*` events | **as-is** | none |
| 4 | agent provider (external PTY) | `ctx.subagents` + `subagent-claude-code` / `-codex` (spawn via `ctx.subprocess`, PTY via `ctx.terminals`) | service, named registry | extend | room-level handle; these are one-shot/continuable *children*, not room *peers* |
| 5 | agent provider (ACP) | `ctx.subagents` + `subagent-acp`; `ctx.acp` is an ACP *server* (`packages/acp/acp`) | service + subprocess | extend | room-level handle; provider-neutral (event) translation |
| 6 | handoff / relay | `ctx.sessions.fork`, `agentTeams` mailbox, `subagent` continuation, `sessionReferenceResolver` | service + events | extend | structured cross-provider handoff payload + synthesize from log |
| 7 | context projection | `ctx.systemPrompt` (`core/system-prompt`), `deriveMessages()`, `ctx.sessionProjections` (`session-projection`) | service, derived-union | extend | agent-specific *external* projection (per-provider formatting) |
| 8 | checkpoint | `ctx.sessions.fork` + `ctx.sessionPersistence` (`session-persistence-*`) | service, durable | extend | cross-agent checkpoint *identity* + branch compare |
| 9 | multi-agent team | `ctx.agentTeams` (`experimental/agent-team`) | service | extend | allow non-DSH members; room-scoped (not lead-session-rooted) |
| 10 | tasks | `ctx.agentTeams` task DAG, `ctx.goals` (`goal`), `ctx.todo`/`todo/write` | service + session event | extend | room-scoped tasks; external-agent ownership |
| 11 | artifacts | `ctx.attachments` (`attachment-local`), `ctx.storageDomain` (`storage-domain`) | service | extend | room-scoped artifact records + provenance |
| 12 | extension package | `ctx.dynamicCordisRunner` + `ctx.cordisInspect` (`extensions/cordis-host-runner`) | service + HMR + events | **as-is** for loader | capability manifest + permissions + provenance wrapper |
| 13 | dynamic UI | `dynamicCordisRunner` client half, `ctx.clientModules` (`modules`), conversation-node registry | service + client modules | extend | trusted declarative component registry (spec §15 normal path) |
| 14 | permissions | `ctx.approval` (`approval`), `ctx.sandbox` + `ctx.sandboxPolicy` (`sandbox`), `ctx.permissionPresets`, `ctx.authorization` | events (waterfall) + service | extend | capability-scoped authorization over generated code |
| 15 | hot activation | Cordis HMR + `dynamicCordisRunner.run()` + `cordis/dynamic-package` | HMR + events | **as-is** | none |
| 16 | auth / profile awareness | `ctx.credentials` / `ctx.authorization`; Desktop `desktopProfiles` | service | extend | cross-provider identity/profile for external CLIs |
| 17 | agent identity | `session`/`agent` brands, `agentTeams.membership` | service | extend | stable room-wide identity for any provider |
| 18 | continuous mode | `subagent` continuable, `agentTeams`, `ctx.sessions.resume` | service | extend | durable task + provider-agnostic resume across the room |
| 19 | self-extensible builder | `dsh-tool-cordis` + `dynamicCordisRunner` | service | extend | `@self-surgeon` aware of installed capabilities + declare "already can / build / new seam" |
| 20 | traces / observability | `ctx.sessionTelemetry`, `ctx.sessionQuery`, `sessionProjections` | service | extend | normalized cross-provider trace (prompts/tool calls/outcomes) |
| 21 | evolution lab (DSPy/GEPA) | — (nothing) | — | **new** | purely an ACRYL product layer; spec §22 says defer unless natural |
| 22 | generations / supervisor | Cordis generations; Desktop `startup-generation` | fiber + generation | extend | WARM/COLD supervisor for capability/self-update (spec §26–§28) |
| 23 | prefix cache stability | `request/header` (stable), `systemPrompt` (stable), content (mutable) | service | extend | keep external-agent projections cache-stable |

---

## 4. What ACRYL should NOT build (avoid duplicating DSH)

Per spec Law 12 ("do not rebuild functionality DSH provides"). Concretely:

- ❌ A new agent-loop. **Use `ctx.agentLoop`**; DSH-native is one provider.
- ❌ A new event store. **Use `ctx.sessions`** + `SessionEvent` merge-extension.
- ❌ A new subagent transport. **Use `ctx.subagents`** providers (claude/codex/acp already exist).
- ❌ A new PTY/shell/sandbox. **Use `ctx.subprocess`, `ctx.terminals`, `ctx.shell`, `ctx.sandbox`.**
- ❌ A new approval system. **Use `ctx.approval` waterfall + `ctx.permissionPresets`.**
- ❌ A new dynamic-plugin loader / HMR. **Use `ctx.dynamicCordisRunner` + Cordis HMR.**
- ❌ A new multi-agent room from scratch. **Extend `ctx.agentTeams`** (or compose it).
- ❌ A new persistence backend. **Use `ctx.sessionPersistence` + `ctx.storageDomain`.**

The dominant pattern: ACRYL composes, extends, and *inverts emphasis* — it does not supply missing runtime machinery because DSH already owns it.

---

## 5. Test-thesis answers (spec §32)

Answering the spec's eight questions with source evidence:

- **Q1. Can ACRYL live mostly OUTSIDE the DSH core?** **Yes.** Almost everything ACRYL needs is a documented seam (`ctx.subagents`, `ctx.agentTeams`, `ctx.sessions`, `ctx.dynamicCordisRunner`). ACRYL adds a bundle + product-layer plugin. No core rewrite required. This is the strongest yes in the analysis.

- **Q2. Are Cordis services/plugins powerful enough for the ACRYL capability model?** **Yes.** `service`/`inject`/`effect`/isolation/events/waterfall/HMR map directly onto every seam ACRYL needs. The only machinery ACRYL introduces (room, handoff, capability manifest) is a *composed service*, not a new framework capability.

- **Q3. Can external coding agents be represented cleanly without pretending they are DSH-native?** **Yes**, and DSH already does it via `ctx.subagents` (one-shot + continuable, named providers). ACRYL's refinement is to treat them as *room members* (peers) rather than *children of a DSH agent* (parents). This is an identity/orchestration change, not a transport change.

- **Q4. Can DSH session/event primitives serve as the canonical foundation for cross-agent continuity?** **Yes.** The event-sourced log is exactly that. The gap is that continuity is currently *same-harness* (fork/resume). Cross-provider continuity needs the ACRYL handoff artifact to translate between the DSH log and an external agent's native transcript. Foundation: strong. Translation layer: new.

- **Q5. Can a capability be installed/activated dynamically without rebuilding the app?** **Yes and already proven.** `ctx.dynamicCordisRunner.define()/run()` + Cordis HMR + `cordis/dynamic-package`. This is not theoretical in DSH; it is shipped.

- **Q6. Can generated functional UI be added without injecting arbitrary code into the trusted host?** **Partly.** DSH's `dynamicCordisRunner` runs a browser half in a sandboxed client module, and conversation nodes are keyed renderers. For a *trusted declarative* path (spec §15 normal path) ACRYL needs a small declarative component registry. The power path (arbitrary sandboxed module) already has a safe carrier. So: the host-injection risk is handled; the declarative contract is the small new piece.

- **Q7. What is genuinely missing from DSH/Cordis?** Three things: (1) a *provider-neutral room identity* that outlives any single agent and spans heterogeneous providers; (2) a *structured cross-provider handoff/relay artifact*; (3) a *capability package contract* (manifest + permission set + provenance) layered over the dynamic runner. Nothing in the *runtime kernel* is missing.

- **Q8. What is the SMALLEST upstream/core seam we would need to add?** Likely **none**. Everything ACRYL needs exists as a seam. If ACRYL wants to *own* durable room/handoff state in a provider-neutral way, the smallest kernel addition is an **ACRYL-owned durable session event vocabulary** (declare via `SessionEventMap` merge-extension) — which requires **no core change** because DSH's event map is merge-extensible. Only if ACRYL wanted DSH to natively know a "room" (host first-class room instead of a plugin) would a core seam be proposed — and the spec's Law 13 says prefer a plugin over that.

---

## 6. Risk register

| Item | Risk | Mitigation |
| --- | --- | --- |
| Duplicate seam overlap | ACRYL room vs `workspace` vs `agentTeams` can collide. | `acrRoom` composes, never copies; document ownership boundary. |
| DSH is fast-moving | `0.1.1-rc.2` seams may change. | ACRYL depends on stable seams; keep `@acryl/runtime-cordis` boundary (spec §19). |
| Over-investing in missing-problem | The spec assumes more is missing than is. | Re-scope ACRYL to the product layer + inversion; avoid re-implementing existing seams. |
| Handoff over-specification | Locking a schema too early. | Define minimal versioned payload + evolution path (spec §7). |
| Generated-code permissions | Dynamic plugins could gain too much. | Layer capability permission model over `approval`/`sandbox`; least privilege (spec §16, §30). |
| Room identity stability | room id must not be a path or a live session. | Branded `RoomId`, recomposable, agent-independent (mirror `WorkspaceId` rationale). |
| External agent continuity fidelity | handoff guessed from an external transcript can lose state. | Handoff is *structured + evidence-linked*, never pure summarization (spec §7). |
| Submodule uncommitted | `deepseek-harness` is untracked; gitlink not in index. | This is part of the pivot's staged set; do NOT add gitlink (see note in §8). |

---

## 7. Recommended ACRYL roadmap ordering (validated against source)

The orientation spec §30 suggests a ten-step roadmap; source evidence supports a compressed, dependency-correct version. Revised order and *why*:

1. **ACRYL-1 Room + durable identity** — `acrRoom` composes `workspace` + `agentTeams`. (Foundational; nothing else can hang off it.)
2. **ACRYL-2 Agent-agnostic provider seam** — wrap `ctx.subagents` so DSH-native + external are uniform room members (spec's "agent-agnostic" inversion).
3. **ACRYL-3 Handoff / relay** — `acrRelay` structured artifact; synthesize from `ctx.sessions` + workspace diff. (The genuine new value; highest risk → earliest.)
4. **ACRYL-4 Capability package contract** — manifest + permissions + provenance over `dynamicCordisRunner`. (Reuses existing loader.)
5. **ACRYL-5 Continuous mode / durable tasks** — room-scoped tasks + resume across providers (compose `agentTeams` + `subagent` continuable).
6. **ACRYL-6 Minimal ADE UI** — trusted declarative surface (spec §15 normal path), rendered from room state.
7. **ACRYL-7 Broad agent roster + auth/profile** — more provider backends + identity/profile awareness.
8. **ACRYL-8 Checkpoints / branch / Consilium** — fork + branch + compare (compose `ctx.sessions.fork`).
9. **ACRYL-9 Context engine / memory / graph** — selectable memory + code-graph providers (spec §17 composition).
10. **ACRYL-10 Traces / evaluation → Evolution Lab** — normalize cross-provider traces; last, per spec §22.

> Revision note vs spec §30: the spec orders "capability package format" (ACRYL-4) *after* handoff (ACRYL-3) — kept — but moves *room identity* to ACRYL-1 (spec had no explicit room step first) and puts *continuing mode* before *UI* because continuous mode is a continuity primitive, not a surface. The spec explicitly invites this re-order if source analysis supports it.

---

## 8. Evidence provenance

- Upstream source: `deepseek-harness/` submodule at `b150a551` (merge `release/dsh-0.1.1-rc.2`), version `0.1.1-rc.2` per `upstream.json`.
- Primary references read:
  - `docs/architecture.md` (spine, profiles/bundles, events, seams, "where new behavior goes")
  - `docs/capability-seams.md` (generated service catalog — the authoritative seam list)
  - `docs/subsystems/core.md` (Agent + registry + `agent/*` events)
  - `docs/subsystems/session.md` (event log, fork, projections)
  - `docs/subsystems/subagent.md` (named provider registry, continuable, claude/codex/acp backends)
  - `docs/subsystems/agent-team.md` (roster/mailbox/task-DAG)
  - `docs/subsystems/extensions.md` (`dynamicCordisRunner`, `cordisInspect`, hot activation)
  - `packages/subagent/subagent-codex/src/index.ts`, `subagent-claude-code/src/process.ts`, `subagent-acp/src/run.ts`, `packages/acp/acp/README.md` (external-agent transport realism)
  - `docs/cordis/cordis_spec.md`, `docs/onboarding/orientation_spec_acryl.md` (ACRYL goals)

### Note on git state (do not mutate during this analysis)
The outer repo is mid-pivot: HEAD holds the legacy Tauri ACRYL; the working tree stages the DSH Desktop workspace. `deepseek-harness/` is declared in a staged `.gitmodules` but its **gitlink is not in the index**, so `git submodule status` reports nothing. The checkout was placed at the pin by direct clone for reading only. **Do not** `git add` the submodule gitlink or alter the staged pivot while doing ACRYL analysis; the pin is also recorded standalone in `upstream.json` (`b150a551`, `0.1.1-rc.2`), which is the authoritative source-pin reference.

---

## 9. Open questions (to resolve before concept/roadmap finalization)

1. Does the room *own* a DSH session for its canonical context, or is context purely a projection over `workspace` + a durable ACRYL log? (Affects whether a room needs a live DSH Agent.)
2. Should the handoff artifact be an ACRYL `SessionEvent` variant (merge-extended, no core change) or a separate ACRYL-owned store? (Spec §7: keep it evolvable; the event route buys DSH replay but couples format to DSH.)
3. How much of `agentTeams` is stable enough to build on, given it is explicitly "experimental"?
4. Does ACRYL adopt `dynamicCordisRunner` as its only extension backend, or require its own capability-package loader for the manifest/permission/provenance layer?
5. Which external agents ship first in the room as true peers (Claude Code / Codex via `ctx.subagents`)? Determine whether the existing one-shot/continuable child semantics can be lifted to peer semantics without a transport change.
