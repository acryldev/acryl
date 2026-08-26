# Implementation Plan: ACRYL-1 — ACRYL Cordis plugin + project/room identity + durable state

**Branch**: `002-acryl-1-plugin-identity` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Status**: Planning blocked on Cordis mini-design and DSH persistence research

Fill with `/speckit-plan` after `spec.md` is real.

## Summary

Not planned yet. Unlock after Wayfinder tickets 01 and 02, then complete the
six-part Cordis mini-design required by `AGENTS.md`. The plan must define the
`acrRoom` service interface, exact DSH seams reused, durable/live event split,
activation-owned effects, and provider-loss/restart verification before tasks
are generated.

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
`docs/cordis/acryl_cordis_alignment_audit.md`. In particular, resolve whether the
portable room store is a projection over DSH events or a new ACRYL-owned domain
log; do not duplicate persistence by implication.
