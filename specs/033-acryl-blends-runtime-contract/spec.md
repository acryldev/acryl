# ACRYL-side runtime contract for BLENDS

Status: ready-for-agent

## Triage (2026-09-11)

Three open questions were resolved before this moved off `needs-triage`
(see the gap table and `plan.md` for the full reasoning each decision
produced):

1. **B2 scope** - confirmed smaller than the original draft: reuse the
   existing `desktop-plugin-reconcile.ts` (`pnpm add file:` + reconcile) +
   `PluginLifecycleController.activate` sequence for a generated module,
   not a new Loader mechanism. A generated module is always a real local
   npm package by construction.
2. **"Checkpoint" naming** - collides in name only with the still-unspecified
   `specs/011-acryl-10-checkpoints` (session/conversation branching). Kept
   as two separate concepts; flagged in the gap table so nobody conflates
   them later.
3. **Multi-engine coordination** - track `specs/028-harness-engine-swap/`
   and `specs/029-acryl-hybrid-engine/` now, not later. Finding so far:
   `BlendRuntimeAdapter` (Cordis composition) is a different axis from their
   "Engine adapter" (agent-loop selection) and is not blocked by them; the
   Blends §10 tool facade is the actual intersection point and must re-check
   028/029's state before B1 locks its registration shape (plan.md B0 item 6).

## Summary

`acryldev/blends` (sibling repo, local checkout at
`acryl_blends_project/blends`) is building "package.json for ACRYL apps": a
BLEND YAML format that captures a whole pre-configured ACRYL application -
its Cordis rows, config, and (eventually) its own agent-generated
capabilities - so it can be reproduced on another machine or handed to a new
project, and republished as a shareable Blueprint. M1 (format + `blends-core`
library), M2 (local hub index + CLI), and M3 (this repo: static, boot-time
composition of a compiled BLEND lock into the desktop profile,
`acryl-desktop/src/desktop-blend.ts`) are done. See
`acryl_blends_project/blends/docs/ACRYL_BLENDS_SPEC.md` (governing product
spec, v0.1) and `docs/BLENDS-ROADMAP.md` there.

What is **not** built yet, on either side, is the part the Blends spec calls
the **Differentiation Engine**: an agent (running inside a Blend) adding a
new capability - a generated Cordis module, a data entity, a UI route - to
the running app *live*, having that change captured as new, versioned Blend
state, with a checkpoint and a rollback path. That is squarely Blends
product logic, but it cannot be built as a Blends-repo-only library, because
every operation it needs (mount/unmount a Cordis row live, snapshot/restore
state, resolve a new module, checkpoint, roll back) is an ACRYL runtime
capability. Blends' own spec says this explicitly (§4): "Agent Runtime
Adapter != Blend Runtime... Cordis/ACRYL services execute the application
capabilities. The Blend lifecycle sits above both."

This ticket is the ACRYL-side half of that boundary: what this repo needs to
expose so `blends-runtime-cordis` (a package the Blends repo owns) can be a
thin, typed adapter over real ACRYL services, instead of a fork of
`plugin-lifecycle-controller.ts` or a second plugin runtime. Nothing here
implies Blends product logic (catalog, Evolution Plan, permission diff,
Evolution Ledger, CLI, UI) belongs in this repo - it does not. This repo
owns primitives; Blends owns the product built from them.

## Mental-model anchor

Per `docs/acryl/MENTAL-MODEL-factory-car-driver.md` (canonical, non-normative
framing already in this repo):

- **The factory** (Tier 0, never swaps) = ACRYL: the room, canonical
  context, task artifacts, git worktrees, review flow, approval policy.
- **The car subsystems** (Tier 2, hot-remountable) = Cordis plugins mounted
  by the Loader - "everything is a plugin."
- **The whole car** (Tier 3) = the harness engine (DSH today, pi later,
  `ctx.runtime.engine`).
- **The driver** (Tier 1) = the model, swapped per turn.

A BLEND is a **manifest of Tier-2 car-subsystem state** (which plugins, what
config) plus, once the Differentiation Engine exists, a **ledger of who
added which subsystem and when**. It is explicitly not a new tier and must
not become one: a BLEND names Cordis rows the existing Loader already
understands (locked by `docs/BLENDS-ROADMAP.md` D1), and the agent that
differentiates a Blend is a Tier-1/Tier-3 concern (model + engine), never
itself the source of truth for what changed - ACRYL is. This repo's job is
to keep it that way: give the Differentiation Engine primitives that route
through the same Tier-0 authority every other agent-driven change in this
repo already routes through (room/task state, git worktrees, review), not a
side channel Blends invents for itself.

## What Blends needs from ACRYL, mapped to what exists

Reading `ACRYL_BLENDS_SPEC.md` §4 (`BlendRuntimeAdapter`), §10 (agent tool
facade), §26 (service contracts) against this repo's actual surfaces:

| Blends needs | Closest existing ACRYL surface | Gap |
| --- | --- | --- |
| Mount/unmount a row live, by package name, without a restart | `PluginLifecycleController.setEnabledByPackageName` / `activate` / `deactivate` (`acryl-desktop/src/plugin-lifecycle-controller.ts`, spec 032) | None for a *known* row. `activate()` requires the package to already resolve via `dsh.profile.bundles` + `node_modules` (it `require.resolve`s the package's own `cordis.patch.yml`). **Verified and triaged smaller than first stated:** `desktop-plugin-reconcile.ts`'s existing `pnpm add file:<dir>` + reconcile path (spec 031) already stages exactly that - a local directory becomes a real resolvable package - and `activate()` already mounts it live afterward with no restart. B2 is therefore "wire reconcile + activate together for an agent-generated module," not a new Loader mechanism; see `plan.md` B2. |
| Snapshot/restore state across a candidate swap | Cordis's own Fiber dispose/re-`apply` (`entry.fiber.restart()`, spec 032 T4/T5) gives disposal ordering, not a state *snapshot*. No `RuntimeStateSnapshot` concept exists. | Real gap - needs design, not just wiring. |
| Isolated candidate workspace per evolution (git worktree/branch) | None in `acryl-desktop`. ALLAGENT (the parent project) has a worktree convention (`.worktrees/TASK-<id>-<agent>`, `git worktree` helpers) but that is a *different, unrelated* product/repo - do not import its code, only note the prior art exists. | Real gap. |
| Health check + atomic activate/abort of a candidate | `PluginLifecycleController.setEnabled`'s rollback-on-failure (spec 032, disable-cascade rollback) is the closest proof this pattern already works for *enable/disable*; there is no equivalent for "mount a never-before-seen module, verify, then commit or discard." | Real gap, but a proven pattern to extend rather than invent from zero. |
| Checkpoint + rollback of the whole Blend generation | Git (source/config) exists as infrastructure but nothing in this repo currently checkpoints a *desktop profile generation* as a restorable unit. `startup-recovery-controller.ts` restores a known-good profile after a *boot* failure, which is adjacent but not the same operation (it is host-boot recovery, not user-directed rollback of an accepted change). | Real gap; `startup-recovery-controller.ts` is the nearest prior art to study, not reuse as-is. **Naming note (triaged):** `specs/011-acryl-10-checkpoints` reserves "checkpoint" for a different, still-unspecified concept (session/conversation branch-compare, per its "Richer than chat history. Reuse session fork" note) - the two are unrelated in scope and stay separate; this ticket just flags the word collision so nobody conflates them. |
| One neutral tool facade registered into every agent runtime (Pi, DSH) | `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` already states the exact same requirement for ACRYL's own agent-control-surface work ("reuse the existing Harness `subagents` capability... do not fork or edit the pinned upstream checkout... add an ACRYL-owned adjacent capability"). | Not a gap in principle - a BLEND tool facade must follow that same document, not invent parallel tool-registration machinery. This is the highest-risk place for scope duplication if BLENDS and ACRYL agent-control-surface work happen on separate tracks without talking to each other. |
| `BlendRuntimeAdapter` being engine-agnostic (DSH first, pi/pi-cordis later - Blends' own "Agent Runtime Adapter != Blend Runtime" rule) | `specs/028-harness-engine-swap/` (drafted, "Engine adapter": the ACRYL-owned mapping between one concrete engine and an engine-neutral runtime contract) and `specs/029-acryl-hybrid-engine/` (drafted). **Checked, triaged "coordinate now":** neither has a committed TypeScript interface yet - both are still requirement-level specs, nothing to literally import. But the finding that matters: 028/029's "Engine adapter" answers *which agent loop drives a session* (DSH vs pi vs hybrid); `BlendRuntimeAdapter` answers *how a Blend's Cordis rows mount/snapshot/checkpoint*, and Cordis is the substrate regardless of which engine is driving the loop at any moment - so `BlendRuntimeAdapter` itself is **not** on the same axis and does not need to wait for 028/029. The real intersection is narrower: Blends' §10 tool facade (`blend_inspect`, `blend_plan_create`, ...) must register through whatever uniform tool-exposure mechanism 028/029's hybrid engine work establishes for making tools available across DSH/pi - not invent a second one. | Track 028/029; re-check before B1 locks `BlendAgentTools`' registration shape, not before `BlendRuntimeAdapter`'s. |
| Evolution Ledger (who/what/why changed, append-only) | `.allagent/room/main.jsonl`-style event sourcing is an ALLAGENT (parent project) concept, not something this repo has. This repo does have `docs/DEVELOPMENT-LOG.md` (human-authored, not machine-queryable) and the plugin-lifecycle receipt/snapshot machinery (spec 032), which is the closest *typed, machine-readable* record of "what changed" that exists today. | Real gap for a durable, queryable ledger; the plugin-lifecycle receipt shape (`PluginLifecycleReceipt`) is a reasonable starting shape to extend rather than a new format from scratch. |
| UI contribution slots (Tier A/B/C from the Blends spec §14) | The renderer already has a named-slot contribution system (`renderSlot('root')` and friends - see the boot-order crash investigated in spec 032's dev-log entries for how central this already is). | Needs an inventory (what slots exist today, are they stable/public enough for a third-party-ish contributor like a Blend module), not a new mechanism. |
| Data adapter / schema migrations | Not investigated in this pass. `@deepseek-ai/dsh-app-boot` and the Harness session/storage stack likely already have *some* persistence primitive; unknown whether it fits "per-Blend SQLite domain data with migrations." | Unknown - flagged as a Phase 0 research item, not assumed either way. |

## Non-goals for this ticket

- Do not implement the Differentiation Engine, Evolution Plan, permission
  diff, catalog, or CLI here - those are Blends product logic and belong in
  `acryldev/blends`.
- Do not build a second plugin/tool-registration framework. Any tool-facade
  work here must be one adjacent capability composed with
  `AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`, not a parallel one.
- Do not assume DSH is the only engine this needs to work with. Every
  primitive below must be stated as a contract (a TypeScript interface,
  Cordis service) that a `pi`/`pi-cordis` adapter could also implement later
  - per the Blends spec's own "Agent Runtime Adapter != Blend Runtime" rule
  - even though only a `CordisBlendRuntimeAdapter` (DSH-backed) ships first.
- Do not build 100 blueprint categories, a catalog UI, or hub network
  features. That is explicitly deferred in the Blends roadmap itself.

## Acceptance criteria (for this ticket, i.e. "is the contract well-specified")

- `plan.md` names, for each gap row above, which existing ACRYL file/service
  it extends and why extending it is safer than a new one - or states
  explicitly that no safe extension point exists and a new Cordis service is
  warranted, with the six-part Cordis mini-design required by `AGENTS.md`.
- Every proposed new ACRYL surface is stated as a typed interface (no `any`,
  no bare Cordis context handles) that could plausibly be exposed to a
  second, non-DSH agent runtime without rewriting it.
- The plan identifies the smallest real vertical slice inside *this repo*
  that would let the Blends repo's own Phase 4 ("Zero -> Contacts" vertical
  slice, `ACRYL_BLENDS_SPEC.md` §29/§37) actually run against a real ACRYL
  desktop instead of stubs - matching that spec's own YAGNI list (§35): no
  worktree UI, no permission model, no data migrations required for the
  first slice.

## Related

- `acryl_blends_project/blends/docs/ACRYL_BLENDS_SPEC.md` - governing
  product spec (the "what" and "why").
- `acryl_blends_project/blends/docs/BLENDS-ROADMAP.md` - Blends' own
  milestones/locked decisions.
- `acryl_blends_project/blends/specs/003-desktop-consumption/` - the M3
  ledger that landed the static, boot-time half of this in
  `acryl-desktop/src/desktop-blend.ts`.
- `specs/032-universal-hot-reload/` - the live mount/unmount/cascade/
  rollback machinery this ticket extends rather than replaces.
- `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` - the tool-facade
  constraints this ticket's agent-facing surface must follow.
- `docs/acryl/MENTAL-MODEL-factory-car-driver.md` - the tiering this ticket
  is written against.
- `docs/cordis/cordis_system_guide_for_coding_agents.md` - required reading
  before touching any Loader/service/Fiber code from this plan.
