# Domain Docs

How the engineering skills should consume this repo's domain documentation
when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, if it exists.
- **`docs/adr/`** — ADRs that touch the area you are about to work in.
- **`.specify/memory/constitution.md`** — binding ACR/Cordis laws.
- **`docs/onboarding/orientation_spec_acr.md`** — product mission.
- **`docs/cordis/cordis_spec.md`** — Cordis runtime onboarding.
- **`docs/cordis/cordis_system_guide_for_coding_agents.md`** — operational
  Context, Fiber, service, injection, effect, event, Tool, Loader, and HMR rules.
- **`docs/cordis/acr_cordis_alignment_audit.md`** — current project compliance,
  transitional debt, and pre-implementation gates.
- **`docs/acr/`** — gap analysis, concept, roadmap, decisions as they appear.

If `CONTEXT.md` or `docs/adr/` do not exist, proceed silently. The
`/domain-modeling` skill creates them lazily when terms or decisions actually
get resolved.

## File structure

Single-context repo:

```text
/
├── CONTEXT.md                 ← created lazily by domain-modeling
├── docs/adr/                  ← created lazily
├── docs/acr/                  ← ACR architecture artifacts
├── docs/cordis/
├── docs/onboarding/
├── specs/                     ← Spec Kit + Wayfinder
└── dsh-plugin-desktop/
```

## Use the glossary's vocabulary

Prefer terms already defined in the orientation spec, Cordis spec, and
constitution:

- plugin, context, service, provider, consumer, inject, effect, fiber
- room, relay, handoff, projection, generation
- HOT / WARM / COLD
- DSH-native agent, PTY agent, ACP agent
- capability package

Do not drift to synonyms the constitution avoids (for example "rewrite the
harness", "agent-owned project", "mega prompt format").

## Flag ADR conflicts

If output contradicts an existing ADR or the constitution, surface it
explicitly rather than silently overriding.
