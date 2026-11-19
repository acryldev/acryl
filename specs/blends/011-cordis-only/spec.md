# 011: Cordis is the framework

## Decision (owner, 2026-10-06)

Drop everything that re-does what Cordis already has. The framework is Cordis. AIMBRACE keeps one command,
`aimbrace init`, and two templates that depend on `cordis` only. Reason: [research R1](../000-roadmap/research.md).

## Requirements

- **FR1** `aimbrace init [dir]` copies the `app` or `agent` template into an empty or new directory and fills in the
  project name. It asks on a terminal; `--agent`/`--no-agent`, `--name`, `--install` and `-y` answer without asking.
- **FR2** `init` never writes into a non-empty directory (exit 1) and rejects an invalid name before writing (exit 2).
- **FR3** A generated `package.json` has exactly one runtime dependency: `cordis`.
- **FR4** Each template is plain Cordis: an `http` router service, `routes` added inside `ctx.effect`, and a `server`
  plugin over `node:http` that closes on dispose. The `agent` template adds `model`, `tools`, `memory` and `agent`; each
  run is a child fiber holding its step budget. The agent is deterministic and offline.
- **FR5** The repository contains no runtime package and no dependency on Hookable, Effect, Unplugin, Hono or Fastify.
  Docs and active specs do not describe the removed runtime.
- **FR6** Every Cordis example in the docs is executed by the test suite.

## Acceptance

`pnpm run check` passes, and `scripts/verify-scaffolder.mjs` scaffolds both templates with the real CLI, proves the
refusal, checks FR3, installs, runs each project's tests, boots it, requests `/`, `/health` and (agent) `POST /ask`,
and stops it with SIGINT.

## Out of scope

npm publishing. The website (separate repository) is updated separately.
