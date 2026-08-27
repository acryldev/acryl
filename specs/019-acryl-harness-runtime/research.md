# Research: ACRYL Shared Harness Runtime

## Status

Research complete for specification. The implementation plan must resolve the
remaining runtime-package dependency inventory before code is written.

## Finding 1 - `@deepseek-ai/dsh-base` is a profile layer, not a self-contained dependency

The direct-host experiment prepared a standard empty profile root and applied
`@deepseek-ai/dsh-base`. Harness correctly attempted to load its agent, session,
persistence, tool, approval, and job rows. It failed before activation because
`acryl-tui` did not own the full module closure that those rows import.

This is not a Loader ordering bug. The profile tree is correct, while the
presentation package's runtime closure is incomplete.

## Finding 2 - The upstream CLI provides the correct profile preparation pattern

`deepseek-harness/apps/cli/src/profile-boot.ts` prepares a profile by:

1. healing the installation-owned module fallback;
2. loading profile bundles and user patch layers;
3. rewriting the empty `cordis.yml` root used only as the Loader anchor; and
4. booting the composed patch stack through `@deepseek-ai/dsh-app-boot`.

ACRYL must reuse this pattern through an owned boundary, not copy fragments
into each presentation host.

## Finding 3 - Host and Harness must share one Cordis root

`@deepseek-ai/dsh-app-boot.boot()` accepts a `prepare` hook after Loader setup
and before profile entries mount. That is the correct location for the ACRYL
profile lease and host-neutral control services. A separate `Context` would
split service resolution and lifecycle ownership, violating the constitution.

## Finding 4 - Native session and agent contracts already exist

The pinned `@deepseek-ai/dsh-session` service owns append-only session logs and
persistence integration. `@deepseek-ai/dsh-agent` exposes `ctx.agents.create()`
and `ctx.agents.resume()` with an ordered `AgentHandle` disposal contract. The
native ACRYL agent bridge must be a consumer/provider adapter over these
services, not a second session store.

## Deferred decision

The precise runtime dependency inventory needs a bounded closure audit. The
shared workspace must declare what the selected profile can load, rather than
relying on a sibling package's `node_modules` tree.
