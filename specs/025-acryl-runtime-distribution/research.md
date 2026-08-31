# Research: Runtime and Distribution Milestone

## Decision: Treat ACRYL as one runtime with three adapters

**Rationale**: The current TUI boot path creates a normal local DSH/Cordis root; standalone Web boots DSH's Web profile; Desktop boots an enhanced DSH Web host in Electron. Durable DSH records already provide cross-launch continuity. The duplicated concern is host composition and surface access, not a need for three agent products.

**Alternatives considered**:

- Keep independent TUI/Web/Desktop boot implementations: rejected because profile semantics and lifecycle fixes drift.
- Make Electron a terminal wrapper: rejected because it has a real Web client and native integration responsibilities.
- Introduce a daemon first: rejected because it adds ownership and transport complexity before core compatibility is demonstrated.

## Decision: Ship a terminal core, then optional capability bundles

**Rationale**: The measured CLI closure contains Web UI/server packages, package management, Canvas and native payloads unrelated to an ordinary terminal session. Cordis already supports capability composition and lifecycle disposal. The terminal core must remain usable without optional capability packages.

**Alternatives considered**:

- Keep one maximal runtime and prune only files: rejected because dependency ownership remains unclear and optional feature updates still affect every user.
- Separate every minor feature into a package: rejected because it creates shallow package fragmentation. Split only at independently enabled/replaced lifecycle and distribution boundaries.

## Decision: Prune release artifacts only with explicit manifests

**Rationale**: Direct deletion of maps, types, package sources, docs, or native files can break dynamic Node resolution, licensing, and runtime assets. A generated artifact manifest can prove what is permitted for each target before pruning and detect regressions in CI.

**Alternatives considered**:

- Broad shell deletion patterns: rejected as unsafe and difficult to review.
- Accept all dependency-published files: rejected because foreign native payload, maps, tests, and unsupported Electron locales are measurable product waste.

## Decision: Retain a bundled Node CLI rather than copying OpenCode's Bun executable strategy

**Rationale**: DSH/Cordis and its native modules are Node-owned. The current portable archive already proves no-host-Node operation. A target-specific Node runtime plus a minimized production closure meets the product goal without introducing a second runtime ecosystem.

**Alternatives considered**:

- Require host Node: rejected because direct installers must work for non-Node users.
- Recompile under Bun: rejected because compatibility, dynamic plugins, and native dependency loading would be an unrelated runtime migration.

## Decision: Adopt an explicit local server only after core/surface contracts stabilize

**Rationale**: OpenCode demonstrates that a common server/client model supports TUI, Web, and Desktop attachment. ACRYL's current direct launch is simpler and works. The server must be additive, loopback-only, version-checked, and disposable until simultaneous surfaces or background work are proven user needs.

**Alternatives considered**:

- Build leases, distributed fencing, and daemon recovery now: rejected by the current runtime contract as speculative complexity.
- Let clients create competing roots while an endpoint exists: rejected because it violates durable lifecycle ownership.
