# Tasks: ACRYL v0.1.0-alpha.1 release readiness

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md).

## Gate rule

Ship the alpha only once a local unsigned artifact is built and smoke-checked
for a target. Do not add CI until a local build is reliable. A checkbox is
checked only after its focused command, commit, and evidence are complete.

## Tasks (dependency-ordered)

- [x] R001 Record release research facts (electron-builder 26.15.7, `mac.target
  ["dir"]`, existing packaging scripts, `ci.yml`/`release-candidate.yml`) in
  `research.md`.
- [ ] R002 Build an unsigned macOS `.app` locally via
  `corepack pnpm --filter dsh-plugin-desktop run dist:mac-smoke` for arm64 (host)
  and x64; record the artifact + command output in `evidence/`.
- [ ] R003 Build an unsigned Windows artifact locally via
  `corepack pnpm --filter dsh-plugin-desktop run dist:win`; record in `evidence/`.
  Verify whether the toolchain supports x86/ia32; if not, record the blocker and
  keep Windows x64 only.
- [ ] R004 Add the `linux` electron-builder target (deb/AppImage) for ARM64 + x64
  to `dsh-plugin-desktop/package.json` `build.linux`; build locally per arch and
  record in `evidence/`.
- [ ] R005 Add executable smoke checks: `acryl --version`,
  `acryl tui --json`, web startup/health (DSH web over an ACRYL profile), and
  desktop startup where headless-safe. Wire them as a local verify script.
- [ ] R006 Extend `.github/workflows/release-candidate.yml` to build mac + linux
  artifacts as GitHub Actions artifacts (Windows already present); keep it
  `workflow_dispatch` + `v*` tag triggered, no published release.
- [ ] R007 Record the release handoff (per-target artifact + smoke output) in
  this ledger's `evidence/` and mark this ledger complete.

## Dependencies

```text
R001 -> R002, R003, R004 -> R005 -> R006 -> R007
```

## Definition of done

A locally built unsigned `v0.1.0-alpha.1` artifact per reachable target with
headless-safe smoke evidence, produced by a manually triggered prerelease
workflow, and no published release or GUI/Web parity claim.
