# ACRYL 0.2.0 — Universal Plugin Hot-Reload

**Released:** 2026-09-14

## What's New

### Universal Plugin Hot-Reload (Spec 032)
- **Live plugin enable/disable** across Desktop, Web, and CLI without restarting
- Cordis Fiber reload with proper disposal ordering (safe state cleanup)
- Cascade rollback on failure (dependent rows automatically disabled)
- Verified across all three surfaces with integration tests

### Plugin Market (Spec 034)
- **Browse and install plugins** from a curated market (Desktop, Web, CLI)
- **Live activation** of installed plugins without app restart
- Market integration with package.json reconciliation
- Community plugin support (dsh-community-fabric, dsh-community-market)

### Platform Parity
- Desktop, Web, and CLI all support hot-reload and market install
- Unified plugin lifecycle (`PluginLifecycleController`)
- Same feature set across all surfaces (no platform-specific limitations)

## Bug Fixes

- Fixed Desktop BLEND path resolution when dev scripts run directly (config-home fragility)
- Fixed temp profile symlink resolution in smoke tests (verify:profile)
- Fixed unnecessary app restart after successful plugin disable/enable

## Known Issues

### Pre-existing Test Failures (Not Regressions)
- `acryl-harness-runtime`: 4 test failures in profile/session-bridge tests (pre-existing, unrelated to 0.2.0 changes)
- These are tracked in the codebase and do not indicate new regressions

### Setup Required

- **OAuth app registration** — Desktop and CLI display placeholder `pi.dev` client IDs. To use Anthropic/OpenAI/GitHub authentication, register your own OAuth app and configure it. See `docs/SETUP.md`.
- **AMIDE → ACRYL transition** — If you used AMIDE previously, configuration data is not automatically migrated. Start with a fresh ACRYL home (`~/.acryl`) or manually migrate settings.

## Breaking Changes

None. This is a backwards-compatible minor release.

## Commits in 0.2.0

- `13ab2fa` fix(desktop): self-sufficient isolated dev DSH_HOME in every dev-mode script
- `42d0aaf` fix(desktop): ensure temp profile home uses isolated package linking
- `2eafd49` docs(adr-0001): BLENDS runtime boundary mapping (B0 research complete)
- `efc7129` docs: ADE-BLEND roadmap — prove BLENDS by shipping ADE
- Plus all commits from spec 032 (hot-reload) and spec 034 (market)

## What's Next

### Roadmap (v0.3.0 and beyond)

**ADE (Agentic Development Environment)** — Building ACRYL's own agent-driven development environment as a concrete BLEND example, proving the "ACRYL + plugins = specialized product" model. See `docs/ADE-BLEND-ROADMAP.md`.

**BLENDS Machinery** — Based on what ADE proves necessary, implementing checkpoint/rollback and state persistence for forkable Blend instances.

**Catalog & White-Label** — Once ADE ships, building Blueprints (pre-configured plugin sets) and a catalog of ready-to-use ACRYL configurations.

## Installation & Support

- **Install**: See `README.md` for Desktop, CLI, and Web installation
- **Docs**: [acryl.dev/docs](https://acryl.dev/docs)
- **Discord**: [Join our community](https://discord.gg/cY9KXMex69)
- **GitHub**: [acryldev/acryl](https://github.com/acryldev/acryl)

## Thank You

Thanks to everyone who tested hot-reload and the plugin market during development. Your feedback shaped this release.

---

**Note**: This is an active-development release. Interfaces and workflows may continue to evolve as we build toward ACRYL's full vision. Feedback and feature requests are welcome on GitHub or Discord.
