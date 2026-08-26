# Implementation Plan: ACRYL-4 — Capability package format + loader

**Branch**: `005-acryl-4-capability-package` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Status**: Stub

Fill with `/speckit-plan` after `spec.md` is real.

## Summary

Not planned yet. Reuse ctx.dynamicCordisRunner. Add manifest, permissions, provenance.

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

Pending a real plan. Must pass constitution I–V and Cordis authoring laws.
