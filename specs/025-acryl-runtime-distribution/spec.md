# Feature Specification: ACRYL Terminal Runtime Distribution

**Feature Branch**: `025-acryl-runtime-distribution`
**Created**: 2026-08-31
**Status**: Re-scoped after distribution review

**Input**: Make the actual `npm install -g acryl` product terminal-first and measurably lean. Archive and Desktop reductions remain valuable, but do not count as an npm-install win. Web, Market, Development Canvas, shared remote-runtime, and attach-server work are explicitly out of scope until a real user need and a separate spec justify them.

## User Scenarios & Testing

### User Story 1 - Install a lean terminal agent (Priority: P1)

As a terminal-first user, I can install `acryl` globally and start the normal durable TUI session without downloading browser UI, Marketplace/package-manager, Development Canvas, or Desktop-only runtime packages.

**Independent Test**: From an empty temporary prefix and cache-safe temporary directory, pack the candidate, run `npm install -g <tarball>`, then run the installed `acryl --version` and `acryl tui --json`. Record direct dependency count, complete installed package count, files, bytes, and wall time against the same v0.1.17 baseline method.

**Acceptance Scenarios**:

1. Given a clean machine prefix, when a candidate tarball is globally installed, then the installed binary successfully runs `acryl --version` and `acryl tui --json` without symlinking source files.
2. Given the candidate package manifest, when its production closure is inspected, then it excludes Web/client UI, Marketplace/package-management, Development Canvas, and Desktop-only packages from the base `acryl` dependency closure.
3. Given the existing authorization-enabled terminal profile, when a user starts the terminal surface, then durable-session, login, tool, cancellation, and resume behavior remains available.
4. Given a terminal archive for one operating-system/CPU target, when extracted with no host Node installation, then its launcher passes readiness and contains no foreign native payload.

### User Story 2 - Publish only a proven terminal closure (Priority: P2)

As a release maintainer, I can publish `acryl` only after its packed tarball has passed clean-install evidence and package-manifest closure checks.

**Independent Test**: Release CI packs the same candidate that would be published, globally installs that tarball into a clean prefix, executes the installed binary checks, emits the measurement record, and rejects budget regressions.

**Acceptance Scenarios**:

1. Given a release candidate, when CI prepares npm publication, then it tests the packed tarball rather than a local symlink or workspace entrypoint.
2. Given a candidate's package manifest, when package count or bytes increase beyond budget, then publication fails with the compared baseline and actual measurements.
3. Given a package needed by the terminal Loader profile, when the manifest is reduced, then clean installed boot proves no `MODULE_NOT_FOUND` is introduced.

### Edge Cases

- Payload pruning must retain license notices, runtime-loaded assets, target-native modules, and all files required for Node resolution.
- A package archive built on one platform must not contain another platform's native executable or dynamic library.
- The production test must use an isolated temporary prefix and not inherit a globally installed `acryl`, workspace symlink, or reusable npm cache.
- No optional install/enable/plugin-manager UX is introduced by this milestone. Richer surfaces remain Desktop-owned opt-in behavior, not base CLI features.

## Requirements

- **FR-001**: Base `acryl` MUST be terminal-first and MUST NOT declare or transitively require Web/client UI, Marketplace/package-manager, Development Canvas, or Desktop-only packages.
- **FR-002**: The terminal Loader declarations and profile composition MUST be reduced by manifest-level package ownership so that the published npm dependency map contains only the verified terminal closure. Merely changing dependency-map generation is insufficient.
- **FR-003**: Release CI MUST pack the candidate package, install that tarball globally into an empty temporary prefix, and execute the installed `acryl --version` and `acryl tui --json` checks before npm publication.
- **FR-004**: The clean-install evidence MUST record direct dependency count, complete installed package count, file count, installed bytes, tarball bytes, and installation wall time using the same method for baseline and candidate.
- **FR-005**: The candidate MUST meet explicit reduction budgets against the recorded v0.1.17 baseline while preserving authorization-enabled TUI, durable session, tool, cancellation, and resume acceptance coverage.
- **FR-006**: Target-specific terminal archives MUST reject foreign operating-system/CPU native payloads and exclude release source maps/development-only files unless a documented runtime requirement justifies them.
- **FR-007**: Desktop artifacts MUST include only supported application localizations and target-required native payloads while retaining Desktop runtime behavior.
- **FR-008**: Public/shared contracts introduced by this milestone MUST NOT expose a raw Cordis `Context` root.
- **FR-009**: RuntimeCapability metadata for permissions, provenance, and client contributions is out of scope. No speculative capability schema is introduced.

## Key Entities

- **NPM Install Evidence**: A reproducible clean-install measurement containing candidate tarball identity, direct and complete package counts, files, bytes, wall time, installed-binary checks, and baseline comparison.
- **Terminal Closure**: The explicit package-manifest and Loader/profile dependency set required for the authorization-enabled durable TUI, and nothing else.
- **Artifact Manifest**: The inspected target-specific release payload inventory, including platform, architecture, permitted native files, excluded classes, byte budget, and verification result.

## Success Criteria

- **SC-001**: The real clean global install of the candidate package passes `acryl --version` and `acryl tui --json` with no workspace symlinks or global fallback.
- **SC-002**: Candidate npm evidence shows a reduction of at least 20% in installed bytes and complete installed package count from the recorded v0.1.17 baseline, with no increase in clean-install wall time beyond 10%.
- **SC-003**: The published package's direct dependency count is derived from the explicit terminal closure and is lower than the v0.1.17 536-direct-dependency baseline.
- **SC-004**: Every target-specific terminal archive passes readiness and contains zero foreign-platform native package directories.
- **SC-005**: Desktop target artifacts remove foreign native payloads, owned release maps, and unsupported language resources.

## Deferred Follow-up Specifications

The following are deliberately excluded and require a separate evidence-backed product spec before implementation:

- Optional Web, Marketplace/package-manager, and Development Canvas distribution/activation.
- A cross-surface shared runtime facade or remote transport API.
- `acryl serve`, loopback endpoints, attach/detach clients, and persistent runtime ownership.
- External capability distribution metadata, permissions, provenance, or client-contribution schemas.
