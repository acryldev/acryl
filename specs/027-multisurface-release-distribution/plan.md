# Coordinated Multi-Surface Distribution Plan

**Goal:** Make `npm i -g acryl && acryl` install and launch one ready-to-run target TUI runtime, acquire Web only on `acryl web`, and release CLI, Web, and Desktop artifacts from one verified version.

**Architecture:** The CLI npm package becomes a small pure-Node selector. It resolves exactly one OS/CPU-constrained target package containing the existing portable Node-based TUI runtime. The Web runtime remains outside that npm installation and is acquired from the matching versioned GitHub Release manifest on demand. This is distribution plumbing only: all coding-agent behavior continues to compose the pinned DSH/Cordis profiles, with no new runtime or service seam.

**Cordis mini-design:** No new Cordis capability, service, event, provider, or lifecycle owner is introduced. Target payloads launch the existing TUI and Web profile entrypoints. Distribution cache ownership is process/installer code only and never stores sessions, context, credentials, or room state.

## Constraints

- Do not edit `deepseek-harness/`.
- The CLI target payload excludes Web and Desktop runtime payloads.
- Do not claim a lean closure until clean target measurements prove it.
- Publish no package or release until the registry authentication and target-package namespace are verified.
- CLI, Web, and Desktop must share one tag/version and capability baseline.
- Tests must be red before implementation for each new behavior.

## Tasks

1. Add a versioned release contract, target matrix, artifact receipt, and artifact inspection tests.
2. Refactor the proven portable CLI archive builder to emit a target receipt and assemble an OS/CPU-bound npm target package from the expanded payload.
3. Create the pure-Node npm selector with target detection, target runtime validation, and TUI delegation. Replace the current full DSH closure npm manifest with selector-only publication and add clean local-tarball install tests.
4. Build and verify target Web archives using the existing Web entrypoint, receipts, checksums, and no Desktop payload.
5. Add selector-managed `acryl web` acquisition with exact-version manifest validation, checksum verification, atomic extraction, and reuse tests.
6. Expand release CI to build/test target CLI and Web artifacts, generate manifest/checksums, publish immutable npm target packages before the selector, and gate complete release promotion on all surfaces.
7. Replace the stale Homebrew formula separately after a maintained tap and package namespace are verified.

## Preflight ruling

The current npm identity is unauthorized. Implementation and local verification may proceed, but npm target-package namespace verification and release publication are blocked until a valid authorized npm session is restored.
