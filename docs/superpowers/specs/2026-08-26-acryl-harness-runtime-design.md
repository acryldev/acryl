# ACRYL Harness Runtime Design

## Purpose

Provide one repository-owned runtime boundary that boots the pinned DeepSeek
Harness profile tree for ACRYL terminal, Desktop, and future Web hosts. It
prevents each presentation host from carrying an incomplete or divergent DSH
plugin dependency closure.

## Architecture

Create `acryl-harness-runtime/`, a non-presentation workspace that owns:

- the complete pinned DSH runtime dependency closure required by
  `@deepseek-ai/dsh-base`;
- profile initialization, fallback-module healing, and the empty profile root
  configuration used by the upstream profile launcher;
- composition of bundle patches and profile patches in their documented order;
- `bootAcrylHarnessProfile()` as the only host-facing boot API.

`acryl-tui` and `acryl-desktop` consume this workspace. They do not import
one another and do not independently recreate profile boot logic.

## Public boundary

```ts
interface BootAcrylHarnessProfileOptions {
  profile: string
  prepare(ctx: Context): Promise<void> | void
}

interface AcrylHarnessRuntime {
  ctx: Context
  profileDirectory: string
  dispose(): Promise<void>
}

function bootAcrylHarnessProfile(
  options: BootAcrylHarnessProfileOptions,
): Promise<AcrylHarnessRuntime>
```

The supplied `prepare` callback runs after Loader installation and before any
profile entry mounts. A host mounts its ownership lease and ACRYL control
services there, so the lease, control plane, `ctx.sessions`, `ctx.agents`, and
DSH Loader tree exist in one Cordis root.

## Lifecycle and durability

The runtime owns the root Cordis Fiber. `dispose()` calls that root disposal
once. It does not separately dispose profile services, agents, or sessions:
their owning Fibers determine their ordered teardown and persistence flush.

The native ACRYL agent provider will own its `AgentHandle`s through one
lifecycle effect. It creates or resumes agents through `ctx.agents`, sends
identified messages through the inbox, and projects UI state only from durable
session events plus native live services. It never derives canonical history
from terminal output.

## Configuration

The runtime initializes an ACRYL profile with `@deepseek-ai/dsh-base` when
absent. It writes the profile's empty `cordis.yml` root on each boot, as the
upstream launcher does, and applies bundle layers followed by the profile user
patch layer. Model routes and credentials remain ordinary DSH profile/settings
configuration.

## Verification

- A real profile boot exposes `ctx.sessions` and `ctx.agents` in the same root
  passed to `prepare`.
- A missing profile is initialized exactly once without overwriting its user
  patch.
- Failed `prepare` or profile activation disposes the partial root.
- Repeated boot/dispose has no remaining Loader entries, socket owners, or
  lease records.
- TUI direct boot uses this runtime and preserves single profile ownership.
