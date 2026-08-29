# Implementation Plan: ACRYL v0.1.0-alpha.1 release readiness

**Design.** One runtime, three entrypoints. The alpha is unsigned; artifacts are
built by the existing per-OS packaging scripts, verified by headless-safe smoke
checks, and produced by a manually triggered prerelease workflow via GitHub
Actions artifacts. No published release.

**Order (gated by local reliability — do not build CI until a local artifact is
smoke-checkable):**

1. **Package the three entrypoints** — `acryl tui` (shipped), `acryl gui`
   (`dsh-plugin-desktop`), `acryl web` (DSH web over an ACRYL profile; or
   document using `dsh --profile web` if the `acryl web` CLI stays unimplemented).
2. **Ensure the mac + Windows unsigned build** works locally
   (`dist:mac-smoke`, `dist:win`) and add the **Linux** target
   (`build.linux` deb/AppImage) to the electron-builder config for ARM64 + x64.
3. **Add executable smoke checks** (headless-safe where possible):
   `--version`, `tui --json`, web startup/health, desktop startup.
4. **Wire a prerelease workflow** that uploads artifacts as GitHub Actions
   artifacts (extend `release-candidate.yml` to mac + linux; keep Windows).
5. **Record evidence** in this ledger's `evidence/` (per-OS artifact + smoke
   output), then mark the ledger complete. No GitHub release, no signing.

**Boundaries.** No ACRYL Runtime/agent semantics change for packaging. No
notarization/code-signing. No store publication. Do not fork runtime behavior.

**Acceptance proof.** A locally built unsigned artifact per reachable target;
`git diff --check` clean; the smoke checks pass headless-safe; artifacts uploaded
by the prerelease workflow.
