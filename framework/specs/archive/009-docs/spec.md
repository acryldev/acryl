# Feature Specification: Documentation

**Milestone**: M9 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

A documentation set under `docs/` that a new plugin author can follow alone (SC-002), and that cannot
silently drift from the code: fenced snippets marked `ts docs-test` are executed by the test suite, every
relative link and anchor is checked, every page is reachable from the index, and every runtime export of
every package must appear in its reference page.

## Pages

- Getting started: installation, quickstart
- Concepts: overview, services and tokens, plugins, dependency graph, lifecycle, scopes, registries, hooks, isolation and nesting, hosts
- Guides: write a plugin, testing plugins, HTTP hosts, Effect interop, build-time graph, CLI, config and loader, AI agents, error catalogue
- Reference: one page per package (core, http, hono, fastify, effect, unplugin, loader, cli, testing, plugins)
- Architecture: decisions, comparison with the reference projects
- Status: what is implemented, what is deferred, honestly

## Requirements

- **FR-901**: Every `ts docs-test` snippet MUST be a complete module that passes when imported (assertions inside).
- **FR-902**: Every relative link and every `#anchor` into another docs page MUST resolve.
- **FR-903**: Every docs page except the original brief MUST be linked from `docs/README.md`.
- **FR-904**: Every runtime export of every package MUST be mentioned (as inline code) in its reference page.
- **FR-905**: No em dash character in docs.
