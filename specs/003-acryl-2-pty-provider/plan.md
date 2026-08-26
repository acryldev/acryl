# Implementation Plan: ACRYL-2 — External PTY agent provider as a room peer

**Branch**: `003-acryl-2-pty-provider` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Status**: Planning blocked on `acrAgentControl` contract and adapter reuse research

Fill with `/speckit-plan` after `spec.md` is real.

## Summary

Not planned yet. Implement the three-role `acrAgentControl` capability described
in `docs/acryl/AGENT_CONTROL_SURFACE_CORDIS_DESIGN.md`: stable service
definition, independently activatable provider plugins, and Canvas/relay
consumers using `inject`. Compose `ctx.subagents`, `ctx.terminals`,
`ctx.subprocess`, and sandbox services where their contracts fit. Do not hide
PTY ownership in UI or preserve the current hardcoded agent-name list.

## Technical Context

**Language/Version**: TypeScript (strict) on Node `^22.19.0` or `>=24`, plus desktop Electron host
**Primary Dependencies**: `@deepseek-ai/cordis`, published DSH packages, `dsh-plugin-desktop`
**Storage**: DSH session persistence + ACRYL room artifacts (TBD)
**Testing**: `corepack yarn test` / `corepack yarn check` (headless)
**Target Platform**: DSH Desktop Host generation
**Project Type**: Cordis plugin / bundle / profile layer
**Constraints**: no `deepseek-harness/` edits; reversible effects; inject not boot-order
**Scale/Scope**: walking skeleton first

## Constitution Check

Pending a real plan. Must pass constitution I–V, the Cordis system guide, and
`docs/cordis/acryl_cordis_alignment_audit.md`. Tests must cover PENDING,
provider registration/removal, consumer reactivation, process quiescence,
capability honesty, and repeated activation without duplicate registrations.
