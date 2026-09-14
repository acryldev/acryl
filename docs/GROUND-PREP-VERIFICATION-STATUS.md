# Ground Preparation: Verification Status

Status: In Progress (2026-09-14)

Before building ADE as an example BLEND, we must verify all 3 surfaces work end-to-end with hot-reload and plugins. This document tracks what's been tested, what needs testing, and critical blockers discovered.

## Testing Phases

### Phase A: Automated Checks (✅ Done)

- [x] Root check gate passes (`pnpm run check`)
- [x] Desktop check gate passes (`pnpm --filter acryl-desktop run check`)
- [x] Hot-reload safety tests pass (spec 032 tests)
- [x] Market tests pass (spec 034 tests, 851 tests green)
- [x] No new test regressions introduced

### Phase B: Manual Surface Testing (🔄 In Progress)

Each surface must be manually tested to confirm real-world hot-reload behavior.

#### Desktop GUI
**What to test:**
1. Start dev: `corepack pnpm --filter acryl-desktop run dev`
2. Wait for Electron app to launch
3. Open Settings → Plugins (if visible)
4. Install a test plugin (if market available)
5. Verify plugin loads without app restart
6. Disable plugin, confirm it's gone
7. Re-enable, confirm it returns immediately (hot-reload)
8. Uninstall cleanly

**Status:** App launches ✅ | Testing in progress
**Blocker check:** Does Desktop market UI exist and work?

#### Web GUI
**What to test:**
1. Start dev: `acryl web` or `corepack pnpm --filter acryl-web run dev`
2. Open http://127.0.0.1:3080 in browser
3. Navigate to plugins/market section
4. Install a test plugin
5. Verify no page reload (hot-reload)
6. Disable/enable plugin, no refresh
7. Uninstall

**Status:** Not yet tested
**Blocker check:** Does Web have plugin market UI? Does it hot-reload or require page refresh?

#### CLI/TUI
**What to test:**
1. Start: `acryl`
2. Navigate to `/market` or equivalent
3. Install a test plugin via menu/command
4. Run plugin command, verify it works
5. Disable plugin (TUI stays running)
6. Re-enable plugin (TUI stays running)
7. Uninstall

**Status:** Not yet tested
**Blocker check:** Is CLI plugin install implemented? Does TUI support hot-reload or restart on plugin change?

### Phase C: Local Development Workflow Testing (⏳ Next)

**Critical question:** Can a developer build a feature locally, test it in ACRYL, and hot-reload it WITHOUT publishing to npm?

**Current workflow (broken):**
```
1. Write feature code locally
2. Build npm package
3. Publish to registry (or local npm)
4. Install via market
5. Hot-reload
6. Test feature
```

**Needed workflow (simple):**
```
1. Write feature code in ~/.acryl-dev/plugins/my-feature
2. Point ACRYL at local plugin directory
3. Hot-reload in running instance
4. Test feature
5. When ready to share, package & publish
```

**Status:** Workflow not yet designed
**Blocker:** Does ACRYL support local filesystem plugin resolution?

---

## Critical Blockers to Identify

### Before ADE is viable:

1. **☐ All 3 surfaces must achieve hot-reload parity**
   - If Web or CLI require restart but Desktop doesn't → regression ticket filed
   - If any surface doesn't support hot-reload yet → must implement before ADE

2. **☐ Local plugin development must be possible without npm**
   - Can ACRYL load a plugin from a local directory (not a package)?
   - Can agent modify local plugin code and hot-reload to test?
   - If not → this is the biggest blocker for ADE self-modification

3. **☐ Plugin market must be accessible on all surfaces**
   - Desktop market UI working?
   - Web has market navigation?
   - CLI has market commands?
   - If any surface missing → implement before ADE depends on it

4. **☐ State must persist across plugin reload**
   - Install a plugin, give it some state (config, data)
   - Disable and re-enable plugin
   - State should restore (or be recoverable)
   - If state is lost → plugin lifecycle has a gap

---

## Testing Results

### Desktop GUI
```
Startup:          ✅ (app launching)
Market UI:        🔄 TBD (needs manual test)
Plugin install:   🔄 TBD
Hot-reload:       🔄 TBD
Interaction:      🔄 TBD
Disable/enable:   🔄 TBD
Uninstall:        🔄 TBD
State persists:   🔄 TBD
```

### Web GUI
```
Startup:          ❌ Not tested
Market UI:        ❌ Not tested
Plugin install:   ❌ Not tested
Hot-reload:       ❌ Not tested (likely requires page refresh, unknown)
Interaction:      ❌ Not tested
Disable/enable:   ❌ Not tested
Uninstall:        ❌ Not tested
State persists:   ❌ Not tested
```

### CLI/TUI
```
Startup:          ❌ Not tested
Market commands:  ❌ Not tested
Plugin install:   ❌ Not tested
Hot-reload:       ❌ Not tested (likely requires TUI restart, unknown)
Interaction:      ❌ Not tested
Disable/enable:   ❌ Not tested
Uninstall:        ❌ Not tested
State persists:   ❌ Not tested
```

### Local Plugin Development
```
Filesystem path:  ❌ Not tested
Code editing:     ❌ Not tested
Hot-reload:       ❌ Not tested
Agent writing:    ❌ Depends on above
```

---

## What's Blocking Shipping

**Hard blockers (must fix before 0.2.0 is considered stable):**
- If any surface requires restart for hot-reload → parity regression
- If local development isn't possible → ADE can't self-modify

**Nice-to-have (can defer):**
- Market UI polish on Web/CLI (can use CLI commands if needed)
- State persistence edge cases

---

## Next Steps

1. **Manual testing** — Run through Desktop test plan, document what works/breaks
2. **Web testing** — Same for Web surface (likely find page-refresh issue if not hot-reload)
3. **CLI testing** — Same for CLI (likely find TUI-restart issue)
4. **Local plugin test** — Try developing a simple plugin locally without npm
5. **File tickets** — Document any gaps discovered
6. **Fix blockers** — Implement local workflow, fix any restart issues
7. **Then:** Build ADE with working foundation

---

## Related

- `docs/SURFACE-VERIFICATION-TEST-PLAN.md` — detailed manual test procedures
- `docs/ADE-BLEND-ROADMAP.md` — ADE phases (currently paused at Phase 1, waiting for ground prep)
- `specs/032-universal-hot-reload/` — the machinery we're verifying
- `specs/034-acryl-market/` — plugin market implementation
