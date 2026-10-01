> **Update 2026-10-01.** Week estimates and success percentages in this file are not supported by evidence. See [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md) for measured results, the Option A (Node host, Electrobun shell) and Option B (Host in Bun) split, and the experiment ladder.

# Tasks: Electrobun Optimization Spike

**Status**: Research phase only. This is a decision-gating spike, not an implementation commitment.

**Conventions**: Each spike task produces a specific research artifact. No implementation code. After all spikes, a go/no-go decision is made.

---

## Phase 0: Spike (Week 1 - decision gating)

The spike answers three questions:
1. Does Cordis hot-reload work on Bun under stress?
2. Can node-pty be replaced (library, bridge, or port)?
3. Do Electron APIs ACRYL uses map 1:1 to Electrobun?

If all three pass, migration is "doable." If any fails without a clear workaround, migration is deferred.

### Spike T001: Cordis hot-reload validation on Bun

**Goal**: Verify Bun's module cache and dynamic imports can handle Cordis's rapid reload cycles.

**Approach**:
1. Set up minimal Bun + Cordis environment
2. Load a simple plugin, use it, unload it, reload it
3. Repeat 100 times
4. Monitor for:
   - Memory leaks (heap growth should plateau)
   - Double-registration errors (service already exists)
   - Stale references (old service instances lingering)
   - Timing (should be consistent)

**Output**: 
- `research/cordis-bun-validation.md` - detailed findings
  - Module cache behavior on Bun
  - Any workarounds needed for Cordis
  - Stress test results (graphs of memory, timing)
  - Go/no-go assessment

**Success criteria**:
- ✅ 100 reload cycles complete without error
- ✅ No memory leak (heap returns to baseline ±10%)
- ✅ No double-registration
- ✅ Service instances are fresh each reload

**Failure modes**:
- ❌ Bun's `import.meta.hot.invalidate()` doesn't clear module cache like Node does
  - **Mitigation**: Document which Cordis code needs patching; estimate effort
- ❌ Module dependencies don't re-execute on reload (side effects lost)
  - **Mitigation**: Evaluate if Cordis can cache invalidate manually (option 1 from assessment)
- ❌ Memory leak under rapid reload
  - **Mitigation**: Unclear; might require Bun or Cordis changes

**Estimate**: 2-3 days

---

### Spike T002: node-pty replacement audit

**Goal**: Determine if node-pty can be replaced and which path is most feasible.

**Approach**:
1. Search Electrobun ecosystem for existing PTY solution
   - Check Electrobun GitHub, docs, community Discord/forums
   - Search npm for `pty` + `bun` packages
2. If found: assess compatibility and integration effort
3. If not found: evaluate alternatives
   - Option A: Build PTY bridge (pure JavaScript, external process)
   - Option B: Estimate Zig port effort (language, complexity, cross-platform)
4. Document findings and recommendation

**Output**:
- `research/node-pty-replacement-options.md`
  - What solutions exist
  - Effort estimate for each option
  - Recommendation with trade-offs
  - Go/no-go assessment

**Success criteria**:
- ✅ Identified at least one viable replacement path
- ✅ Effort estimate for each path (hours/days)
- ✅ Clear recommendation with trade-offs
- ✅ Decision point clear (e.g., "if bridge, 1-2 weeks; if port, 3-4 weeks")

**Failure modes**:
- ❌ No existing library and bridge seems too complex
  - **Mitigation**: Full Zig port is required (4+ weeks), adds to overall effort
- ❌ Zig approach infeasible (platform-specific blocking issues)
  - **Mitigation**: Terminal feature deferred to Phase 2; ship without it initially

**Estimate**: 1-2 days

---

### Spike T003: Electron API surface compatibility

**Goal**: Confirm all Electron APIs ACRYL actually uses are available in Electrobun.

**Approach**:
1. Enumerate all Electron APIs used (already done in research.md)
2. Cross-reference against Electrobun's API documentation
3. Identify any gaps or differences
4. For each gap, propose a workaround or document as a limitation

**Output**:
- `research/electron-api-compatibility-matrix.md`
  - Electron API → Electrobun equivalent mapping
  - Any missing APIs
  - Effort to work around or defer

**Success criteria**:
- ✅ All frequently-used APIs (`app`, `Menu`, `Tray`, `dialog`, `shell`, `BrowserWindow`, preload) have equivalents
- ✅ Any differences are documented and workable
- ✅ No "missing critical API" blockers

**Failure modes**:
- ❌ Electrobun missing `Tray` support (affects system tray icon)
  - **Mitigation**: Defer tray feature; ship without it
- ❌ Electrobun preload security model differs significantly
  - **Mitigation**: Redesign IPC security approach (possible but costly)

**Estimate**: 1 day (mostly documentation review)

---

## Phase 1: Analysis & Decision (end of Week 1)

### T010: Spike report and go/no-go decision

**Goal**: Synthesize spike results and recommend proceed/pause/reject.

**Approach**:
1. Review all three spike outputs
2. Assess risk and effort
3. Consider opportunity cost (what else could we build instead)
4. Recommend decision with rationale

**Output**:
- `042-decision.md` — decision document with:
  - Spike results summary
  - Effort re-estimate (if applicable)
  - Risk assessment
  - Recommendation (Proceed / Pause / Reject)
  - Conditional approval (e.g., "Proceed if PTY bridge is <2 weeks")

**Possible outcomes**:

| Outcome | Trigger | Next Step |
|---------|---------|-----------|
| **Proceed** | All spikes pass; effort acceptable | File implementation spec (spec 042b) |
| **Pause** | One spike fails but workaround exists | Document workaround; revisit after Electrobun 1.0 |
| **Reject** | Fundamental blocker (e.g., Cordis can't work on Bun) | Close spec; focus on Electron optimizations instead |
| **Conditional** | Spike passes but one path is expensive | Approve with specific conditions (e.g., "only if bridge is ready") |

**Estimate**: 1 day

---

## Phase 2 (conditional): Implementation planning

**Note**: Only if T010 recommends "Proceed."

### T020: Implementation spec draft

**Goal**: Create detailed spec for migration implementation (spans 6-7 weeks).

**Output**:
- `plan.md` — Cordis mini-design (if needed), phases, dependencies
- New implementation spec (042b or similar) with:
  - Phase breakdown (UI → APIs → Cordis → PTY → test/release)
  - Weekly milestones
  - Risk mitigations
  - Success metrics

**Estimate**: 2-3 days (post-decision)

---

## What happens after spike

### If approved (all three spikes pass, effort acceptable)

1. **File implementation spec** (042b or continuation)
2. **Plan 6-7 week migration project**
3. **Allocate 1 engineer** + 50% QA for platform testing
4. **Target release**: next major version (e.g., 0.2.0 post-spec-045)

### If paused (one spike fails but workaround exists)

1. **Document the workaround** in spec
2. **Revisit when**:
   - Electrobun hits 1.0 (less breaking changes)
   - Your own metrics show performance is a bottleneck
   - Team has bandwidth
3. **Spike results stay valid** for future reference

### If rejected (fundamental blocker)

1. **Close spec**
2. **Focus on alternative optimizations**:
   - Cordis plugin load profiling & optimization
   - Code splitting (lazy-load plugins)
   - Build tooling improvements (faster Vite)

---

## Definition of done for Phase 0 (Spike)

- [ ] T001: Cordis on Bun stress test complete; decision clear (works / needs patch / infeasible)
- [ ] T002: node-pty replacement options documented; effort estimated for each
- [ ] T003: Electron API surface audited; no critical gaps found
- [ ] T010: Decision document written; proceed/pause/reject recommended
- [ ] Spike report published in spec/042 directory

**Success**: Stakeholders read the decision and either green-light implementation or defer with clear reasoning.

---

## Effort summary

| Task | Duration | Owner | Dependencies |
|------|----------|-------|--------------|
| T001 (Cordis spike) | 2-3 days | 1 engineer | None |
| T002 (PTY audit) | 1-2 days | 1 engineer | None |
| T003 (API compat) | 1 day | 1 engineer | None |
| T010 (Decision) | 1 day | TL | T001, T002, T003 |
| **Total** | **5-7 days** | | |

**Cost**: 1 engineer, 1 week, ~$3-5K

**Payoff**: Either clear path to 6-7 week migration or clear blocker—avoids sinking 12 weeks into a dead end.

---

## Checkpoints for stakeholder review

**End of T001 (Day 3)**:
- Early signal: does Cordis work on Bun or is it blocked?
- If blocked, can pivot immediately (no point continuing other spikes)

**End of T002 (Day 5)**:
- PTY path identified
- Effort estimate for terminal feature

**End of spike (Day 7)**:
- Final decision and recommendation
- Confidence level in estimate
- Next steps

---

## Non-requirements

- No implementation code (this is research only)
- No actual migration in Phase 0
- No Electrobun contribution or upstream changes
- No performance metrics (those come post-migration if approved)
