# Wayfinder map: ACRYL on DSH + Cordis

Labels: `wayfinder:map`

## Destination

Ship Development Canvas as the first ADE surface in advanced Desktop: a
canvas where "+" opens a Terminal (CLI coding agents), a File editor, or a
Browser, with Chat remaining a tile. Room/relay walking skeleton remains
on the later ACRYL-1+ specs; it is no longer the first build.

## Notes

- Domain: ACRYL product layer on unmodified DSH. Everything is a Cordis plugin.
- Always read: `.specify/memory/constitution.md`, `docs/onboarding/orientation_spec_acryl.md`, `docs/cordis/cordis_spec.md`, `docs/cordis/cordis_system_guide_for_coding_agents.md`, `docs/cordis/acryl_cordis_alignment_audit.md`, `docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md`, `docs/cordisplugins/hello-world-plugin-guide.md`.
- Skills: `/wayfinder`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/grilling`, `/domain-modeling`, `/research`.
- This map's first implementation slice is `specs/015-development-canvas/`. The user directed that override on 2026-08-23.
- Tracker: `docs/agents/issue-tracker.md`. Tickets live in `issues/` beside this file.
- Refer to tickets by title, not bare numbers.

## Decisions so far

- [ACRYL ↔ DeepSeek Harness Gap Analysis](../../docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md) — prior research (not a closed Wayfinder ticket): DSH already has sessions, subagent providers, agent teams, PTY, and `dynamicCordisRunner`. Real gaps are room identity, structured relay, capability package format, and the agent-agnostic inversion.
- [First feature is Development Canvas](../../specs/015-development-canvas/spec.md) — user override: Orca-inspired canvas with + for Terminal / File / Browser is the first serious plugin surface; Hello World is the teaching guide in `docs/cordisplugins/`.

## Open decisions

- [Lock the interchangeable harness-engine destination (DSH <-> pi)](issues/04-lock-harness-engine-swap.md)
  — grilling ticket for the new roadmap milestone **M9 - Interchangeable
  harness engine**. The engine (agent loop / sessions / tools / approvals owner)
  becomes a replaceable provider behind `acryl-harness-runtime`; DSH-in-CLI-mode
  is engine #1, pi is engine #2, DSH+pi combo is a later candidate. Depends on
  M2. Unfilled `specs/028-acryl-harness-engine-swap/` is NOT created until this
  ticket resolves.

## Not yet specified

- Exact `ctx.acrRoom` / `ctx.acrRelay` / `ctx.acrAgentControl` service shapes (wait for destination lock + first-slice grill).
- Whether Agent Teams can be the room or must stay a DSH-lead coordination seam.
- Capability package manifest / permission / provenance schema.
- Declarative UI registry vs DSH conversation nodes.
- ACRYL-6 and later ADE/UI/evolution work.

## Out of scope

- Rewriting or forking `deepseek-harness/` on a desktop/ACRYL feature branch.
- Implementing DSPy/GEPA Evolution Lab (ACRYL-13) in this map.
- Uncontrolled autonomous Continuous Mode loops.
- Choosing Electron vs Tauri as a COLD substrate rewrite. This checkout is DSH Desktop (Electron) composing Cordis; keep it unless a later map redraws the destination.
