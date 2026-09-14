# ACRYL Ship ASAP Checklist

Goal: Identify the minimum set of tasks to release ACRYL as a stable product.

## Release Scope

**What ships:** ACRYL product (Desktop, Web, CLI) with:
- Universal hot-reload for plugins (spec 032, shipping-grade)
- Three surfaces with parity: Desktop, Web, CLI
- Plugin hot-reload across all three (verified 2026-09-13/14)
- Market plugin install (spec 034, at T005)
- BLENDS runtime contract (spec 033, at B0, research complete)

**What does NOT ship:** BLENDS Differentiation Engine, catalog, blueprints, white-label apps (those are Blends product, separate repo).

---

## Release Readiness Checklist

### Versioning & Tagging (✓ or ✗)

- [ ] Decide version number (current is 0.1.37 from 2026-09-11)
  - Is this a 0.2.0 (minor bump, spec 032/034 landed)?
  - Or 1.0.0 (major, declaring API stability)?
  - Document the decision in `docs/VERSION-STRATEGY.md`

- [ ] Tag strategy
  - Commit SHAs pinned in `docs/DEVELOPMENT-LOG.md` (already done)
  - Create `git tag` for release (e.g., `v0.2.0`, `desktop-v0.2.0`)
  - Push tags to origin

- [ ] Package versioning
  - Root `package.json` version sync'd with release tag
  - All workspace packages bumped consistently
  - Verify `pnpm -r list --depth 0` shows consistent versions

### CI/CD & Release Pipeline (✓ or ✗)

- [ ] GitHub Actions: CI gates passing for all platforms
  - `pnpm run check` (root) green
  - `pnpm --filter acryl-desktop run check` green ✓ (fixed 2026-09-14)
  - Desktop release build (`apps/acryl-desktop/scripts/release-mac.ts`)
  - Web deployment (if applicable)
  - CLI npm publish

- [ ] Release automation
  - Do we auto-publish to npm? Manual step?
  - DMG signing and notarization: credentials stored securely?
  - GitHub Releases: auto-created or manual?

- [ ] Rollback plan
  - If a release is broken, can we pull it and re-release?
  - Documented in `docs/RELEASE-PROCESS.md`

### Product Documentation (✓ or ✗)

- [ ] User-facing docs
  - `README.md`: accurate, links to live site
  - Installation guide (npm, DMG, Windows installer)
  - Getting started tutorial
  - Feature overview

- [ ] Developer documentation
  - `AGENTS.md`: complete and accurate ✓ (updated 2026-09-14)
  - `CLAUDE.md`: complete ✓
  - `docs/cordis/cordis_system_guide_for_coding_agents.md`: current
  - Plugin development guide
  - Spec index (`specs/*/spec.md`) all current or explicitly superseded

- [ ] Known issues / limitations
  - Documented in `docs/KNOWN-ISSUES.md` or similar
  - GitHub issues marked `known-limitation`
  - No surprise regressions on day 1

### Feature Parity (✓ or ✗)

- [ ] Desktop surface
  - Core features: chat, code, file browser
  - Plugin install + hot-reload ✓ (spec 034 T005, live-tested)
  - Market integration
  - Settings/preferences UI complete

- [ ] Web surface
  - Core features reach parity with Desktop?
  - Plugin install + hot-reload ✓ (spec 034 integrated, untested in GUI)
  - Deployment pipeline ready

- [ ] CLI/TUI surface
  - Core features: chat, code execution
  - Plugin install + hot-reload ✓ (spec 034 T006, PTY-tested)
  - Help/man pages complete

### Testing & QA (✓ or ✗)

- [ ] Unit tests
  - All `pnpm test` suites passing ✓
  - Known pre-existing test failures documented (e.g., 4 failures in acryl-harness-runtime are pre-existing, not regressions from this release)

- [ ] Integration tests
  - Desktop smoke tests passing ✓ (`verify:loader`, `verify:profile`)
  - Web smoke tests exist and passing?
  - CLI smoke tests passing ✓

- [ ] Regression testing
  - Manual sanity check on major flows (Desktop: plugin install → hot reload → restart)
  - Screenshot/video record of happy path for support/marketing

- [ ] Platform testing
  - macOS Intel + ARM64 ✓ (release pipeline handles universal binary)
  - Windows 10/11 (installer, security dialogs, permissions)
  - Linux (if shipping, or explicitly opt-out)

### Security & Compliance (✓ or ✗)

- [ ] Code signing
  - Desktop binary signed + notarized (Apple)
  - Windows installer signed (if shipping)

- [ ] Dependency audit
  - `npm audit` or `pnpm audit` clean (or documented exceptions)
  - Vendored upstream (`deepseek-harness/`) pinned and not auto-updated

- [ ] Credential/secret hygiene
  - No API keys in `package.json`, `.env` examples, or `.acryl/` defaults
  - OAuth app ids documented; user instructed to register their own (per memory: OAUTH app registration task pending)
  - Release scripts do not leak secrets to logs

### Known Blockers (from earlier session context)

- [ ] OAuth app registration
  - **Status:** User needs to register own OAuth apps with Anthropic/OpenAI/GitHub
  - **Issue:** Desktop/CLI/Web all show placeholder `pi.dev` client IDs
  - **Action:** Document in `docs/SETUP.md` or `README.md`; provide migration guide for users who were using AMIDE/Prime Agent branding

- [ ] AMIDE → ACRYL transition
  - **Status:** Earlier session rebrand from AMIDE back to ACRYL (acryl-padsh repo, separate task)
  - **Issue:** If users have AMIDE config/data, do we provide migration? Or fresh start?
  - **Action:** Document in release notes

- [ ] Graft repo indexing
  - **Status:** Built and indexed (95% coverage, acceptable per user direction)
  - **Issue:** This is a dev/internal tool, not user-facing
  - **Action:** Verify graft is in `.gitignore` or not shipped with Desktop binary

---

## Release Checklist Summary

**Must have before ship:**
- [ ] Version number decided + tagged
- [ ] `pnpm run check` green ✓ (confirmed 2026-09-14)
- [ ] `apps/acryl-desktop run check` green ✓ (confirmed 2026-09-14)
- [ ] README.md updated with current info
- [ ] Known pre-existing test failures documented (not hiding new regressions)
- [ ] Desktop plugin hot-reload verified ✓ (spec 034 T005, live-tested 2026-09-14)
- [ ] Web/CLI parity confirmed or explicitly scoped out of 0.2.0
- [ ] OAuth placeholder client IDs documented as user's-own-apps required
- [ ] Release notes drafted (features, known issues, setup)

**Nice to have (can defer to 0.2.1):**
- [ ] Windows testing/signing
- [ ] Linux support decision + testing
- [ ] Blueprint/white-label catalog preview (deferred, Blends product)
- [ ] BLENDS Differentiation Engine (deferred, B1/B2/B3 phases)

---

## Next Steps (Prioritized)

1. **Clarify scope** — What platforms ship with 0.2.0? (macOS only? Windows included? Linux?)
2. **Test Web/CLI in GUI** — Are we feature-parity-ready or scope-limited?
3. **Draft release notes** — Summary of what changed, known issues, setup instructions
4. **Decide BLENDS timeline** — Do B1/B2/B3 happen before 0.2.0 or after?
5. **Create GitHub Release** — Finalize version number, tag, publish

---

## Related Documents

- `docs/DEVELOPMENT-LOG.md` — chronological log of all work
- `docs/VERSION-STRATEGY.md` — (to be written) versioning decision
- `docs/RELEASE-PROCESS.md` — (to be written) step-by-step release procedure
- `KNOWN-ISSUES.md` — (to be written) known limitations and workarounds
- `specs/032-universal-hot-reload/` — shipping-grade hot-reload spec
- `specs/033-acryl-blends-runtime-contract/` — Blends runtime work (not shipping in 0.2.0)
- `specs/034-acryl-market/` — plugin market (shipping in 0.2.0)
