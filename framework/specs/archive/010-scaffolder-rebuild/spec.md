# Feature Specification: aimbrace scaffolding (rebuild)

**Feature Branch**: `main` (maintainer workflow, no feature branches)

**Created**: 2026-10-06

**Status**: Draft

**Input**: User direction ("rebuild our own framework based on Cordis from scratch",
scaffolder shaped like create-better-t-stack) and the ponytail review in
[`./review.md`](./review.md). Supersedes the framework direction in
`docs/aimbrace_spec.md` for all new work; old code is frozen, not deleted.

## Summary

**Distribution (decided 2026-10-06): self-contained in this repository.** No npm package is
published for the scaffolder or any framework code. Users get it from the repository checkout,
alongside the templates it copies. An npm publish of `create-aimbrace@0.1.0` happened by mistake
and is being removed by the owner.

Ship scaffolding inside aimbrace itself: `aimbrace init` asks a few choices
(host, extras), copies an in-repo template, and the user gets a working Cordis
app. No new package, no new binary name, nothing outside this repo. Templates
depend on `cordis` and host libraries directly. better-t-stack is the model
(questionnaire plus templates), kept inside the aimbrace CLI.

## Clarifications

### Session 2026-10-06

- Q: same repo or fresh repo for the scaffolder? → A: same repo, decided.
  Scaffolding ships inside the aimbrace CLI. No new repository, no new package.
- Q: delete or archive the old framework code? → A: neither. Old code stays
  frozen until cutover. No deletion, no archive branch.
- Q: shrink the website or leave it? → A: leave it. Untouched.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scaffold and run a serving app (Priority: P1)

A developer runs `aimbrace init my-app`, picks the defaults, installs,
and starts a serving app built from Cordis plugins with routes contributed
through a plain registry. HTTP is served with `node:http` from the standard
library; no host dependency exists.

**Why this priority**: this is the product. Everything else is a variant.

**Independent Test**: in an empty temp dir, run the scaffolder non-interactively,
`pnpm install`, boot, HTTP GET returns 200, and the generated
`package.json` depends on `cordis` and nothing else (a test scans it).

**Acceptance Scenarios**:

1. **Given** an empty directory, **When** the scaffolder runs with defaults,
   **Then** it writes a runnable project (config, plugins, package.json)
   and prints next steps.
2. **Given** a non-empty directory, **When** the scaffolder runs, **Then** it
   refuses without overwriting anything.
3. **Given** the scaffolded project, **When** installed and started, **Then**
   its route responds 200 and Ctrl+C stops it cleanly.

### User Story 2 - Agent starter that runs offline (Priority: P2)

The developer ticks the `agent` extra and gets a mock model plus memory, tools
and one agent task scope, fully deterministic with no keys and no network.

**Independent Test**: the agent template's test suite passes offline.

**Acceptance Scenarios**:

1. **Given** the agent extra, **When** its tests run without network, **Then**
   they pass and no real vendor SDK is imported.

### User Story 3 - Document in one page (Priority: P3)

One quickstart page takes a user from zero to a serving app using the aimbrace
CLI from this checkout. No separate publish: scaffolding ships with aimbrace.

**Independent Test**: a fresh machine (or container) completes the quickstart
from this repo.

**Acceptance Scenarios**:

1. **Given** this checkout, **When** a user follows only the quickstart page,
   **Then** they reach a serving app in under 10 minutes.

## Edge Cases

- Target directory exists and is non-empty: refuse, exit non-zero, change nothing.
- Node below v22: fail fast with a one-line message.
- Offline machine: templates need registry access for the one `cordis`
  install; document it, do not vendor node_modules.
- No new binary or package name is introduced anywhere in this milestone.

## Functional Requirements

- **FR-001**: `aimbrace init` MUST ask for app name and extras (`agent`
  on/off), and MUST accept the same answers as flags for non-interactive runs.
  There is no host question: serving is `node:http` from the standard library.
- **FR-002**: A scaffolded `package.json` MUST depend on `cordis` and nothing
  else: zero `@aimbrace/*`, zero `@deepseek-ai/*`, zero `hono`, `fastify`,
  `hookable`, `effect`, `unplugin` (enforced by test).
- **FR-003**: Templates MUST use `cordis` Context and plugins directly; no
  wrapper runtime may be introduced.
- **FR-007**: Templates MUST depend on upstream `cordis` (exact pin
  `cordis@4.0.0-rc.10`). Tutorial material reused from
  `cordis-interactive-tutorial` MUST have its dependency lines swapped to
  upstream `cordis`.
- **FR-004**: At most 2 templates: base, agent.
- **FR-005**: The agent template MUST run offline with a deterministic mock
  and MUST NOT import a real vendor SDK.
- **FR-006**: A verify script MUST scaffold every template in a temp dir,
  install, boot, curl the route, and run the template tests.

## Success Criteria

- A new user goes from zero to a serving app in under 10 minutes by following
  only the quickstart page.
- Every scaffolded app has zero `@aimbrace/*` dependencies.
- The scaffolder's own `pnpm run check` is green.
- Template count stays at or under 2.
- No lines added to `packages/`, `plugins/` or `examples/` (frozen).

## Assumptions

- Everything lives in this repo: `aimbrace init` extended in `packages/cli`,
  templates under `packages/cli/templates/` (shipped with the CLI),
  verify script under `scripts/`.
- Old code, docs and site stay exactly as they are until cutover.
