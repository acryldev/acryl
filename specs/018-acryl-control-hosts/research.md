# Research: ACRYL Standalone Agent and Peer Hosts

Status: research complete; decisions recorded for planning.

## Decision 1 - OpenTUI is a separate runtime, not an in-repo Node dependency

- Decision: adopt `@opentui/core` as the `acryl` terminal presentation library, running under its required runtime rather than the Electron/DSH Node generation.
- Rationale: it provides the renderer, renderables, input/resize, alternate-screen, clipboard, notification, and lifecycle services needed for a real TUI host; its API (`createCliRenderer`, renderables, `CliRenderEvents.CAPABILITIES`, `resize`, `focus`, `palette`, `selection`, renderer `start`/`pause`/`suspend`/`resume`) maps cleanly onto plugin-contributed screens and status regions.
- Evidence: pinned registry inspection on 2026-08-26 shows latest stable `@opentui/core` `0.5.8`, with README stating it "runs on Bun 1.3.0 or later, or on Node.js 26.4.0 or later with ECMAScript modules (ESM)".
- Alternatives considered:
  - Node 22/24 in the existing workspace - rejected because `@opentui/core` 0.5.8 declares Bun 1.3.0+ or Node 26.4.0+; bundling onto the desktop Node line would violate that floor.
  - Hand-rolled ANSI/alt-screen code - rejected because it would reinvent input, resize, selection, clipboard, palette, and rendering lifecycle.
  - An older OpenTUI version with lower runtime floor - rejected because no stable release below 0.5.8 was identified in the published version list that satisfies the feature, and pinning a prerelease is not justified.
- Consequence: `acryl` ships a dedicated runtime spine (Bun 1.3.0+, or Node 26.4.0+ if packaging prefers it) that talks to the DSH control plane through the local control protocol. It must not be loaded into the Electron main process or the DSH Node 22/24 generation.

## Decision 2 - Reuse the persistent DSH agent spine; never wrap the one-shot headless runner

- Decision: `acryl` composes the persistent Harness agent spine (`ctx.agents`, `ctx.agentLoop`, `ctx.sessions`, `ctx.tools`, `ctx.jobs`, `ctx.subagents`, `ctx.sessionProjections`) directly. The one-shot `headless-runner` is explicitly not used as the interactive surface.
- Rationale: the pinned `packages/bundle/headless` contract is one task, one fresh persisted Agent, final text on stdout, then bounded exit. It has no interactive follow-up, no resume UI, and no lifecycle/architecture controls. The durable session and trajectory capabilities it composes are exactly what `acryl` needs.
- Evidence: `deepseek-harness/packages/bundle/headless/README.md` and `examples/headless-agent/cordis.yml` (agent-spine, persistence, checkpoint, token-meter, compaction, subagents, workflows, tool-ralph, tool-todo, fs stack, Code Mode overlay via `advanced.cordis.yml`).
- Consequence: the ACRYL TUI is a first-party interactive consumer of the same durable services, not a loop around a subprocess.

## Decision 3 - External agents are providers, and Codex/Claude providers already exist

- Decision: delegate one-shot or continuable external work through upstream `ctx.subagents` where its contract fits, and add Gemini/OpenCode/local providers at the same seam. Long-lived externally controlled workers use the repository-planned `acrAgentControl` service so ACRYL worker identity stays separate from vendor sessions and PTYs.
- Evidence: `deepseek-harness/examples/acp-agent/product-subagent-codex.cordis.yml` and `product-subagent-both.cordis.yml` already insert `@deepseek-ai/dsh-subagent-codex` and `@deepseek-ai/dsh-subagent-claude-code` named providers plus `tool-subagent` rows; the ACP example also loads `hooks-claude-code` and `hooks-codex`. The gap analysis documents `ctx.subagents` as a named provider registry with claude/codex/acp backends.
- Consequence: no new orchestration framework. New providers declare truthful capabilities and follow the Cordis three-role seam.

## Decision 4 - Self-referential Cordis control already exists and must be reused

- Decision: reuse `ctx.dynamicCordisRunner`, `ctx.cordisInspect`, and `@deepseek-ai/dsh-tool-cordis` for the agent-facing install/build/patch loop; reuse Loader/HMR transactional reconciliation for candidate activation.
- Evidence: `deepseek-harness/examples/web-cordis/README.md` and `examples/acp-agent/cordis-tools.cordis.yml` insert `cordis-host-runner` and `tool-cordis`; the Cordis system guide Part XIX describes the safe self-modification loop (edit candidate, build/typecheck/test, reconcile, await settlement, observe health, keep or roll back).
- Consequence: ACRYL adds provenance, permissions, profile packaging, and presentation, not a second dynamic loader.

## Decision 5 - Single-writer profile ownership is a first-class ACRYL-owned service

- Decision: introduce an ACRYL-owned profile ownership lease and a host-neutral local control protocol. A profile has at most one writable owner; a live compatible owner is attached to, never duplicated.
- Rationale: `dsh-plugin-desktop` already has profile materialization and a profile-selection state, but no cross-host ownership arbitration. Desktop `desktopProfiles` remains the public Desktop service; ACRYL composes a shared lease authority around it without reimplementing profile storage.
- Consequence: direct mode boots the profile in-process; attach mode authenticates to the owner's local endpoint; recovery mode is narrow and non-interactive by default.

## Decision 6 - Extraction is staged with compatibility adapters

- Decision: refactor Desktop-owned operational capabilities (plugin lifecycle, architecture inspection, profile, Market preview/execute) toward host-neutral control services in stages, with the existing same-origin loopback routes preserved until each stage's replacement is verified. The terminal control plane consumes the same services directly in direct mode and over the protocol in attach mode.
- Rationale: the alignment audit and existing specs (016 lifecycle, 017 architecture explorer, Market host routes) already model these as route/controller/contract triples. Moving the controller behind a host-neutral interface first, and later thinning the Electron-only route, avoids breaking the working GUI/Web during delivery.
- Consequence: each vertical slice keeps `corepack yarn check` green and adds its own run-once tests.

## Decision 7 - Upstream remains pinned and unmodified

- Decision: `deepseek-harness/` stays read-only. All ACRYL composition, services, adapters, and launchers live in repository-owned workspaces.
- Rationale: constitution Principle III and the gap analysis both require composition over fork.
- Consequence: no submodule edits; the submodule pin is updated only as a separate, explicit step.

## Decision 8 - Command surface is `acryl` with peer subcommands

- Decision: `acryl` (default TUI), `acryl gui`, `acryl web`, plus convenience `acryl-gui` / `acryl-web` that delegate without independent behavior. Full grammar lives in `contracts/cli.md`.
- Rationale: user-approved naming; one canonical command, peer launch targets, deterministic non-interactive output for automation.
- Consequence: parser and acceptance tests are part of the first slice.
