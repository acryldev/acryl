# Research: ACRYL Shared Harness Runtime

## Decision 1: Use one repository-owned wrapper around the pinned profile boot

**Decision:** `acryl-harness-runtime` owns profile preparation and calls the
pinned `@deepseek-ai/dsh-app-boot` boot seam once per owning generation.

**Verified facts:**

- `deepseek-harness/apps/cli/src/profile-boot.ts` heals the profile module
  fallback, loads profile and user patch layers, rewrites the empty Loader root,
  and boots one composed Cordis tree.
- The existing runtime package already verifies that a booted profile exposes
  `sessions` and `agents` in one root.
- The existing TUI direct host already passes a `prepare` hook into that root.

**Rationale:** This preserves the upstream configuration model and lets host
services resolve against the same Cordis root as Harness capabilities.

**Alternatives considered:** Copy profile boot fragments into Terminal and
Desktop, rejected because composition, patches, and dependency closure drift.

## Decision 2: Preserve user configuration; rewrite only generated root anchor

**Decision:** Treat the empty profile `cordis.yml` as generated Loader anchor.
Preserve profile patches, home patches, and normal Harness settings files.

**Rationale:** The upstream root rewrite prevents Loader write-back from baking
composed rows into a later boot. User-controlled patches remain above profile
bundle layers.

## Decision 3: Attach through local capability authentication and OS protection

**Decision:** A healthy compatible profile owner publishes a local endpoint and
an owner-generation-scoped random capability token. Unix endpoint permissions
and Windows named-pipe ACL support are required in addition to the token.

**Rationale:** Local same-user filesystem access is the baseline trust boundary;
a capability token prevents accidental or unrelated endpoint access and detects
stale ownership generations. The token is not a provider credential.

**Alternatives considered:** trust any local socket client, rejected because
path reachability is not sufficient authorization; remote HTTP, rejected as out
of scope and unnecessarily expands the threat model.

## Decision 4: Provider authentication stays provider-managed

**Decision:** ACRYL observes authentication availability and reports
re-authentication guidance. Harness profiles and provider CLIs own OAuth/API
key authentication.

**Rationale:** ACRYL must support Claude Code, Codex, OpenCode, Pi, and native
DSH capabilities without extracting, duplicating, or storing their secrets.

## Decision 5: Serial active-control lease, not concurrent writes

**Decision:** Multiple authenticated surfaces may observe the live runtime, but
one explicit active-control lease may submit agent actions. It automatically
releases on disconnect, process death, or control-channel expiry.

**Rationale:** This makes durable action ordering explicit and prevents stale
surfaces from silently retaining control.

## Decision 6: Use native Harness durable sessions and agents

**Decision:** The native bridge creates and resumes only Harness sessions and
uses Harness agent handles. It does not persist terminal scrollback.

**Verified facts:**

- The pinned session suite creates live sessions through `ctx.sessions.create()`
  and persistence integration owns durable session state.
- The pinned Harness test fixtures create agent handles through
  `ctx.agents.create()`.
- Existing `acryl-control` exposes a provider-neutral agent-control service;
  the DSH-native provider is the appropriate consumer/provider adapter.

**Rationale:** This respects the constitution's durable canonical state and
avoids a parallel ACRYL history store.

## Dependency Closure Decision

**Decision:** Keep the selected pinned profile closure declared by
`acryl-harness-runtime`, then reduce its manifest only after a deterministic
profile-load audit proves packages are not required. Do not rely on
`acryl-tui/node_modules` or Desktop's dependency tree.

**Rationale:** The initial direct-host failure was a missing runtime closure,
not Loader ordering. A local package must own the profile it declares.
