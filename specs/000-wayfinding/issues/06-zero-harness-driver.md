# A third engine: the Zero-Harness composable driver

Type: grilling (foggy direction)
Status: open - candidate, not yet grilled to resolution
Depends on: M9 Phase A (the `AcrylEngine` seam must be real and validated with
two existing engines first), a well-exercised Cordis Tool contract, ideally the
M5/M6 capability-package format
Unlocks: a post-M9 research milestone (no number assigned yet)
Related: [Interchangeable harness engine (DSH <-> pi)](04-lock-harness-engine-swap.md)
(RESOLVED, M9, `specs/028-harness-engine-swap/`)

## Idea (user, 2026-09-07)

Beyond `dsh` and `pi`, add a third swappable engine: a **super-minimal,
composable, task-adaptive driver** that combines the best of pi and DSH but
ships almost no fixed toolbelt. Instead of the usual RWEB set (Read / Write /
Edit / Bash), it starts with **one tool: READ**. The agent reads the current
codebase and the task, then **assembles - or authors - the tools it needs** for
that task, registering them as it goes.

## Why this is ACRYL-native (not crazy)

- It is the most on-brand of the three engines: Cordis composition, "everything
  is a plugin", capability packages with manifest + provenance + tests. A driver
  that authors its own tools *as Cordis tool-plugins* is philosophically aligned
  with the constitution.
- It is one short step from the self-evolution story: an agent that writes
  task-scoped tools is close to an agent that writes surface plugins (M5/M6).
- **Least privilege is a real win.** An agent that holds only the tools it
  demonstrated it needs - each a scoped Cordis plugin with its own approval
  gate - is a stronger security posture than blanket `bash`.
- **Auditability is a real win.** Every capability the agent used is a named,
  versioned, provenance-tagged artifact. Direct input to M5/M6 and to any
  compliance/review story.

## Where it must be grilled before it becomes a spec

1. **"Only READ" is a gimmick unless the tool-assembly path is airtight.** An
   agent with only READ can do nothing until it authors and registers a tool.
   That requires: a code-writing capability (or a "define tool" meta-tool),
   registration into `ctx.tools` (Cordis Tool contract), execution through the
   normal policy pipeline, approval gating, and disposal when the owning Fiber
   unloads. You have not removed RWEB - you have replaced it with a **meta-tool
   that generates RWEB-equivalents on demand**, plus all the lifecycle
   machinery. Does that indirection earn its keep? The honest answer is: only
   for least-privilege and auditability, not for capability.

2. **Task-adaptivity is the weak claim.** A general coding agent with `bash` is
   already task-adaptive; bash is universal. "Assemble the tools you need"
   mostly reduces to "write a script", which bash already does. Do not sell this
   engine on adaptivity; sell it on scoped capability + provenance.

3. **The cache-prefix conflict is the deep one.** DSH's entire value to ACRYL is
   monotonic prompt growth -> high cache-hit rate (the monotonic-prompt thesis
   in `docs/onboarding/`). An agent that mutates its own toolset **mid-turn**
   invalidates the cached prefix every time it adds a tool - the exact opposite
   of what DSH optimizes. Resolution: tool assembly happens in a distinct
   **provisioning phase that then freezes**, so the turn loop always sees a
   stable prefix. That makes the driver **adaptive per task, not per turn**.
   This is a hard design constraint, not a footnote.

4. **"Combines the best of pi and DSH" must not become a third harness to
   maintain** - exactly the proliferation M9 exists to contain. The tractable
   framing is *composition, not reimplementation*:

   > A thin ACRYL-authored engine adapter that **composes** `@earendil-works/pi-ai`
   > (providers, OAuth, compaction) + Cordis (lifecycle, tool registration,
   > approval, effects) + DSH-style frozen-prefix prompt discipline, where the
   > agent provisions **task-scoped Cordis tool-plugins in a freeze-then-run
   > phase**, each with its own approval and provenance record.

   Framed that way it is roughly an adapter + a provisioning protocol, not a new
   runtime.

5. **Sequencing.** This cannot be engine #3 in M9. M9's job is to validate the
   `AcrylEngine` seam with two *existing* engines. A from-scratch minimal engine
   is a research project with its own spec and dependencies (seam validated,
   Tool contract exercised, capability-package format ideally in place).
   Building it during M9 would destabilize the seam being proven.

## Open questions (speak for yourself; do not let the agent answer)

1. **Primary goal.** Is the point (a) least-privilege / auditable capability
   use, (b) context/token economy, (c) a substrate for self-evolution, or (d)
   something else? The design differs sharply per answer. (a)+(c) look strongest.

2. **Meta-tool shape.** One "define and register a tool" meta-tool the agent
   calls, or a full WRITE + a "promote script to a registered capability" step?
   Does an authored tool need human/policy approval before first execution?

3. **Provisioning boundary.** Explicit two-phase (provision -> freeze -> run) so
   the prompt prefix stays cacheable? Or allow limited mid-turn additions and
   accept the cache cost? Who decides when provisioning is "done"?

4. **Component reuse.** Compose `pi-ai` for providers/OAuth/compaction, Cordis
   for lifecycle, DSH prompt discipline - and write only the glue? Or is there a
   real reason to reimplement any of those?

5. **Relationship to capability packages (M5/M6).** Are task-scoped tools the
   *same* artifact type as evolution capability packages (manifest, logic, UI
   projection, permissions, tests, provenance), just shorter-lived? If yes, this
   engine is a consumer of that format, not a new format.

6. **Disposal.** A task-scoped tool is a Cordis plugin with a Fiber. On task
   completion / engine swap, every authored tool must dispose with no leak and
   no duplicate registration - same bar as the `dsh`/`pi` adapters in 028. Is
   there anything about *authored* tools that makes this harder?

## Provisional recommendation

Keep it a Wayfinder candidate. After M9 ships and M5/M6 define the
capability-package format, grill questions 1-6, then - if it survives - spec it
as "a minimal ACRYL-authored engine that composes pi-ai + Cordis + DSH prompt
discipline, with freeze-then-run task-scoped tool provisioning", **not** as
"an agent with only READ that builds everything".

---

## Sidebar: how to consume pi (settled for M9, recorded here so it is not
re-litigated)

The user likes pi's efficiency, notes that many projects have forked it, and
wants "the best of both worlds" from pi and DSH.

**"Best of both worlds" is already the M9 plan.** 028 does not pick a winner: it
makes the engine a swappable capability so a user runs `dsh` *or* `pi` against
the same ACRYL room, relay, task artifacts, worker identity, and canonical
session record - and can resume a DSH session under pi. The ACRYL layer *is* the
shared "both worlds" substrate. A blended single engine (DSH prompt discipline +
pi providers in one runtime) is the explicit **combo follow-on** in ticket 04
item 4, after single-engine swap works. The Zero-Harness driver above is the
other route to a blend.

**How pi source enters the repo: pinned npm packages, not a git submodule.**
Decision from `specs/028-harness-engine-swap/research-pi-spike.md` (§1, §4):
`@earendil-works/pi-coding-agent` + `@earendil-works/pi-agent-core` +
`@earendil-works/pi-ai`, exact `0.85.x`, MIT, as `optionalDependencies` of
`acryl-harness-runtime`, consumed through the published SDK
(`createAgentSessionRuntime`).

Submodule rejected because:

- Updates must only happen when ACRYL developers **deliberately sync** the pi
  upstream - never a live feed. Both a pinned npm range and a pinned submodule
  satisfy that (a submodule only moves on an explicit `git submodule update` +
  commit). The difference is *what you review at sync time*: with npm you adopt
  a **published release with a changelog**; with a submodule you adopt a **raw
  commit range**, and pi is pre-1.0, lockstep-versioned, shipping fast, and
  *actively rewriting its own composition layer* (`@earendil-works/chord`), so
  that range is often mid-refactor.
- The DSH-submodule precedent does not transfer: DSH is a *stable harness you
  compose against*; pi is not stable yet. Same mechanism, opposite risk.
- A submodule vendors pi's whole monorepo + its own pnpm workspace + Chord + the
  Anthropic/OpenAI/Google/Bedrock provider SDKs, which blows the `acryl` CLI
  publish-closure size gate (`specs/025-acryl-runtime-distribution`; measured in
  028 task T030). `optionalDependencies` keeps the default CLI closure small.
- If ACRYL ever needs unreleased pi commits or must patch pi, the answer is a
  **pinned fork**, not a live submodule - still deliberate, still reviewable.

Revisit only if 028's credential/approval bridge work (T018/T019) or the T030
size measurement forces touching pi internals.
