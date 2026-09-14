# Surface Verification Test Plan

Status: In Progress (2026-09-14)

Comprehensive manual testing of all 3 surfaces (Desktop, Web, CLI) to verify hot-reload and plugin functionality work end-to-end in real usage, not just automation.

## Test Scope

Each surface must pass:
1. **Startup** — app boots without errors
2. **Plugin market access** — can navigate/view market
3. **Plugin install** — can find and install a test plugin
4. **Hot-reload** — plugin loads live without restart
5. **Plugin interaction** — can use the plugin's features
6. **Disable/enable** — can toggle plugin, features persist correctly
7. **Uninstall** — clean removal

## Surface 1: Desktop GUI

### Prerequisites
- [ ] macOS 13+ (Apple Silicon or Intel)
- [ ] Desktop binary available or built locally
- [ ] ~/.acryl-dev/.dsh isolated home clean

### Test Steps

```bash
# Start Desktop in dev mode
corepack pnpm --filter acryl-desktop run dev
```

**T1.1 - Startup**
- [ ] App launches without crashes
- [ ] Main window shows chat UI
- [ ] Settings panel accessible
- [ ] Plugin market icon visible (if enabled)

**T1.2 - Market access**
- [ ] Click market icon
- [ ] Plugin list loads (or "no market" message if disabled)
- [ ] Can scroll/search if plugins visible

**T1.3 - Install test plugin**
- [ ] Browse for a lightweight plugin (e.g., acryl-dsh-editor-plugin-cli if available)
- [ ] Click install
- [ ] Installation completes (may show progress)
- [ ] "Restart required?" prompt appears (should show false for live-reload)

**T1.4 - Hot-reload verification**
- [ ] Plugin is active immediately (no restart required)
- [ ] No app shutdown observed
- [ ] Chat UI still responsive

**T1.5 - Plugin interaction**
- [ ] Open plugin's contributed UI (if it adds a panel/menu)
- [ ] Plugin features work as expected

**T1.6 - Disable/enable toggle**
- [ ] Settings → Plugins → Find installed plugin
- [ ] Toggle disable
- [ ] Plugin UI disappears immediately
- [ ] Re-enable
- [ ] Plugin reappears immediately (hot-reload)

**T1.7 - Uninstall**
- [ ] Right-click plugin → Uninstall
- [ ] Plugin removed cleanly (no leftovers)

**Expected outcome:** All steps complete without restart. If restart is required for any step, document which and why.

---

## Surface 2: Web GUI

### Prerequisites
- [ ] Same dev environment as Desktop
- [ ] Web surface starts without Desktop

### Test Steps

```bash
# Start Web surface only
corepack pnpm --filter acryl-web run dev
# Or if a separate command exists
acryl web
```

**T2.1 - Startup**
- [ ] Web app loads in browser (typically http://127.0.0.1:3080)
- [ ] Chat UI renders
- [ ] No console errors

**T2.2 - Market access**
- [ ] Market/plugin navigation visible
- [ ] Can load plugin list

**T2.3 - Install test plugin**
- [ ] Select a plugin from market
- [ ] Install button works
- [ ] Installation completes

**T2.4 - Hot-reload verification**
- [ ] Plugin active immediately
- [ ] No page reload observed
- [ ] Chat still responsive

**T2.5 - Plugin interaction**
- [ ] Plugin features accessible and work

**T2.6 - Disable/enable**
- [ ] Toggle plugin off/on via UI
- [ ] No page refresh
- [ ] Features appear/disappear immediately

**T2.7 - Uninstall**
- [ ] Remove plugin cleanly

**Expected outcome:** Web surface achieves same hot-reload parity as Desktop. If Web requires refresh but Desktop doesn't, document the difference.

---

## Surface 3: CLI/TUI

### Prerequisites
- [ ] CLI binary or `acryl` command available
- [ ] Terminal with 80x24+ space

### Test Steps

```bash
# Start CLI
acryl
```

**T3.1 - Startup**
- [ ] TUI boots (terminal UI displays)
- [ ] Chat panel visible
- [ ] Menu/command bar accessible

**T3.2 - Market access**
- [ ] `/market` command or menu option visible
- [ ] Can browse plugin list in TUI

**T3.3 - Install test plugin**
- [ ] Select plugin from market
- [ ] Install via menu/command
- [ ] Installation completes in terminal

**T3.4 - Hot-reload verification**
- [ ] Plugin active immediately (TUI does not exit/restart)
- [ ] Can see indication plugin is loaded (status line, menu change, etc.)

**T3.5 - Plugin interaction**
- [ ] Plugin adds a new command or feature to TUI
- [ ] Can invoke that feature
- [ ] Works as expected

**T3.6 - Disable/enable**
- [ ] Command/menu to toggle plugin
- [ ] TUI stays running through toggle
- [ ] Feature appears/disappears from menu immediately

**T3.7 - Uninstall**
- [ ] Remove plugin via menu/command
- [ ] Cleanup without TUI restart

**Expected outcome:** CLI achieves same hot-reload parity as Desktop/Web. If TUI requires restart but GUI doesn't, that's a regression to fix.

---

## Results Summary

### Desktop Results
- [ ] Startup: PASS / FAIL / NOTES
- [ ] Market: PASS / FAIL / NOTES
- [ ] Install: PASS / FAIL / NOTES
- [ ] Hot-reload: PASS / FAIL / NOTES
- [ ] Interaction: PASS / FAIL / NOTES
- [ ] Toggle: PASS / FAIL / NOTES
- [ ] Uninstall: PASS / FAIL / NOTES

### Web Results
- [ ] Startup: PASS / FAIL / NOTES
- [ ] Market: PASS / FAIL / NOTES
- [ ] Install: PASS / FAIL / NOTES
- [ ] Hot-reload: PASS / FAIL / NOTES
- [ ] Interaction: PASS / FAIL / NOTES
- [ ] Toggle: PASS / FAIL / NOTES
- [ ] Uninstall: PASS / FAIL / NOTES

### CLI Results
- [ ] Startup: PASS / FAIL / NOTES
- [ ] Market: PASS / FAIL / NOTES
- [ ] Install: PASS / FAIL / NOTES
- [ ] Hot-reload: PASS / FAIL / NOTES
- [ ] Interaction: PASS / FAIL / NOTES
- [ ] Toggle: PASS / FAIL / NOTES
- [ ] Uninstall: PASS / FAIL / NOTES

---

## Known Gaps Before Testing

- **Web plugin market UI** — may not be fully implemented yet
- **CLI plugin market** — may be command-only, not menu-driven
- **Test plugins** — need lightweight, safe plugins to install (acryl-dsh-editor-plugin-cli if available)
- **Disable/enable in Web/CLI** — may not have UI controls yet (may require CLI commands)

## Success Criteria

**Ship-ready:** All 3 surfaces can install a plugin and have it hot-reload without restarting the app.

**If any surface requires restart:** Document why, file ticket for parity fix before shipping.

**If any surface has no market UI yet:** Document what's needed, defer to follow-up if not blocking.

---

## Next Step

Run through this test plan manually on each surface and document findings in the "Results Summary" section above. File tickets for any blockers or regressions found.
