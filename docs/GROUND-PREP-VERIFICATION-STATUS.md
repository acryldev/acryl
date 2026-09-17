# Ground Preparation: Verification Status

Status: ✅ Complete (2026-09-15) — all 3 surfaces verified with hot-reload, market install/toggle, and a genuinely universal plugin confirmed working end-to-end by direct user testing on both Web and Desktop.

## Summary of findings (2026-09-14/15 manual testing)

Manual testing across all 3 surfaces found real bugs, now fixed:

1. **Web/CLI plugin toggle always showed "restart required"** - `WebPluginsService`/`CliPluginsService` (`runtime/acryl-harness-runtime/src/{web,cli}-market-plugins.ts`) omitted the `live: boolean` field the market's `restartRequired: !changed.live` computation needs. Toggling actually applied live via Cordis's reactive Loader the whole time; the field was just never reported. Fixed in commit `52df117`.

2. **CLI had no enable/disable UI at all** - `CliPluginsService` (the toggle backend) existed, but nothing in `acryl-cli` ever called `previewEnable`/`executeEnable`. The `/plugins` overlay was read-only by design. Added a selection cursor + Enter-to-toggle for mutable rows in `PluginsOverlay.ts`, wired through a new `TuiActions.togglePlugin`. Fixed in commit `cc89154`.

3. **Web market install/uninstall swallowed real pnpm/dsh stderr** - every failure reported only a fixed generic sentence ("The desktop package manager did not complete successfully"), discarding the actual error via `.resume()`. A 502 status is deliberate for this error class (`sendInstallError`'s own mapping), not a server crash - reproduced the exact command by hand twice, both succeeded; one earlier invocation in the same profile hit a real registry ENOTFOUND retry, the class of transient failure this generic message made undiagnosable. Now captures stderr into a bounded buffer and surfaces it in the error message. Fixed in commit `39eb8d2`.

4. **Development Canvas Web plugin was an unfinished copy-paste of Desktop's** - identical npm package name/repo URL as the Desktop variant (so it could never coexist in the catalog), missing `acryl.surfaces` tag, stale `@deepseek-ai/cordis` pin (`4.0.1` vs required `^4.0.2`), wrong `desktop-slot` capability tag, and the documented row-id anti-pattern from this repo's own CLAUDE.md. Fixed and pushed (commit `51938fc`). **Still needs**: publish to npm + registration in the acryl.dev catalog before it appears in any surface's market - the manifest fix alone doesn't make it discoverable yet. Checked whether it shares the connection-registration bug below (#5) - it doesn't (`acryl-development-canvas` never touches `ctx.connection`).

5. **`acryl-dsh-editor-plugin` had a genuine Cordis topology bug, root-caused and fixed** - `dsh-client-connection`'s `rpc.handle()` convenience getter captures its own service's construction-time context as the registering owner (`get rpc() { const owner = this.ctx; ... }`), not the calling plugin's context, regardless of what the caller's own `inject` array declares. This crashed the plugin at boot on ACRYL's Web profile specifically (a mounting-order race, not a Web-vs-Desktop incompatibility - the same bug hit Desktop once before too, per the plugin's own git history). Fixed by calling `connection.register(ownContext, channel, handler)` directly instead of the broken `rpc.handle()` wrapper - same underlying wire protocol, no upstream/submodule change needed. Published as `acryl-dsh-editor-plugin@0.2.7`, **confirmed working on both Web and Desktop by direct user testing** (not just automated verification). This also settled the "universal plugin vs. per-surface fork" architecture question: one plugin, one repo, `dsh.client.platform: "web"`, works identically on Web and Desktop since both are Chromium/DOM-rendered - the `-web` fork was unnecessary duplication, now deprecated on npm and marked in its own README (commits `d22ce4a`, pushed).

All fixes verified via typecheck + full existing test suites (no regressions; the 4 pre-existing `acryl-harness-runtime` failures from `CHANGELOG-0.2.0.md` are unchanged).

## Full build verification (2026-09-15, overnight session)

Ran each affected package's own full `check` gate (build + typecheck + test + verify scripts) directly, since the root `pnpm run check` aborts early on an unrelated pre-existing failure (see below):

- `acryl-harness-runtime`: typecheck clean; 4 pre-existing test failures (documented, unrelated - `CHANGELOG-0.2.0.md`)
- `cordis-plugin-market`: typecheck clean; **280/280 tests pass**
- `acryl-cli`: full check clean (build + typecheck + **318/318 tests**)
- `acryl-web`: build + typecheck + test all clean; `verify:npm` fails on an unrelated pre-existing workspace-resolution gap (`dsh-client-ui-brand-acryl@workspace:*` not found) - traced to the `804e5bf` repo-layout refactor (root packages regrouped into `apps/runtime/plugins/examples/distribution`), already committed before this session, not caused by tonight's fixes
- `acryl-desktop`: **full check gate 100% green** - 851 tests passed, 4 skipped, all verify scripts (closure, cli-runtime, loader-boot, profile-boot, licenses) passed

**Root `pnpm run check` gate**: fails at the very first step, `check:layout`'s bilingual-docs check - `README.i18n.yaml`'s recorded hash for `README.md` is stale (`0bea542...` recorded vs `c85c807...` actual), introduced by the `fad80c7` v0.2.0 release commit (already committed before this session) which updated `README.md`'s content without refreshing the paired `README.en.md` translation or the hash ledger. **Deliberately left unfixed tonight** - correcting it properly means reviewing whether `README.en.md` needs an actual translation update to match, not just bumping a hash number, and that needs your judgment call, not a 3am guess.

### Local-repo fix (not part of the acryldev/acryl monorepo)

`acryl-development-canvas-web` (separate repo, `_dsh_plugins/acryl-development-canvas-web`) had its manifest corrected (commit `51938fc`, committed locally, **not pushed** - no standing push permission for this repo). Could not run its own build/test suite without a full `pnpm install` of its private `@deepseek-ai/*` peer dependencies, which felt like unnecessary risk for a pure-metadata change with no source touched; validated JSON/YAML syntax directly instead.

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
