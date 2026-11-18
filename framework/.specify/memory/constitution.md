# ACRYLBLENDS Constitution

This constitution governs every spec, plan, task and package in this repository. If another document conflicts with
it, this file wins until it is deliberately amended (with a version bump below).

**Version 5.0.0 (amended 2026-10-09).** Version 4 (Deno) lives on the branch `012-deno-runtime-experiment`. 5.0.0
keeps Node and adds a library of Cordis plugins that the command copies into apps (spec 013).

**Version 3.1.0 (amended 2026-10-07).** 3.1.0 names the Cordis package: the one ACRYL runs on (research R2).

**Version 3.0.0 (amended 2026-10-06).** Version 1 defined ACRYLBLENDS as a composition runtime on Cordis plus five
libraries; version 2 as a scaffolder with templates for two HTTP libraries. Both re-did what Cordis already provides and were
removed. The reason is in `specs/000-roadmap/research.md` (R1).

## Core Principles

### I. Cordis is the framework

Plugins, services, dependencies, lifecycle, cleanup, events and isolation come from Cordis. ACRYLBLENDS never adds a
wrapper, kernel, registry, graph, lifecycle or event layer around it, and never adds a library that duplicates a Cordis
capability.

### II. The product is a command, its templates and a plugin library

The `acrylblends` command copies a template, and the library plugins it lists, into an app; `acrylblends add` copies more.
Library plugins are plain Cordis plugins in `plugins/<name>/`. The app owns every copied line. There is no runtime
package for apps to import.

### III. Few, named dependencies

A generated app depends at run time on `@deepseek-ai/cordis` (pinned exactly) and, only when a copied plugin needs
them, `@deepseek-ai/schemastery` and `yaml`. Any other dependency needs a written reason in a spec. HTTP uses
`node:http`. Tests use `node:test`. No dependency may duplicate a Cordis capability.

### IV. Two templates

`app` and `agent`, both TypeScript run by Node with no build step. A new template needs a written reason in a spec and the name of the real app that asked for it.

### V. The verify script is the gate

`scripts/verify-scaffolder.mjs` scaffolds every template with the real CLI, installs it, runs its tests, boots it,
requests its routes and stops it. The repository gate runs it.

### VI. Offline and deterministic by default

The agent template uses a deterministic model and no network. No template imports a vendor SDK.

### VII. Smallest thing that works

No abstraction for a second use that does not exist yet.

### VIII. Test the behaviour a user sees

Templates are tested by booting them and requesting their routes, not by mocking Cordis. Docs examples are executed.

### IX. Honest specs and docs

Ledgers say what is done, blocked and deferred. Docs describe only what the tests run. Superseded specs live in
`specs/archive/` and nowhere else.

## Engineering rules

- TypeScript everywhere. Templates and library plugins use erasable syntax only, so Node 22.18 or newer runs them
  without a build; `tsc --noEmit` checks them. The CLI is built with tsdown.
- pnpm workspaces, Biome, Vitest.
- Small, coherent, conventional commits. Never add an AI agent as co-author.
- Never use the em dash character in code, comments, docs or commit messages.
- Do not hand-edit generated files or changelogs.

## Governance

Amendments need a changed version line, a research note in `specs/000-roadmap/research.md`, and updates to any plan
they invalidate.

**Version**: 5.0.0 | **Ratified**: 2026-10-06 | **Last Amended**: 2026-10-09
