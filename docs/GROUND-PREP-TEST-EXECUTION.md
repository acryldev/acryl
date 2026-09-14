# Ground Preparation: Test Execution Plan

Date: 2026-09-14
Status: Ready to execute
Owner: Verification Phase 1

## Overview

This document coordinates the actual execution of the Surface Verification Test Plan. It differs from `SURFACE-VERIFICATION-TEST-PLAN.md` (the checklist) by providing:

1. **Checkpoints** - specific points where testing should pause and results collected
2. **Automation where possible** - which tests can run headless vs. which require manual GUI
3. **Priority ordering** - which blockers to identify first
4. **Result collection** - how to document findings for the next phase

---

## Test Execution Phases

### Phase 1A: Desktop Surface (Manual GUI) - 30-45 minutes

**Goal:** Verify Desktop can install a plugin and hot-reload it without restart.

**Setup:**
```bash
cd /Users/musichen/_projects/p11_acr_agentcontextrelay/acryldev/acryl
# Kill any existing Desktop instances
pkill -f "acryl-desktop" || true
# Ensure clean isolated home
rm -rf ~/.acryl-dev/.dsh
# Start Desktop dev
corepack pnpm --filter acryl-desktop run dev
```

**Test Steps (follow SURFACE-VERIFICATION-TEST-PLAN.md sections T1.1-T1.7):**

1. **T1.1 - Startup** ✓ (already verified in previous session)
   - App should launch without crashes
   - Main chat UI visible

2. **T1.2 - Market Access** (MANUAL)
   - Look for Settings icon or Plugin menu
   - Try to navigate to Plugins/Market section
   - **BLOCKER CHECK**: Does market UI exist?

3. **T1.3 - Install Plugin** (MANUAL, if market exists)
   - Find a lightweight test plugin
   - Click install
   - **CHECKPOINT**: Record plugin name and version
   - **BLOCKER CHECK**: Does install complete without error?

4. **T1.4 - Hot-Reload Verification** (MANUAL)
   - Watch: Does the app restart? (should NOT)
   - Watch: Does the chat UI stay responsive?
   - **BLOCKER CHECK**: If restart required → REGRESSION, file ticket

5. **T1.5-T1.7** - Interaction, Toggle, Uninstall (MANUAL)
   - Verify plugin features work
   - Toggle disable/enable without restart
   - Clean uninstall

**Result Document:**
Update `docs/SURFACE-VERIFICATION-TEST-PLAN.md`, "Desktop Results" section.

**Critical Blockers to Flag:**
- [ ] Market UI missing
- [ ] Install fails
- [ ] App restarts on install (regression)
- [ ] Plugin features don't work
- [ ] State lost on disable/re-enable

---

### Phase 1B: Web Surface (Browser Automation) - 15-20 minutes

**Goal:** Same as Desktop, but automated via browser.

**Setup:**
```bash
# Start Web surface in background
corepack pnpm --filter acryl-web run dev &
WEB_PID=$!
# Wait for port to be ready
sleep 3
```

**Test Steps (automated where possible):**

**T2.1 - Startup (AUTOMATED)**
```bash
curl -s http://127.0.0.1:3080 | head -20
# Check: 200 OK, HTML with ACRYL branding, no error traces
```

**T2.2-T2.7 - Market/Plugin/Hot-Reload (MANUAL + BROWSER)**

If browser tools available, I can:
- Navigate to plugin/market section
- Inspect for market UI presence
- Check for page reloads (via console events)
- Toggle plugin state

Otherwise, manual:
```bash
open http://127.0.0.1:3080
# Then: follow SURFACE-VERIFICATION-TEST-PLAN.md T2.2-T2.7 manually
```

**Key Question:** Does Web hot-reload or require page refresh?

**Critical Blockers to Flag:**
- [ ] Web market UI missing
- [ ] Page reload required on plugin install (vs. hot-reload)
- [ ] Console errors during plugin install
- [ ] Plugin features don't render

---

### Phase 1C: CLI/TUI Surface (Terminal) - 15-20 minutes

**Goal:** Verify CLI can install and toggle plugins without TUI restart.

**Setup:**
```bash
# Ensure clean isolated state
export ACRYL_HOME=~/.acryl-dev
# Start CLI
acryl
```

**Test Steps (MANUAL in terminal):**

**T3.1 - Startup**
- TUI boots and shows main screen
- Chat panel visible
- Menu/command bar accessible

**T3.2 - Market Access**
- Look for `/market` command or menu option
- Try to access plugin list

**T3.3-T3.7 - Install/Toggle/Uninstall (MANUAL)**
- Follow SURFACE-VERIFICATION-TEST-PLAN.md T3.3-T3.7
- **CRITICAL**: Watch TUI. Does it exit when you install? (should NOT)
- Watch: Do plugin commands appear in menu immediately?

**Critical Blockers to Flag:**
- [ ] Market commands not implemented
- [ ] TUI exits on plugin install (hard restart required)
- [ ] Plugin command doesn't appear until TUI restart
- [ ] State lost on disable/re-enable

---

## Test Result Collection

After each surface test, fill in the results in `docs/SURFACE-VERIFICATION-TEST-PLAN.md`:

```markdown
### Desktop Results
- [ ] Startup: PASS / FAIL / NOTES
- [ ] Market: PASS / FAIL / NOTES
- [ ] Install: PASS / FAIL / NOTES
- [ ] Hot-reload: PASS / FAIL / NOTES
- [ ] Interaction: PASS / FAIL / NOTES
- [ ] Toggle: PASS / FAIL / NOTES
- [ ] Uninstall: PASS / FAIL / NOTES
```

---

## Critical Blockers — Priority Triage

After Phase 1A/B/C complete, categorize findings:

### **HARD BLOCKER** (blocks ADE, must fix before ship)
- Any surface requires app/TUI restart for plugin load
- Local plugin development impossible (no filesystem path support)

### **FEATURE GAP** (defer, can use CLI workaround)
- Web market UI not implemented (can install via CLI commands)
- CLI market UI not implemented (can use config file)

### **REGRESSION** (fix immediately if new)
- Functionality that worked in v0.1.19 but breaks in 0.2.0

---

## Findings Summary Template

After testing all 3 surfaces, create a summary in `docs/GROUND-PREP-FINDINGS.md`:

```markdown
# Ground Preparation Findings

## Summary
- [x] Desktop: hot-reload works / requires restart / not tested
- [x] Web: hot-reload works / requires page reload / not tested
- [x] CLI: hot-reload works / requires restart / not tested

## Critical Blockers Found
1. [Blocker name] — affects [surface], blocks [work phase]

## Feature Gaps
1. [Gap name] — affects [surface], workaround: [method]

## Regressions
1. [Regression name] — affected in [version], now broken in 0.2.0

## Local Plugin Development Status
- Filesystem path support: YES / NO / UNKNOWN
- Can develop locally without npm: YES / NO / UNKNOWN

## Recommendation
- [ ] Ship 0.2.0 as-is (no blockers)
- [ ] Fix N blockers before shipping
- [ ] Ship 0.2.0 with known gaps documented
```

---

## Execution Sequence

1. **Start Desktop** (take max 45 min)
   - Navigate Settings → Plugins
   - Try to install a test plugin
   - Document results in SURFACE-VERIFICATION-TEST-PLAN.md

2. **Start Web** (take max 20 min)
   - Open http://127.0.0.1:3080
   - Navigate to plugin/market
   - Try to install, watch for page reload
   - Document results

3. **Start CLI** (take max 20 min)
   - `acryl` in terminal
   - Try `/market` or menu command
   - Install and toggle plugin
   - Document results

4. **Aggregate Findings** (take max 10 min)
   - Create GROUND-PREP-FINDINGS.md
   - Identify blockers vs. gaps
   - Recommend next steps

**Total estimated time: 90 minutes**

---

## Success Criteria

✅ **Phase 1 Complete when:**
- All 3 surfaces tested (Desktop / Web / CLI)
- Results documented in SURFACE-VERIFICATION-TEST-PLAN.md
- Blockers identified and categorized
- GROUND-PREP-FINDINGS.md created
- Clear recommendation on shipping readiness

**Next phase (Phase 2) unblocks when:**
- No hard blockers, OR
- User approves proceeding with documented blockers, OR
- Hard blockers are fixed

---

## Notes

- Keep test plugin minimal (hello-world style, no dependencies)
- Test plugins to try: `acryl-dsh-editor-plugin-cli` if available, or create a dummy
- Record exact version numbers and timestamps
- If any surface is already tested from previous session, skip and note "already verified in conversation ABC"
- If UI paths differ from spec, update SURFACE-VERIFICATION-TEST-PLAN.md docs after testing, not before

