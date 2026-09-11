# Plan: ACRYL-side runtime contract for BLENDS

Mirrors the Blends spec's own phase numbering (`ACRYL_BLENDS_SPEC.md` §31)
where it maps directly; phases here are the **ACRYL-repo-only** slice of
that work. Blends' Phase 1 (domain core), Phase 2 (local instantiation),
Phase 7 (catalog) etc. happen entirely in the `blends` repo and are out of
scope here.

## B0 - Repo/runtime mapping (ADR, no code)

Blends §31 Phase 0 asks for exactly this, scoped to "the existing ACRYL
source." Do it here since it requires reading this repo's internals, not
theirs.

Produce `docs/acryl/adr/ADR-00X-blends-runtime-boundary.md` (or fold into
this ledger's `research.md` if short enough) answering, with file/line
citations, not general claims:

1. **Hot reload boundary** (Blends §36 ADR-001). What exactly does
   `entry.update({disabled})` / `fiber.restart()` swap today - one Fiber,
   the whole client bundle, or both? (`plugin-lifecycle-controller.ts`,
   spec 032's T1-T6 history and the T3 revert are the primary evidence -
   the T3 revert is itself a data point about what is *not* yet safe to
   swap live.)
2. **Stable state ownership** (§36 ADR-002). Which services must own
   sessions/PTYs/DB handles/secrets/agent lifecycle/UI nav state across a
   reload today, and where is that enforced? (Cordis `ctx.effect()`
   discipline per `docs/cordis/cordis_system_guide_for_coding_agents.md`.)
3. **UI contribution model** (§36 ADR-003). Enumerate the renderer's actual
   named slots (`renderSlot('root')` and siblings) and state which are
   stable enough for a Blend-contributed module to target versus internal.
4. **Domain migration model** (§36 ADR-004). Does `@deepseek-ai/dsh-app-boot`
   or the Harness session/storage stack already have a migration
   subsystem? Answer before Blends' data milestone assumes SQLite-from-
   scratch.
5. **Agent facade** (§36 ADR-005). Read
   `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md` end to end and state
   exactly which section a Blend tool (e.g. `blend_inspect`) would compose
   with, and which Harness `subagents` capability (if any) a candidate-
   worktree evolution run should reuse per that doc's "Relationship to
   existing Harness capabilities" section.
6. **Multi-engine coordination** (triaged: coordinate now, not deferred).
   Re-read `specs/028-harness-engine-swap/` and `specs/029-acryl-hybrid-
   engine/` at whatever state they have reached by B0's start (both were
   drafts with no committed TypeScript interface as of this ticket's
   filing). Confirm the finding already recorded in `spec.md`'s gap table
   still holds: `BlendRuntimeAdapter` sits on a different axis than their
   "Engine adapter" (Cordis composition vs. which agent loop drives a
   session) and does not block on them, but Blends' §10 tool facade
   (`BlendAgentTools`) does - it must register through whatever uniform
   cross-engine tool-exposure mechanism 028/029 end up defining. If 028/029
   have since committed a concrete interface, cite it here by file/line
   before B1 locks the tool-facade registration shape.

Complete when: every gap row in `spec.md`'s table has a cited answer, not a
guess. Invalid/needs re-scoping if B0 finds the hot-reload boundary is
narrower than Blends assumed (e.g. only 3 legacy entries are truly safe to
swap live even post-spec-032 T1) - that would change B2's design, not just
its estimate.

## B1 - Typed runtime-adapter contract (interfaces only, minimal impl)

Define, in a new `acryl-desktop`-owned module (name TBD by B0's findings -
likely `blend-runtime-contract.ts`, or a new small package if B0 shows it
must be engine-agnostic and therefore not desktop-owned), the TypeScript
interfaces from `ACRYL_BLENDS_SPEC.md` §11 and §26 - `BlendRuntimeAdapter`,
and the subset of `BlendInstanceService`/`BlendEvolutionService`/
`BlendCheckpointService` that B0 shows already has a real backing
implementation. Do **not** implement operations B0 shows have no safe
backing yet (state snapshot/restore, candidate worktree, checkpoint) -
declare them in the interface as not-yet-implemented (throwing a clear
`not-implemented` error) so `blends-runtime-cordis` can compile against the
full contract from day one without ACRYL over-promising behavior.

This phase's own six-part Cordis mini-design (required by `AGENTS.md`
before implementation) must state plainly whether this is a new Cordis
service (most likely: a `blendRuntimeAdapter`-named service, analogous to
`livePluginActivation` in spec 032) or a plain library module with no
Cordis lifecycle of its own. Prefer the plain-module answer unless B0 shows
a real reason it needs `ctx.effect()`-owned resources.

Complete when: `blends-runtime-cordis` (in the sibling repo) can import
this contract and compile a `CordisBlendRuntimeAdapter` against it, even
before every method has a real implementation.

## B2 - Live module resolution for a not-yet-published row

**Triaged and scoped down from the original draft** (verified against
`plugin-lifecycle-controller.ts` and `desktop-plugin-reconcile.ts` directly,
not assumed): `PluginLifecycleController.activate` requires the package to
already resolve via `dsh.profile.bundles` + `node_modules`, but
`desktop-plugin-reconcile.ts`'s existing `pnpm add file:<dir>` + reconcile
path (spec 031, already used by the market) already produces exactly that -
a local directory with a `package.json` and `cordis.patch.yml` becomes a
real resolvable package - and `activate()` already mounts it live
afterward, no restart. So B2 is **not** a new Loader mechanism. It is:

1. A thin helper that, given a generated module's source (from wherever
   Blends' differentiation step writes it - a candidate worktree, per B3),
   materializes it as a local npm-shaped package directory (`package.json`
   with `dsh.bundle.patch`, the module source, `cordis.patch.yml`) in the
   shape `reconcileProfileBundles` already expects.
2. Calling the existing `pnpm add file:<dir>` + `reconcileProfileBundles` +
   `PluginLifecycleController.activate(packageName)` sequence, exactly as
   the market install path already does end to end.
3. The equivalent teardown sequence (`deactivate` + `pnpm remove` +
   reconcile) for a rejected/rolled-back candidate.

This means every "generated Cordis module" a Blend produces is, by
construction, a real local npm package the instant it is tried live - the
same shape a market plugin has, not a special ephemeral case. Keep it that
way; do not special-case in-memory modules unless a real scenario proves
this materialization step is a measured bottleneck.

Complete when: a hand-written module directory (not published anywhere)
goes from "just files on disk" to "live, mounted Cordis row" and back
through this exact reconcile+activate/deactivate sequence, proven by a real
Loader-activation test (not a mock), matching the verification bar in
`AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`.

## B3 - Candidate workspace + checkpoint primitives (design only this ticket)

The real gaps from `spec.md`'s table: isolated candidate worktree, state
snapshot/restore, checkpoint/rollback of a profile generation. This is the
highest-risk, least-proven area - do not commit to an implementation
milestone until B0/B1/B2 land and the team can see what a real generated
module actually needs to survive a swap. This phase's deliverable is a
design note (extending `spec.md`'s gap table with a concrete proposal per
row), explicitly citing `startup-recovery-controller.ts` as the nearest
existing pattern for "restore a known-good profile generation" and stating
what is missing from it for user-directed (not boot-failure-triggered)
rollback.

Complete when: a follow-up ticket (`specs/034-...` or a `specs/033.../
issues/`) exists with a scoped, implementable slice for exactly one of
these three primitives - not all three at once.

## Explicit non-goals (this plan)

Same list as `ACRYL_BLENDS_SPEC.md` §35, restated for this repo: no
Evolution Ledger service, no permission/trust tiers, no data-migration
adapter, no candidate-worktree UI, no multi-engine (`pi`) implementation -
only an interface shape that does not preclude one later. The first real
target is Blends' own "Zero -> Contacts" scenario running against B1+B2,
nothing broader.

## Verification

- `docs/cordis/cordis_system_guide_for_coding_agents.md` protocol followed
  for any new service/effect (B1, B2).
- `pnpm --filter acryl-desktop run check` green at the end of each phase.
- B2's activation path tested with real Loader activation
  (`AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`'s verification checklist:
  PENDING/reactivation, teardown on unload, idempotent disposal).
