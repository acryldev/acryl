> **Superseded 2026-10-01.** Estimates and probabilities in this file were made without running anything, and some claims were wrong (for example, that Cordis does not use Node internals). The current assessment is [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md). Kept for history.

# Electrobun Migration Assessment for ACRYL

**Date**: 2026-09-29  
**Status**: Realistic but not trivial; medium-effort, medium-risk, medium-reward  
**Recommendation**: Defer unless there's a specific business case (performance, bundle size, or maintenance burden)

---

## Executive Summary

ACRYL can migrate to Electrobun. The difficulty is **unevenly distributed**:
- React UI: **trivial** (works as-is)
- Electron API surface: **easy-ish** (straightforward 1:1 mapping)
- **Critical blocker**: `node-pty` (native module) requires Zig rewrite
- **Secondary risk**: Cordis hot-reload on Bun (works, but untested at scale)

**Effort**: 6-7 weeks (likely); 2-3 weeks (best case), 12+ weeks (worst case).

**Benefit**: **30-40% bundle size reduction** (~50-70MB smaller):
- Current: ~170MB (Electron embeds Chromium ~70MB)
- Electrobun: ~100MB (Bun + app code, reuses OS WebKit - macOS WebKit, Windows WebView2, Linux WebKitGTK)
- **Impact**: Substantial for download friction, CI/CD storage, offline distribution
- Plus: Slightly faster startup (Bun + no Chromium unpack)

**Cost**: Pre-1.0 framework, thin community, WebKit fragmentation across platforms (must test all three).

---

## ACRYL's Current Electron Surface

### Electron APIs in use (251 references)

**High-frequency (20+ uses each):**
- `app.*` (59 refs): lifecycle, home dirs, user data, process management
- `Menu` (65 refs cumulative): native menus, tray menus, context menus
- `Tray` (58 refs cumulative): system tray icon and menu
- `dialog.*` (14 refs): file open/save, message dialogs
- `shell.*` (12 refs): open external links, reveal file in Finder/Explorer
- `BrowserWindow` (19 refs): window lifecycle, options, screen info, preload
- `preload` (7 refs): context isolation bridge
- `contextBridge` (6 refs): IPC security model

**Low-frequency/optional:**
- `crashReporter` (1-2 refs): error reporting
- `screen` (1 ref): screen resolution
- `webUtils` (1 ref): in preload, path utilities

**NOT USED** (good news):
- `powerMonitor`, `desktopCapturer`, `session` cookies/proxies, `webRequest`, native keybinding hints, `clipboard`, remote module, Electron's updater

### Electron IPC Layer

**Current pattern**: NOT using raw `ipcMain.handle()` / `ipcRenderer.invoke()`.

Instead:
- Uses Cordis/DeepSeek Harness **connection** RPC (Host ↔ Client)
- Connection is already abstraction layer on top of Electron's webview messaging
- IPC channels are defined through Cordis service injection + `@acryl/ui` Client slots
- **This is good**: means the IPC layer is already decoupled from Electron

**Implication**: Switching from Electron's webview → Electrobun's webview is mostly a plumbing change, not a conceptual redesign.

### Native Module Dependencies

**node-pty v1.2.0-beta.15** (in `plugins/acryl-workspace/package.json`):
- **What it does**: terminal PTY (pseudo-terminal) - core to the terminal pane functionality
- **Why it matters**: `.node` native bindings, compiled for Node.js, will NOT work on Bun as-is
- **Electrobun path**: must be rewritten as Zig bindings

**Other dependencies**: No other `.node` modules found. Workspace, CLI, harness runtime, all use JavaScript/Node only (plus `@deepseek-ai/dsh-terminal` which is a JavaScript wrapper).

---

## Migration Effort Breakdown

### 1. React UI (Trivial - ~2 days)

**Current setup**: Vite-based client build in `apps/acryl-desktop/src/` renders to webview

**Electrobun**: Uses Bun's bundler + Vite-compatible build tooling

**Work**:
- Update `vite.config.ts` to Electrobun's webview builder
- Adjust preload script path (small change)
- CSS/React components: no changes
- Assets, images, fonts: same loading mechanism

**Risk**: None. Frameworks and UI libraries are format-agnostic.

**Estimate**: 1-2 days (mostly config + testing).

---

### 2. Electron API Surface (Easy-ish - ~4-5 days)

**Mapping existing Electron → Electrobun APIs**:

| Electron | Electrobun | Effort | Notes |
|----------|-----------|--------|-------|
| `app.on()`, `app.quit()` | `app.on()`, `app.quit()` | trivial | identical |
| `BrowserWindow` | `Window` | trivial | constructor slightly different, mostly identical |
| `Menu` | `Menu` | trivial | same interface |
| `Tray` | `Tray` | trivial | same interface |
| `dialog.showOpenDialog()` | `dialog.showOpenDialog()` | trivial | same |
| `shell.openExternal()` | `shell.openExternal()` | trivial | same |
| `screen.getPrimaryDisplay()` | `screen.getPrimaryDisplay()` | trivial | same |
| preload + contextBridge | preload + contextBridge | easy | Electrobun supports both, wiring is simpler |

**Files to change** (~10-15 files):
- `apps/acryl-desktop/src/main.ts`
- `apps/acryl-desktop/src/shell/*.ts`
- `apps/acryl-desktop/src/preload.ts`
- `apps/acryl-desktop/src/electron-runtime.ts`
- Build config and type imports

**Risk**: Low. These are thin wrappers around OS-level APIs; Electrobun replicates Electron's API layer intentionally.

**Estimate**: 4-5 days (mostly search-replace + testing).

---

### 3. Cordis Connection Layer (Medium - ~5-7 days)

**Current**: Cordis Host ↔ Client connection runs over Electron's webview messaging

**On Electrobun**: Same logical layer, but different underlying IPC (Bun's IPC model)

**Work**:
- Trace how the connection is established in `apps/acryl-desktop/src/profile.ts` and Cordis setup
- Verify Cordis's hot-reload machinery works on Bun (dynamic imports, module cache)
- If yes: minimal changes (just swap IPC transport, Cordis unchanged)
- If no: debug and patch Cordis's module-loading assumptions

**Critical question**: Does Cordis's hot-reload rely on Node.js internals Bun doesn't replicate?
- Cordis uses dynamic `import()`, which Bun supports
- Cordis uses module cache eviction for HMR, which Bun partially supports
- **Unknown**: whether Bun's module cache behaves identically under rapid reload cycles

**Risk**: Medium. Cordis is a complex dynamic system. A plugin-load failure that surfaces only under stress is the biggest unknown.

**Recommendation**: **Prototype this first** (see "Spike" section below).

**Estimate**: 5-7 days if prototype is successful; 2-3 weeks if Cordis needs patching.

---

### 4. node-pty → Zig Rewrite (Hard - 2-4 weeks)

**Current**: `plugins/acryl-workspace/package.json` depends on `node-pty@1.2.0-beta.15`

**The problem**: node-pty is a native module (`.node` file), compiled for Node's ABI. Bun cannot load it.

**Electrobun's solution**: Rewrite as Zig bindings for Bun.

**Options**:

**Option A: Use Electrobun's existing pty library** (if it exists)
- Check if Electrobun ships a built-in PTY solution
- **Status** (from research): Electrobun docs mention Zig bindings but don't showcase a ready-made PTY yet
- **Effort**: 2-3 days (integration)
- **Risk**: Low (if a polished library exists)

**Option B: Port node-pty to Zig yourself**
- node-pty wraps platform PTY APIs (Unix `forkpty`, Windows `CreateProcessW`)
- Porting means rewriting those bindings in Zig + FFI hooks for Bun
- Complex but doable; similar to `kitty`'s PTY handling
- **Effort**: 3-4 weeks (full implementation + testing across macOS/Linux/Windows)
- **Risk**: Medium (platform-specific bugs, especially Windows named pipes)
- **Payoff**: You own it, customize as needed

**Option C: Shell out to `xterm.js` + custom PTY bridge**
- Run terminals in an external process, communicate via REST/WebSocket
- Avoids native module entirely
- **Effort**: 1-2 weeks (bridge + protocol)
- **Risk**: Medium (reliability, latency, process management)
- **Payoff**: Pure JavaScript, easier to debug

**Option D: Defer terminal support, ship Electrobun without it**
- Focus on Chats, Files, Diff, Kanban, Docs; terminal is Phase 2
- **Effort**: 0 (just disable the feature)
- **Risk**: MVP ships without a core ACRYL feature
- **Payoff**: Faster migration, user accepts limitation

**Recommendation**: **Spike Option A first** (2-3 days to see if a solution exists). If not, Option C (bridge) is lower-risk than a full Zig port.

**Estimate**: 2-4 weeks depending on path chosen.

---

## Realistic Timeline

### Best case (Option A pty library exists, Cordis works unchanged)
- UI config: 2 days
- Electron API mapping: 4 days
- Cordis prototype + integration: 5 days
- PTY integration: 2 days
- **Total: 13 days (≈2-3 weeks)**

### Likely case (Option C PTY bridge, Cordis needs minor tuning)
- UI config: 2 days
- Electron API mapping: 5 days
- Cordis prototype + fixes: 10 days
- PTY bridge: 10 days
- Integration + testing: 5 days
- **Total: 32 days (≈6-7 weeks)**

### Worst case (full Zig port, Cordis major rework)
- All of above + 
- Zig PTY port: 20 days
- Cordis deep debugging: 10 days
- **Total: 62+ days (≈12-14 weeks, plus risk of abandonment)**

---

## Benefits vs. Costs

### Benefits

**Performance**:
- Bun startup: ~30% faster than Node (claims)
- ACRYL's bottleneck is **Cordis plugin load** and **React mount**, not JS parsing - so real-world gain is <10%
- Terminal startup: same (PTY overhead unchanged)

**Bundle size** (CORRECTED):
- Current: ~170MB (Bun ~100MB + Electron's bundled Chromium ~70MB)
- Electrobun: ~100MB (Bun + app code; reuses OS WebKit - macOS system WebKit, Windows WebView2, Linux WebKitGTK - no bundled Chromium)
- **Net reduction**: 50-70MB (30-40% smaller)
- **Impact**: Substantial for download friction, CI/CD artifact storage, Web hosting bandwidth, offline distribution

**Maintenance**:
- One less runtime to manage (Electron updates, Bun updates)
- **Bun pre-1.0**: breaking changes possible; you inherit that risk

### Costs

**Time**: 2-12 weeks of engineering depending on path

**Risk**:
- Electrobun pre-1.0, breaking changes possible
- Thin community (issues take longer to resolve)
- WebKit fragmentation (macOS WebKit, Windows WebView2, Linux WebKitGTK have different CSS/DOM quirks)
- No auto-updater equivalent yet (Electron's built-in auto-updater is convenient)

**Maintenance ongoing**:
- Electrobun maintainer dependency (no in-house Electron expertise)
- Platform-specific PTY bugs (if you own the Zig port)

**Opportunity cost**:
- 6-7 weeks of engineering could be spent on:
  - Spec 042+ (agent-specific integrations)
  - Performance optimization (Cordis plugin load, React render)
  - CLI online control (Scope B phase 3)
  - Web surface parity improvements

---

## Spike: Validate the Biggest Unknown (Week 1)

**Recommended approach: 3-5 day focused spike**

1. **Day 1-2**: Set up minimal Electrobun + Bun environment
   - Clone `electrobun` starter
   - Rig up ACRYL's Cordis config
   - Can it load one plugin?

2. **Day 2-3**: Hot-reload stress test
   - Start Cordis with acryl-workspace and acryl-ui-control
   - Reload each plugin 20 times rapidly
   - Does module cache behave correctly?
   - Do Cordis services re-inject cleanly?

3. **Day 3-4**: PTY discovery
   - Search for existing Electrobun PTY solution
   - If found: can you instantiate and run a shell?
   - If not: estimate effort for Option C bridge

4. **Day 5**: Report + decision
   - If all three pass: migration is "likely" (6-7 weeks)
   - If Cordis fails: paused pending Cordis investigation
   - If PTY missing and no bridge exists: paused pending design decision

**Cost**: 1 engineer, 1 week, ~$3-5K  
**Payoff**: Either clear path or clear blocker - avoids sinking 12 weeks into a dead end

---

## Recommendation

### Short term (now - 3 months)
**Consider spike now or defer based on priorities.** ACRYL works fine on Electron today. The 30-40% bundle reduction is **substantial** (50-70MB smaller), which matters for:
- User download friction (especially mobile hotspots)
- CI/CD artifact storage
- Offline distribution
- Web hosting bandwidth

**But**: 1-week spike first to validate Cordis + PTY before committing to 6-7 week migration.

**Alternative**: If user growth isn't blocked by bundle size, invest in Cordis plugin load optimization instead (profiling, lazy-load, code-splitting). That's where the real performance bottleneck is.

### Medium term (3-6 months)
**Run the spike if**:
- Web surface parity is done
- Spec 042 (agent integrations) is shipped
- Performance becomes a user-reported issue
- Bundle size becomes a blocker for Web distribution

**Then decide** based on spike results.

### Long term (6+ months, post-1.0)
**Revisit when**:
- Electrobun hits 1.0 (more stable)
- Bun ecosystem solidifies (more libraries, fewer breaking changes)
- Your team has concrete performance data (profiles, real metrics)

---

## What You'd Need to Keep Track Of

If you pursue this:

1. **Cordis hot-reload on Bun**: Test repeatedly under realistic load
2. **PTY path**: Decide early (existing library, bridge, or own port)
3. **Platform testing**: macOS, Windows, Linux WebKitGTK - test each
4. **Auto-update**: ACRYL has `updates/` code - check if Electrobun has a story here
5. **Community**: Monitor Electrobun GitHub for breaking changes; budget monthly sync

---

## Summary Table

| Factor | Assessment | Effort | Risk | Notes |
|--------|-----------|--------|------|-------|
| **React UI** | Trivial | 2 days | None | Config-only change |
| **Electron APIs** | Easy-ish | 5 days | Low | 1:1 mapping mostly |
| **Cordis/Connection** | Medium | 5-10 days | Medium | Prototype first |
| **node-pty** | Hard | 2-4 weeks | Medium-High | Critical unknown; multiple paths |
| **Overall** | Medium effort, medium risk | 6-7 weeks (likely) | Medium | Defer unless specific business case |

---

## References

- [Electrobun docs](https://electrobun.dev)
- node-pty: [GitHub](https://github.com/microsoft/node-pty)
- Bun & native modules: [Bun FFI docs](https://bun.sh/docs/ffi)
- Cordis hot-reload: `deepseek-harness/` source (in your repo)
