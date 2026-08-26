# Implementation Plan: ACR-12 — Trace / evaluation infrastructure

**Branch**: `013-acr-12-trace-eval` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)
**Status**: Stub

Fill with `/speckit-plan` after `spec.md` is real.

## Summary

Not planned yet. Traces are a product asset with privacy boundaries.

## Technical Context

**Language/Version**: TypeScript (strict) on Node `^22.19.0` or `>=24`, plus desktop Electron host
**Primary Dependencies**: `@deepseek-ai/cordis`, published DSH packages, `dsh-plugin-desktop`
**Storage**: DSH session persistence + ACR room artifacts (TBD)
**Testing**: `corepack yarn test` / `corepack yarn check` (headless)
**Target Platform**: DSH Desktop Host generation
**Project Type**: Cordis plugin / bundle / profile layer
**Constraints**: no `deepseek-harness/` edits; reversible effects; inject not boot-order
**Scale/Scope**: walking skeleton first

## Constitution Check

Pending a real plan. Must pass constitution I–V and Cordis authoring laws.
