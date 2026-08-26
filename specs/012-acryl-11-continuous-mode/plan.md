# Implementation Plan: ACRYL-11 — Continuous Mode

**Branch**: `012-acryl-11-continuous-mode` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Status**: Stub

Fill with `/speckit-plan` after `spec.md` is real.

## Summary

Not planned yet. Primitives only; no uncontrolled autonomous loops.

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
