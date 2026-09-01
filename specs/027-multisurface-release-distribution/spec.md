# Feature Specification: Coordinated Multi-Surface Distribution

**Feature Branch**: `027-multisurface-release-distribution`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Make `npm i -g acryl` the fastest way to try the ACRYL TUI. Distribute lean, target-ready CLI runtimes through npm; distribute Web on demand through the matching release; release CLI, Web, and Desktop together from one versioned shared capability baseline. The target platform executable must contain a lean, already-prepared TUI runtime so first use is fast."

## User Scenarios & Testing

### User Story 1 - Install and run the coding-agent TUI (Priority: P1)

A developer installs ACRYL with one standard package-manager command and immediately starts the interactive TUI coding agent.

**Why this priority**: This is the fastest, primary product trial path. It must not make a developer wait for a broad runtime dependency graph, native builds, or an unrelated Web/Desktop payload.

**Independent Test**: On a clean machine state for each supported operating-system and CPU target, install the public `acryl` package and launch `acryl` until the interactive prompt is usable.

**Acceptance Scenarios**:

1. **Given** a supported clean machine, **When** the developer runs `npm i -g acryl`, **Then** installation obtains only the matching ready-to-run CLI runtime and its small launcher, not Web or Desktop runtime payloads.
2. **Given** installation has completed, **When** the developer runs `acryl`, **Then** the TUI becomes interactive without downloading, compiling, or installing additional runtime dependencies.
3. **Given** the package manager does not install the matching target runtime automatically, **When** installation completes, **Then** it fails with an actionable recovery message and never launches an incompatible runtime.

---

### User Story 2 - Acquire the Web surface only when requested (Priority: P2)

A developer who installed the TUI later requests the local browser surface using `acryl web`.

**Why this priority**: The browser surface remains a first-class ACRYL product surface, while developers who only need a terminal do not pay its download or installation cost.

**Independent Test**: With only the CLI runtime installed, run `acryl web`; verify that the matching Web runtime is acquired, verified, started, and reused on the next invocation.

**Acceptance Scenarios**:

1. **Given** the matching Web runtime is absent, **When** the developer runs `acryl web`, **Then** ACRYL identifies the Web artifact with the exact same release version and target as the installed CLI.
2. **Given** a Web download is required, **When** the developer confirms acquisition (or supplies the non-interactive confirmation option), **Then** ACRYL verifies the downloaded artifact before running it.
3. **Given** a verified matching Web runtime is already installed, **When** the developer runs `acryl web`, **Then** it starts without another download.
4. **Given** the matching Web artifact is unavailable or invalid, **When** the developer requests Web, **Then** the CLI reports the precise version/target failure and preserves the working TUI installation.

---

### User Story 3 - Receive a coherent release across all surfaces (Priority: P2)

A developer can choose CLI, Web, or Desktop from one ACRYL release knowing every surface contains the same compatible shared coding capabilities.

**Why this priority**: A feature must not silently ship to one surface while another surface remains incompatible or absent.

**Independent Test**: For one tagged release, verify the release inventory, versions, checksums, and surface boot checks for all supported CLI/Web targets and Desktop installers.

**Acceptance Scenarios**:

1. **Given** an ACRYL release is prepared, **When** its publication gates run, **Then** CLI, Web, and Desktop artifacts are all built from the same release version and shared capability baseline.
2. **Given** a shared coding capability is added, **When** the release is built, **Then** every surface declared to support that capability boots and passes its capability-level verification before publication.
3. **Given** a required surface artifact fails to build, verify, or match the release version, **When** publication is attempted, **Then** the release is not presented as complete.

---

### User Story 4 - Use a native installer channel (Priority: P3)

A developer can install the same ready-to-run CLI through the project installer or Homebrew without triggering a Node dependency installation.

**Why this priority**: Developers should choose their normal installer channel without receiving a materially different product or a slower, script-heavy installation.

**Independent Test**: Install the CLI from the project installer and from the maintained Homebrew formula, then verify its version and TUI launch against the release artifact checksum.

**Acceptance Scenarios**:

1. **Given** the developer runs the documented project install command, **When** the current target is supported, **Then** the installer selects, verifies, and installs the matching CLI release artifact.
2. **Given** the developer installs ACRYL through the maintained Homebrew formula, **When** installation completes, **Then** it uses a verified prebuilt CLI release artifact and does not run a package dependency install at user install time.

### Edge Cases

- The installer must reject an artifact whose declared target, version, or integrity value does not match the selected release.
- Interrupted downloads must not replace a previously working CLI or Web runtime.
- An existing CLI must remain usable if optional Web acquisition fails.
- A package manager may omit optional target packages or suppress lifecycle hooks; installation must identify this condition and provide a deterministic recovery path.
- A user may request a specific release version; all selected CLI, Web, and Desktop artifacts for that request must be version-compatible.
- An unsupported OS, CPU, or system-library target must fail before download with an actionable explanation.

## Requirements

### Functional Requirements

- **FR-001**: The public `acryl` package MUST be a small target selector/launcher rather than a full multi-platform application dependency tree.
- **FR-002**: Installing `acryl` through npm-compatible package managers MUST select and install only one matching, ready-to-run CLI target runtime.
- **FR-003**: The selected CLI target runtime MUST contain a lean, already-prepared TUI coding-agent runtime and MUST NOT require first-run dependency installation, native compilation, Web acquisition, or Desktop acquisition before becoming interactive.
- **FR-004**: The CLI target runtime MUST exclude the Web runtime and Desktop runtime from its installed payload.
- **FR-005**: The `acryl web` command MUST acquire and run only the Web target runtime that matches the CLI release version and machine target; it MUST reuse a verified installed runtime when present.
- **FR-006**: Each release MUST publish a machine-readable inventory containing the release version, supported targets, artifact locations, integrity values, and surface identity for CLI, Web, and Desktop artifacts.
- **FR-007**: Every public release artifact and public package version MUST identify the same release version and compatible shared ACRYL capability baseline.
- **FR-008**: A shared capability may be declared released only after each of its declared TUI, Web, and Desktop compositions passes boot and feature-level verification.
- **FR-009**: The release process MUST create ready-to-run CLI and Web target artifacts for every supported target and Desktop installers for every supported desktop target.
- **FR-010**: The project installer and maintained Homebrew CLI formula MUST consume verified ready-to-run CLI artifacts, not execute a general-purpose production dependency installation on the user machine.
- **FR-011**: Release verification MUST measure a clean-machine install-to-interactive-TUI journey and prevent regression beyond the approved performance and installed-size budget.
- **FR-012**: The runtime composition shared across surfaces MUST consume native DeepSeek Harness/Cordis seams and must not recreate a parallel session, context, preset, authorization, or capability framework.

### Key Entities

- **Release manifest**: The authoritative inventory of a single ACRYL version's target artifacts, integrity information, and compatible surface/capability baseline.
- **Target runtime**: A ready-to-run CLI or Web payload for exactly one operating-system and CPU target.
- **Surface capability declaration**: The release-verifiable statement of which surfaces support a shared coding capability.
- **Managed runtime store**: The user-local, versioned location holding verified acquired CLI or Web target runtimes.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On every supported target, a clean `npm i -g acryl` installs only the launcher and one matching CLI target runtime, and no Web or Desktop target runtime is installed.
- **SC-002**: On every supported target, the clean install-to-interactive-TUI journey completes within the approved release performance budget with no dependency installation, compilation, or download after `acryl` is invoked.
- **SC-003**: On every supported target, the installed CLI payload stays within the approved installed-size budget and does not regress above that budget in a release.
- **SC-004**: `acryl web` downloads no data when a verified matching Web runtime is already present and starts the local Web surface successfully.
- **SC-005**: Every published release has verified CLI and Web target artifacts plus Desktop installers for its declared supported targets, all carrying the release version.
- **SC-006**: A failed target build, integrity check, or declared-surface capability verification blocks complete-release publication.

## Assumptions

- Initial supported targets are the targets already covered by the current CLI and Desktop release matrices; additions require an explicit compatibility decision.
- GitHub Releases are the canonical inventory and direct-download source for target artifacts. npm and Homebrew are installer channels for the same versioned artifacts.
- `acryl-web` remains available as an explicit package-manager install for automation and advanced use, while `acryl web` uses the matching managed Web artifact.
- Desktop remains an explicit installer choice and is never included in the CLI target runtime.
- The existing `025-acryl-runtime-distribution` scope is superseded where it requires the base CLI to include `acryl web` and excludes release-CI expansion. This milestone replaces that distribution contract.
- The exact supported-target matrix, installed-size budget, and install-to-interactive time budget will be established from clean target measurements during planning before implementation begins.
