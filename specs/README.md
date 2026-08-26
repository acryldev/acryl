# specs/ — Spec-Driven Development for ACRYL

This tree is the working surface for three complementary methods:

| Method | What it owns here | When to use it |
| --- | --- | --- |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | per-milestone `spec.md` / `plan.md` / `tasks.md` / `research.md` | After a decision is made and a feature can be specified |
| [Wayfinder](https://github.com/mattpocock/skills/tree/main/skills/engineering/wayfinder) (Matt Pocock) | `000-wayfinding/map.md` + child tickets | When the way is still foggy; tickets decide, they do not build |
| Matt Pocock SDD (`to-spec`, `to-tickets`, `triage`) | tracker conventions in `docs/agents/` | Publishing a PRD and slicing implementation tickets |

Governing policy: [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).

Product intent: [`docs/onboarding/orientation_spec_acryl.md`](../docs/onboarding/orientation_spec_acryl.md).

Cordis kernel: [`docs/cordis/cordis_spec.md`](../docs/cordis/cordis_spec.md),
the operational
[coding-agent guide](../docs/cordis/cordis_system_guide_for_coding_agents.md),
and the DSH [Cordis primer](https://deepseek-harness.github.io/deepseek-harness/en/reference/cordis-primer).

First-pass substrate map: [`docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md`](../docs/acryl/ACRYL_DSH_GAP_ANALYSIS.md).

## Layout

```text
specs/
  README.md
  000-wayfinding/          Wayfinder map + decision tickets
    map.md
    issues/NN-slug.md
  001-acryl-0-gap-analysis/
  002-acryl-1-plugin-identity/
  ...
  014-acryl-13-evolution-lab/
  015-development-canvas/  First ADE surface (Orca-inspired + tiles)
    spec.md                what / why  (Spec Kit specify)
    plan.md                how         (Spec Kit plan)
    tasks.md               ordered work (Spec Kit tasks)
    research.md            facts a plan waits on
```

Do not treat a stub `spec.md` as approved. Fill it with `/speckit-specify`
(or the matching skill) only after the Wayfinder ticket that unlocks that
milestone is resolved.

## Agent commands

Spec Kit skills live in `.agents/skills/speckit-*` and `.claude/skills/speckit-*`.

Typical order for one milestone:

1. Resolve the Wayfinder ticket that makes the question sharp.
2. Read the Cordis coding-agent guide and write the six-part mini-design from
   `AGENTS.md` into the milestone plan/research.
3. `/speckit-specify` → `spec.md`
4. `/speckit-plan` → `plan.md` (+ research notes)
5. `/speckit-tasks` → `tasks.md`
6. `/speckit-implement` only for the current slice

## Tracker split

- **Decisions** stay in Wayfinder tickets (`000-wayfinding/issues/`).
- **Feature specs** stay in `specs/NNN-*`.
- **GitHub Issues** on `acryldev/acryl` are optional promotion, not the
  default store, so this checkout remains usable offline and across agents.

See `docs/agents/issue-tracker.md`.
