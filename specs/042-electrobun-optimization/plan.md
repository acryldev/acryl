> **Update 2026-10-01.** Week estimates and success percentages in this file are not supported by evidence. See [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md) for measured results, the Option A (Node host, Electrobun shell) and Option B (Host in Bun) split, and the experiment ladder.

# Plan: Electrobun Optimization Spike

**Status**: Decision-gating research phase. This plan is for the spike (Week 1), not for implementation.

---

## Spike philosophy

This spec is a **decision gate**, not a commitment to migrate. We spend 1 week validating the three biggest unknowns:

1. **Cordis architecture survives**: Hot-reload on Bun doesn't break the plugin system
2. **PTY replacement exists**: Terminal feature isn't blocked by node-pty
3. **API surface is 1:1**: No critical missing Electron APIs

If all three pass cleanly, migration is "doable" (6-7 weeks, acceptable risk). If any fails without a clear workaround, migration is paused.

---

## Three spikes, three questions

### Spike T001: Does Cordis work on Bun?

**Why it matters**: ACRYL's entire value is plugins (Cordis) and hot-reload. If Cordis breaks, migration is dead.

**The test**:
```
Loop 100 times:
  1. Load Cordis + one plugin
  2. Use the plugin
  3. Unload the plugin
  4. Reload the same plugin
  5. Verify service instances are fresh (not stale)

Monitor:
  - Memory (should not leak)
  - Service registration (no double-registration)
  - Module cache behavior (is it clearing cleanly?)
```

**Setup**:
- Minimal Bun + Cordis project
- One representative plugin (recommend `acryl-ui-control` from spec 041)
- Instrumentation to track service lifecycle

**Output**:
- Pass: "Cordis works on Bun; ready for full migration"
- Needs patch: "Cordis needs small fix to Bun's module cache API; estimated X days to patch"
- Fail: "Bun's module cache semantics incompatible; recommend deferring"

**Estimate**: 2-3 days

---

### Spike T002: What replaces node-pty?

**Why it matters**: Terminal feature is core to ACRYL. If node-pty can't be replaced easily, Terminal is either deferred or migration is blocked.

**The test**:
1. Search Electrobun ecosystem
   - GitHub: `electrobun` org and community
   - npm: `pty`, `bun`, `electrobun` tags
   - Community: Discord, GitHub discussions
2. If found: assess integration effort (1-2 days)
3. If not found: evaluate alternatives
   - Bridge approach (pure JS, external process): effort estimate
   - Zig port: effort estimate + complexity
   - Defer terminal to Phase 2

**Output**:
- Existing solution: "Use X, integration ~2 days"
- Bridge viable: "Build X, effort ~1-2 weeks, reliability risk medium"
- Zig port required: "Full port needed, effort ~3-4 weeks, platform-specific risk"
- Terminal deferrable: "Can ship without Terminal initially; add in Phase 2"

**Estimate**: 1-2 days

---

### Spike T003: Does Electron API surface map 1:1?

**Why it matters**: If critical Electron APIs are missing in Electrobun, integration is painful or impossible.

**The test**:
1. Enumerate all Electron APIs ACRYL uses (already done in research.md)
   - `app.*` (lifecycle, paths)
   - `Menu` (native menus)
   - `Tray` (system tray)
   - `dialog` (file dialogs)
   - `shell` (open external)
   - `BrowserWindow` (window lifecycle)
   - preload + `contextBridge` (IPC security)
2. Cross-reference against Electrobun docs
3. For each API: find Electrobun equivalent or document as gap

**Output**:
- All APIs available: "Straightforward 1:1 mapping; ~5 days to port"
- Minor gaps: "X and Y not available; can defer or work around; overall effort ~6-7 weeks"
- Critical gap: "Z not available and no workaround; recommend deferring or picking alternative"

**Estimate**: 1 day

---

## Decision gate (T010)

**When**: End of Week 1

**Inputs**: Results from T001, T002, T003

**Output**: Go/no-go decision

**Matrix**:

| T001 | T002 | T003 | Decision | Rationale |
|------|------|------|----------|-----------|
| ✅ Pass | ✅ Pass | ✅ Pass | **Proceed** | All unknowns resolved; migration is viable and effort is acceptable |
| ✅ Pass | ✅ Pass | ⚠️ Minor gap | **Proceed** | Can work around minor gaps; overall effort still 6-7 weeks |
| ✅ Pass | ⚠️ Patch needed | ✅ Pass | **Conditional proceed** | Cordis patch is 1-2 weeks; total effort ~8 weeks; acceptable if prioritized |
| ⚠️ Needs patch | ✅ Pass | ✅ Pass | **Conditional proceed** | Same as above |
| ❌ Fail | ✅ Pass | ✅ Pass | **Pause / Reject** | Cordis blocker; recommend deferring until Electrobun 1.0 or Cordis upstream fix |
| ✅ Pass | ❌ Fail | ✅ Pass | **Pause / Reject** | Terminal blocked; either defer feature or defer migration |
| ✅ Pass | ✅ Pass | ❌ Fail | **Pause / Reject** | API gap too large; recommend alternative (Tauri?) or deferring |

---

## Scheduling and team

### Week 1: Spike execution

| Day | Task | Owner | Checkpoint |
|-----|------|-------|-----------|
| Mon-Tue | T001: Cordis on Bun setup + 20 reload cycles | Engineer A | Early signal: does Cordis load? |
| Tue-Wed | T001: Full 100 reload cycles + memory profiling | Engineer A | Decision point: proceed with T002/T003 or block? |
| Wed | T002: PTY audit | Engineer B (parallel) | PTY path identified |
| Wed-Thu | T003: API compatibility audit | Engineer C (parallel) | Electron API gaps documented |
| Fri | T010: Decision synthesis | Tech Lead | Decision + recommendation to stakeholders |

### Parallel execution recommended

- T001, T002, T003 can run in parallel
- All three complete by end of Week 1
- Decision gate clear before Week 2

---

## Risk mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Cordis test setup too complex to finish in 2 days | Low | Start with minimal repo (Cordis + one plugin); can always expand |
| Bun module cache undocumented; hard to debug | Medium | Leverage Bun community (Discord) if issues arise; can pivot to asking Bun maintainers |
| PTY search finds nothing; causes decision paralysis | Medium | Pre-decide: if nothing found by Day 4, assume bridge approach and estimate accordingly |
| API audit misses some edge case | Low | Document what was checked and what wasn't; can revisit post-spike if API gaps emerge during actual port |
| Stakeholders want full implementation, not spike | Low | Clarify upfront: spike is 1 week, implementation is 6-7 weeks; spike derisks the bigger commitment |

---

## What success looks like

**End of Week 1, stakeholders can answer**:
- "Do we have a clear blocker, or is migration viable?" ✅
- "If viable, how long would it take?" ✅ (6-7 weeks likely, or X weeks if conditional)
- "What's the biggest risk?" ✅ (Cordis stability, PTY complexity, etc.)
- "Should we do this, or focus on something else?" ✅ (data-driven decision)

**Failure**: Spike results are inconclusive, stakeholders are uncertain, and 6-7 week migration commitment is made anyway (wasteful).

---

## Post-spike: Concrete Migration Plan (if approved)

If T010 recommends "Proceed," the migration unfolds in 5 phases over 6-8 weeks:

### Phase 1: Build Tooling & Config (1 week)

**What**: Set up Electrobun build, update Vite config, verify webview rendering.

**Concrete actions**:
- [ ] Install Electrobun starter template
- [ ] Port `apps/acryl-desktop/vite.config.ts` to Electrobun's webview builder
- [ ] Update `apps/acryl-desktop/src/preload.ts` to Electrobun's preload API (if changed)
- [ ] Verify React renders in Electrobun webview (headless test)
- [ ] Commit: "build(desktop): migrate build config to Electrobun"

**Blockers**: Vite incompatibilities (unlikely; Bun is Vite-compatible)

---

### Phase 2: Electron API Surface (1 week)

**What**: Replace Electron APIs with Electrobun equivalents (1:1 mapping).

**Concrete API changes** (from research):
- [ ] `apps/acryl-desktop/src/main.ts`: `app.*` → same (no change)
- [ ] `apps/acryl-desktop/src/shell/electron-platform.ts`: `BrowserWindow` → `Window` (constructor slightly different)
- [ ] `apps/acryl-desktop/src/shell/native-menu.ts`: `Menu` → same (no change)
- [ ] `apps/acryl-desktop/src/electron-runtime.ts`: `Tray` → same (no change)
- [ ] `apps/acryl-desktop/src/shell/electron-reveal.ts`: `shell.showItemInFolder()` → same (no change)
- [ ] Type imports: update `import { BrowserWindow } from 'electron'` → `import { Window } from 'electrobun'`
- [ ] Verify: `preload.ts` still uses `contextBridge` (Electrobun supports it)

**Testing**:
- [ ] Run `apps/acryl-desktop` headless smoke test
- [ ] Commit: "refactor(desktop): Electron API → Electrobun equivalents"

**Blockers**: Any missing Electrobun API (identified by T003, rare)

---

### Phase 3: Cordis Hot-Reload (1-2 weeks)

**What**: Validate Cordis connection layer works on Bun. Fix if needed.

**Concrete actions**:
- [ ] Run T001 spike results: if "pass", proceed to integration
- [ ] Verify `apps/acryl-desktop/src/profile.ts` connection setup works with Electrobun's IPC
- [ ] Test: plugin load → enable/disable toggle → reload (real Desktop, not just unit test)
- [ ] If `import.meta.hot.invalidate()` doesn't work, implement cache-bust suffix: `?t=${Date.now()}`
- [ ] Stress test: enable/disable a plugin 20 times rapidly, verify no leaks
- [ ] Commit: "refactor(desktop): Cordis connection layer on Bun"

**Blockers**: Module cache issue in Bun (identified by T001)

---

### Phase 4: node-pty Replacement (1-3 weeks, depends on T002 result)

**What**: Replace node-pty with Bun-compatible solution.

**Option A** (if library exists, ~2 days):
- [ ] Integrate existing Bun/Electrobun PTY library
- [ ] Update `plugins/acryl-workspace/package.json`: replace `node-pty` with `@XXX/pty`
- [ ] Test: open Terminal pane, run `echo "hello"`, verify output
- [ ] Commit: "refactor(workspace): node-pty → Bun PTY library"

**Option B** (if bridge needed, ~2 weeks):
- [ ] Design PTY bridge (external process + WebSocket/REST)
- [ ] Implement: Terminal pane ↔ bridge ↔ external PTY process
- [ ] Update `plugins/acryl-workspace/src/client/terminal/` to connect via bridge
- [ ] Test: multiple terminals, resize, kill, verify cleanup
- [ ] Commit: "refactor(workspace): node-pty → PTY bridge"

**Option C** (if deferring, immediate):
- [ ] Disable Terminal in Electrobun build
- [ ] Add TODO: "Terminal support for Electrobun (Phase 2)"
- [ ] Commit: "feat(desktop): Electrobun MVP without Terminal"

**Blockers**: None if Option A exists; Option B adds time; Option C defers feature

---

### Phase 5: Testing & Validation (1-2 weeks)

**What**: End-to-end testing on real platforms (macOS, Windows, Linux).

**Concrete actions**:
- [ ] Headless smoke test: Desktop launches, renders workspace
- [ ] Platform test: macOS (WebKit), Windows (WebView2), Linux (WebKitGTK)
  - [ ] Windows: verify native menu, tray icons, dialogs work
  - [ ] macOS: verify system integration (menu bar, dock)
  - [ ] Linux: verify GTK integration
- [ ] Feature parity: Chats, Projects, Terminal (if not deferred), Diff, Settings all work
- [ ] Performance: measure cold startup (should be <3 seconds)
- [ ] Memory: check heap stability over 30 min session
- [ ] Accessibility: keyboard navigation, screen reader (if applicable)
- [ ] Commit: "test(desktop): Electrobun platform validation"

**CI/CD**:
- [ ] Update build pipeline: build Electrobun binary alongside Electron
- [ ] Set feature flag: allow users to opt into Electrobun build during beta
- [ ] Monitoring: capture metrics (startup, memory, crash rate) vs. Electron baseline

**Blockers**: Platform-specific WebKit quirks (CSS, DOM differences)

---

## Weekly Milestones (if approved)

| Week | Phase | Deliverable | Go/No-Go |
|------|-------|-------------|----------|
| 1 | Spike (pre-migration) | T001/T002/T003 results + decision | Proceed / Defer |
| 2 | Phase 1 | Electrobun build working, React renders | Proceed |
| 3 | Phase 2 | All Electron APIs mapped + smoke test | Proceed |
| 4-5 | Phase 3 | Cordis hot-reload validated + stress tested | Proceed or patch |
| 6-7 | Phase 4 | PTY replacement integrated | Proceed or defer Terminal |
| 8 | Phase 5 | Platform validation, CI/CD, beta release | Ship |

---

## Concrete Success Metrics

**Bundle size**: <120MB (from current ~170MB; 30% reduction)  
**Cold startup**: <3 seconds (headless measurement, real window)  
**Hot reload**: enable/disable plugin 20x, no memory leak (heap ±10%)  
**Feature parity**: all ACRYL features work on Electrobun (or defer Terminal gracefully)  
**Platform support**: real tests on macOS, Windows, Linux; not just macOS  
**User experience**: identical to Electron build (or better)

---

## Risk Mitigations During Migration

| Risk | Mitigation |
|------|-----------|
| WebKit CSS differences | Early platform testing (Phase 5, start early) + gradual rollout (beta flag) |
| Cordis module cache issue | T001 validates; if issue found, patch before Phase 3 |
| PTY complexity | T002 identifies path; choose option before Phase 4 |
| Performance regression | Measure baseline before launch; revert if <10% improvement |
| User adoption (bundle new app) | Ship alongside Electron for 1 release; deprecate Electron gradually |

---

## Post-Migration (Ongoing)

**Week 9+**: Monitor metrics, user feedback, known issues (WebKit quirks, startup variance).  
**Month 2**: If stable, sunset Electron build. If unstable, roll back.  
**Month 3+**: Upstream Electrobun updates, Bun ecosystem improvements.

---

## Context for the spike

This spike exists because:

1. **Electrobun is pre-1.0**: Less certain than Electron; worth validating before committing
2. **Cordis is critical**: If it breaks, the entire migration fails; must test first
3. **node-pty is a native module**: Unknown replacement path; affects effort estimate
4. **Opportunity cost is real**: 6-7 weeks could be spent on specs 043+, Cordis optimization, etc.

Spike de-risks the bigger decision. 1 week of engineering now prevents 6+ weeks of wasted effort later (if migration was infeasible).
