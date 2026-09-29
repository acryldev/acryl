# Research: Electrobun Optimization

**Date**: 2026-09-29  
**Approach**: Technical audit of ACRYL's Electron and native dependencies, plus API surface compatibility analysis.

---

## ACRYL's Current Electron Surface

### APIs in use (251 references across Desktop)

**High-frequency** (20+ references each):
- `app.*` (59 refs): lifecycle, home directory, user data paths, process management
- `Menu` (65 refs cumulative): native application menus, tray menus, context menus
- `Tray` (58 refs cumulative): system tray icon, icon updates, menu binding
- `dialog.*` (14 refs): file open/save dialogs, message dialogs
- `shell.*` (12 refs): open external URLs, reveal file in Finder/Explorer
- `BrowserWindow` (19 refs): window lifecycle, constructor options, screen info
- `preload` + `contextBridge` (13 refs combined): IPC security boundary, context isolation

**Low-frequency/optional**:
- `crashReporter` (1-2 refs): error reporting to service
- `screen` (1 ref): screen resolution queries
- `webUtils` (1 ref): path utilities in preload

**Not used** (no migration impact):
- `powerMonitor`, `desktopCapturer`, `session` (cookies/proxies), `webRequest`, native keybinding hints, `clipboard`, remote module, Electron updater

### IPC and Communication Pattern

**NOT using raw `ipcMain.handle()` / `ipcRenderer.invoke()`.**

Current architecture:
- ACRYL uses Cordis (DeepSeek Harness) connection RPC layer
- Connection abstracts over Electron's webview messaging
- IPC channels defined through Cordis service injection + `@acryl/ui` Client slots
- **Good news**: IPC layer is already decoupled from Electron specifics; switching webview transports is plumbing work, not redesign

### Native Module Dependencies

**node-pty v1.2.0-beta.15** (in `plugins/acryl-workspace/package.json`):
- **Purpose**: Terminal PTY (pseudo-terminal) - core to Terminal pane
- **Type**: Native module (`.node` bindings), compiled for Node ABI
- **Problem**: Does NOT work on Bun as-is; must be rewritten as Zig FFI bindings
- **Impact**: Critical blocker if no existing Bun/Electrobun PTY solution available

**Other packages**: No other native modules found. Workspace, CLI, runtime all JavaScript/Node.js (except `@deepseek-ai/dsh-terminal` JavaScript wrapper).

---

## Effort Breakdown

### 1. React UI (Trivial - 2 days)

**Current**: Vite client build in `apps/acryl-desktop/src/`, renders to Electron webview

**On Electrobun**: Webview builder compatible with Vite

**Work**:
- Update `vite.config.ts` to Electrobun's build setup
- Adjust preload script path (small)
- CSS/React components: no changes
- Assets, images, fonts: same loader

**Risk**: None. UI libraries are format-agnostic.

**Estimate**: 1-2 days (mostly config + testing)

---

### 2. Electron API Surface (Easy-ish - 5 days)

**Mapping Electron → Electrobun**:

| Electron | Electrobun | Effort | Status |
|----------|-----------|--------|--------|
| `app.on()`, `app.quit()` | `app.on()`, `app.quit()` | trivial | identical |
| `BrowserWindow` | `Window` | trivial | constructor slightly different, mostly identical |
| `Menu` | `Menu` | trivial | same interface |
| `Tray` | `Tray` | trivial | same interface |
| `dialog.showOpenDialog()` | `dialog.showOpenDialog()` | trivial | same |
| `shell.openExternal()` | `shell.openExternal()` | trivial | same |
| `screen.getPrimaryDisplay()` | `screen.getPrimaryDisplay()` | trivial | same |
| preload + contextBridge | preload + contextBridge | easy | Electrobun supports both; wiring simpler |

**Files to change** (~10-15):
- `apps/acryl-desktop/src/main.ts`
- `apps/acryl-desktop/src/shell/*.ts` (electron-platform.ts, electron-runtime.ts, etc.)
- `apps/acryl-desktop/src/preload.ts`
- Build config and type imports

**Risk**: Low. Thin wrappers; Electrobun replicates Electron's API layer intentionally.

**Estimate**: 4-5 days (search-replace + testing)

---

### 3. Cordis Connection Layer (Medium - 5-7 days)

**Current**: Cordis Host ↔ Client connection runs over Electron's webview messaging

**On Electrobun**: Same logical layer; different underlying IPC (Bun's model)

**Work**:
- Trace connection setup in `apps/acryl-desktop/src/profile.ts`
- Verify Cordis hot-reload works on Bun (dynamic imports, module cache)
- If yes: minimal changes (swap IPC transport)
- If no: debug and patch Cordis module-loading assumptions

**Critical question**: Does Cordis's hot-reload rely on Node internals Bun doesn't replicate?

Cordis uses:
- Dynamic `import()` — ✓ Bun supports
- Module cache eviction for HMR — ⚠️ Bun supports, but semantics untested at scale
- Service lifecycle with re-injection — ⚠️ Should work, but rapid reload cycles unknown

**Risk**: Medium. Cordis is complex and dynamic. Cache eviction failure surfaces only under stress.

**Recommendation**: This is the spike (T001).

**Estimate**: 5-7 days if prototype succeeds; 2-3 weeks if Cordis needs patching.

---

### 4. node-pty Replacement (Hard - 2-4 weeks)

**Current**: `plugins/acryl-workspace` depends on `node-pty@1.2.0-beta.15`

**Problem**: Native module; Bun cannot load it as-is.

**Electrobun's answer**: Rewrite as Zig bindings for Bun FFI.

**Options**:

**Option A: Existing Electrobun PTY library**
- Check if Electrobun ships a ready-made PTY
- Status (from search): Not yet documented; unclear if exists
- **Effort**: 2-3 days (integration)
- **Risk**: Low (if library exists)

**Option B: Port node-pty to Zig**
- Rewrite Unix `forkpty` and Windows `CreateProcessW` bindings in Zig
- Similar to what `kitty` terminal does
- **Effort**: 3-4 weeks (full implementation + cross-platform testing)
- **Risk**: Medium (platform-specific bugs, especially Windows named pipes)

**Option C: PTY bridge (pure JavaScript)**
- Run terminals in external process, communicate via REST/WebSocket
- No native module needed
- **Effort**: 1-2 weeks (bridge + protocol)
- **Risk**: Medium (reliability, latency, process management)

**Option D: Defer terminal support**
- Ship Electrobun without Terminal pane (Phase 2)
- Focus on Chats, Files, Diff, Kanban, Docs first
- **Effort**: 0
- **Risk**: MVP ships without core feature

**Recommendation**: Spike T002 to discover if Option A exists; if not, evaluate C vs. full port.

**Estimate**: 2-4 weeks depending on path.

---

## Realistic Timeline

### Best case (Option A PTY exists, Cordis works unchanged)
- UI config: 2 days
- Electron API: 4 days
- Cordis prototype: 5 days
- PTY integration: 2 days
- **Total: 13 days (2-3 weeks)**

### Likely case (PTY bridge, Cordis minor tuning)
- UI config: 2 days
- Electron API: 5 days
- Cordis prototype + fixes: 10 days
- PTY bridge: 10 days
- Integration + testing: 5 days
- **Total: 32 days (6-7 weeks)**

### Worst case (full Zig port, Cordis rework)
- All of above +
- Zig PTY port: 20 days
- Cordis deep debugging: 10 days
- **Total: 62+ days (12-14 weeks, plus risk of abandonment)**

---

## Cordis Hot-Reload on Bun: Deep Dive

See `CORDIS_ON_ELECTROBUN.md` for full technical analysis.

**TL;DR**:
- Bun's module system (dynamic `import()`, caching) is compatible with Node's
- ACRYL's entire plugin ecosystem depends on hot-reload working
- **Unknown**: Bun's cache eviction semantics under rapid reload cycles (100+ reloads, multiple plugins)
- **Must validate in spike (T001)** before committing to migration

---

## Benefits vs. Costs

### Benefits

**Performance**:
- Bun startup: ~30% faster than Node (claims)
- ACRYL's bottleneck is Cordis plugin load + React mount, not JS parsing → real gain <10%
- Terminal startup: unchanged (PTY overhead same)

**Bundle size** (CORRECTED):
- **Current (Electron)**: ~170MB (Bun ~100MB + Chromium ~70MB)
- **Electrobun**: ~100MB (Bun + app code, reuses OS WebKit: macOS system WebKit, Windows WebView2, Linux WebKitGTK)
- **Net reduction**: 50-70MB (30-40% smaller), because WebKit is pre-installed on the OS
- **This is substantial**: affects download size, CI/CD artifact storage, offline distribution

**Maintenance**:
- One less runtime (no Electron version tracking)
- **Cost**: Inherit Electrobun pre-1.0 instability

### Costs

**Time**: 2-12 weeks depending on PTY path

**Risk**:
- Electrobun pre-1.0 (breaking changes possible)
- Thin community (slow issue resolution)
- WebKit fragmentation (macOS WebKit ≠ WebView2 ≠ WebKitGTK; different CSS/DOM quirks)
- No auto-updater equivalent yet

**Ongoing maintenance**:
- Electrobun maintainer dependency
- Platform-specific PTY bugs (if you own the Zig port)
- Version chasing (Bun changes faster than Node)

**Opportunity cost**: 6-7 weeks could be spent on:
- Specs 043+ (agent-specific integrations)
- Cordis plugin load optimization (real bottleneck)
- CLI online control (Scope B Phase 3)
- Web surface parity

---

## Verdict

**Migration is feasible but not urgent.**

Effort: Medium (6-7 weeks likely)  
Benefit: Low-to-medium (10% startup, 20% bundle, maintenance reduction)  
Risk: Medium (Electrobun pre-1.0, node-pty unknown)

**Recommendation**:
- Spike now (1 week) to answer Cordis + PTY + API questions
- Defer implementation unless:
  - Performance becomes a user-reported issue
  - Bundle size blocks Web distribution
  - Team wants to de-risk the technical platform

Post-1.0 Electrobun is a better time to commit; framework stability matters more than 10% speed gain.

---

## References

- [Electrobun docs](https://electrobun.dev)
- [node-pty GitHub](https://github.com/microsoft/node-pty)
- [Bun FFI docs](https://bun.sh/docs/ffi)
- Cordis source: `deepseek-harness/packages/core/` in your repo
