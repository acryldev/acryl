> **Update 2026-10-01.** Week estimates and success percentages in this file are not supported by evidence. See [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md) for measured results, the Option A (Node host, Electrobun shell) and Option B (Host in Bun) split, and the experiment ladder.

# Feature Specification: Electrobun Optimization

**Tracking**: TBD (will be filed on GitHub when prioritized)

**Feature Directory**: `specs/042-electrobun-optimization`  
**Created**: 2026-09-29  
**Status**: `needs-triage` — this is a **research-to-decision** milestone, not an implementation commitment. The spike determines whether migration is realistic.

**Authority**: `.specify/memory/constitution.md` (architecture decisions), root `CLAUDE.md` (framework independence), `specs/041-agent-control` (self-extension architecture that must survive).

---

## One-line

Migrate ACRYL from Electron to Electrobun (pre-1.0 Electron alternative using Bun + WebKit) to reduce bundle size, improve startup speed, and reduce maintenance surface.

---

## Why this exists

**Electron is heavy**: ~170MB download, large memory footprint, slow startup on cold machines, dependency on Chromium version tracking.

**Bun is fast**: Startup <100ms on warm runs, small binary (~100MB), simpler runtime model.

**Electrobun is a bridge**: Uses Bun as the runtime and WebKit (native platform) instead of bundled Chromium. ACRYL's React UI and Node-based Cordis could theoretically run unchanged.

**Open question**: Is it worth the effort? This spec answers that question.

---

## Scope and what's NOT in scope

### In scope

- Feasibility assessment: can ACRYL's architecture (Cordis, hot-reload, plugin system) work on Bun?
- Migration effort estimate: if we did it, how long and what are the unknowns?
- Spike: validate the single biggest blocker (Cordis module cache on Bun)
- Decision: commit/defer/reject

### Not in scope (post-decision work)

- Actual migration (that's a separate spec if approved)
- Maintenance burden after 1.0
- Community building around Electrobun
- Performance tuning on the new runtime
- Auto-updater redesign (Electron's built-in auto-updater is convenient)

---

## Problem statement

**Current state**: ACRYL ships as an Electron app. It works well.

**Issue #1 — Bundle size**: Electron embeds Chromium (~80MB). Users must download a large binary for Desktop. This affects:
- Adoption friction (large download)
- CI/CD artifact storage
- Offline distribution

**Issue #2 — Startup time**: Cold startup is 3-5 seconds. Warm start is <1 second. Users on slow networks/cold machines experience delay.

**Issue #3 — Dependency surface**: Electron updates tracked separately from Bun/Node. Extra moving part.

**Electrobun promise**: Same UX, smaller binary, faster startup, one less runtime to manage.

**The doubt**: Electrobun is pre-1.0. Is it stable enough? Will ACRYL's Cordis plugin system (the soul of the app) survive the migration?

---

## Success criteria

### Spike success (T001-T003, go/no-go decision)

- [ ] **T001 passes**: Cordis hot-reload works on Bun under 100 reload cycles with no leaks or double-registration
- [ ] **T002 passes**: node-pty can be replaced (existing library OR feasible bridge identified)
- [ ] **T003 passes**: Electron API surface is 1:1 mappable (no missing APIs ACRYL actually uses)

**Go decision**: All three pass cleanly. Spike produces effort estimate and risk assessment. Stakeholders decide whether to proceed.

**No-go decision**: Any one fails without a clear workaround. Migration is deferred or rejected.

---

## If we migrate (post-decision work)

### Quantifiable targets (Phase 1)

- [ ] Bundle size: <150MB (current ~170MB with Electron)
- [ ] Cold startup: <3 seconds (currently ~4-5)
- [ ] Hot reload still works: plugins enable/disable without restart
- [ ] All ACRYL features intact: Chats, Projects, Terminal, Diff, Settings, market plugins

### Qualitative targets

- [ ] Parity with current Electron experience
- [ ] No loss of accessibility or keyboard navigation
- [ ] macOS, Windows, Linux all tested
- [ ] Auto-update story clear (Electrobun native, third-party, or manual)

---

## User stories

### US1: Faster adoption

A new user downloads ACRYL. Current: 170MB file, 4-5 second launch. Post-migration: <150MB, <3 seconds.

**Outcome**: Faster adoption, especially on mobile hotspots or slow networks.

### US2: Lighter infrastructure

ACRYL's CI/CD stores built artifacts. Current: ~170MB Electron bundles (macOS, Windows, Linux). Post: ~140MB per platform.

**Outcome**: 10-20% CI/CD storage savings, faster artifact upload/download.

### US3: Cordis plugins still work

Agent Control, marketplace plugins, custom plugins all still load and hot-reload on the new runtime.

**Outcome**: No loss of extensibility or dynamic behavior. ACRYL's core value (self-extending ADE) survives.

---

## Out of scope

- Designing new Electrobun features (that's upstream work)
- Building an Electrobun community
- Teaching others how to use Electrobun
- Post-1.0 performance tuning
- Alternative runtimes (Tauri, NW.js, etc.)

---

## Open questions (research phase)

1. **Does Bun's module cache work like Node's under hot-reload?** (Critical for Cordis)
2. **Is there an existing Bun/Electrobun PTY solution?** (node-pty replacement)
3. **Do all Electron APIs ACRYL uses map 1:1 to Electrobun?**
4. **What's the WebKit fragmentation risk?** (macOS WebKit, Windows WebView2, Linux WebKitGTK)
5. **How stable is Electrobun pre-1.0?** (What's the breaking change risk?)
6. **Can we ship a dual-binary release?** (Electron + Electrobun options for users)

---

## Non-requirements

- Zero-downtime migration (full cutover is acceptable)
- Backward compatibility with Electron distribution
- Auto-update parity with Electron (can be solved post-migration)
- Performance gains beyond the 10-20% bundle reduction
- Community support from Electrobun team (we own the integration)

---

## Risks and mitigations

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|-----------|
| Cordis hot-reload fails on Bun | Medium | High | Spike T001 validates this first; if fails, defer or patch Cordis |
| node-pty Zig rewrite takes 4+ weeks | Medium | Medium | Spike T002 identifies solution early; if missing, scope to bridge or defer terminal |
| WebKit quirks cause UI bugs | Medium | Medium | Real testing on macOS/Windows/Linux; regression testing suite |
| Electrobun breaking changes post-1.0 | High | Low | Pre-1.0, expected; vendor lock-in accepted as trade-off |
| Performance gains are <5% real-world | Medium | Low | Metrics-driven; if gains don't materialize, revert to Electron |
| CI/CD complexity increases (dual builds) | Low | Low | Can ship Electron-only if dual becomes burden |

---

## How we'll know it worked

### Quantitative (post-migration, if approved)

- Bundle size reduced 10-20%
- Cold startup improved 20-30%
- Hot reload works 100+ times without leak
- 0 regressions in feature tests

### Qualitative

- User feedback: "Launches faster"
- No spike in bug reports from platform-specific WebKit issues
- CI/CD engineers happy with storage/time savings
- Agent Control and plugins still work
- Cordis still hot-reloads

---

## Dependency tree

**Blocks**:
- Nothing (this is research + decision-gating)
- Post-spike: if we go, it gates specs 043+ that depend on Electron being the primary runtime

**Blocked by**:
- Spec 040 (workspace unification) — not blocked, independent
- Spec 041 (Agent Control) — not blocked, already shipped
- Outstanding Cordis documentation — would help, not blocking spike

**Related**:
- Specs 037, 040, 041 all depend on Cordis hot-reload surviving this
- CLI and Web are Node/Bun-agnostic, no changes needed

---

## Timeline if we go

**Spike phase (Week 1)**: Answers the three go/no-go questions  
**Migration phase (if approved)** (Weeks 2-8): Build, test, release  
**Stabilization** (Weeks 9-12): Monitor, patch, compare with Electron baseline

---

## Decision gate

**Do we spike?**

✅ **Yes** if:
- Performance is a real user complaint
- Bundle size matters for Web distribution
- Team wants to validate the technical feasibility before committing

❌ **No** / **Defer** if:
- Electron is working fine and users aren't asking for faster startup
- Cordis hot-reload is considered too risky to test
- Team wants to focus on higher-priority specs (042+)

---

## Specification Status

This spec is a **research proposal**. It does not propose an implementation; it proposes a **spike** to answer key questions. Once the spike is complete, a decision is made:

- **Spike passes, effort acceptable**: Approve for implementation (move to "ready-for-implementation")
- **Spike fails, clear blocker**: Reject or defer
- **Spike passes, effort too high**: Trade-off discussion with stakeholders

The spike itself is the deliverable of this phase.
