# AIMBRACE roadmap

## Product

**aimbrace is a prototype** of the ACRYL Blends framework (see [handoff](../013-acryl-extraction/handoff-to-blends.md)).

AIMBRACE scaffolds apps built on Cordis. Cordis is the framework; AIMBRACE adds no runtime. The product is the
`aimbrace` command and its templates. A generated project depends on `cordis` only.

## Milestones

| Milestone | State | Spec |
|---|---|---|
| M0 to M10: composition runtime, then a Hono/Fastify scaffolder | superseded, removed | [archive](../archive/README.md) |
| M11: Cordis is the framework | done | [011-cordis-only](../011-cordis-only/spec.md) |
| M12: ACRYL's Cordis as the framework (Phase 1 done; Deno on branch `012-deno-runtime-experiment`) | superseded by M13 | [012](../012-cordis-framework-and-builder/spec.md) |
| M13: a usable framework from ACRYL's best parts | done (2026-10-09) | [013](../013-acryl-extraction/spec.md) |
| M14: merge back into ACRYL | planned | [014](../014-merge-into-acryl/spec.md) |

## Next candidates (not started; each needs its own spec and a real app that asks for it)

- A real model provider plugin as an opt-in addition to the agent template.
- Hot reload of a single plugin during `pnpm dev`.
