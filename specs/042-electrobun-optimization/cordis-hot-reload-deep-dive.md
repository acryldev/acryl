# Cordis Hot-Reload on Electrobun: Technical Deep Dive

**TL;DR**: Bun's module system is compatible enough with Node's that Cordis _should_ work unchanged. But the hot-reload machinery (dynamic `import()`, module cache eviction) has untested edge cases on Bun. **This must be validated in a spike before committing to migration.**

---

## What Cordis Does (Module Level)

Cordis is a **plugin framework** that:

1. **Loads plugins dynamically** via `import()` at runtime
2. **Caches modules** in memory
3. **Evicts cache on reload** to force re-instantiation
4. **Injects dependencies** via IoC container
5. **Tracks lifecycle** (PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED)
6. **Handles config-driven activation** (YAML + runtime overrides)

**Key assumption**: Node's module cache (`Module._cache`) can be cleared and re-imported reliably.

---

## How ACRYL Uses Cordis for Self-Extension

ACRYL's entire plugin ecosystem depends on hot-reload:

**Example: spec 041 Agent Control**
- User or agent installs `cordis-plugin-market` package
- CLI runs `acryl plugin install @acryl/ui-control-mcp`
- Package lands in node_modules
- User flips "enabled" in Settings
- Cordis reloads the plugin row
- Host re-imports the plugin module
- Client re-mounts the UI contribution
- Agent can now control the app (no restart needed)

**If hot-reload breaks**: Every plugin change requires a full app restart. That's a regression from today's behavior.

---

## Bun's Module System vs. Node's

### What works (✓)

**Dynamic imports**
```ts
const plugin = await import('./plugin.js');
```
- ✓ Bun supports `import()` since early versions
- ✓ Returns a module namespace
- ✓ Works at runtime

**ESM module format**
```ts
export default class MyPlugin { ... }
```
- ✓ Bun is ESM-native
- ✓ ACRYL uses ESM exclusively
- ✓ No CommonJS interop issues

**Module metadata**
```ts
import.meta.url  // ✓ works
import.meta.dir  // ✓ works
```
- ✓ Bun implements both

### What's uncertain (⚠️)

**Module cache clearing**
```ts
// Node: delete require.cache[path]
// Cordis equivalent: delete import.meta.hot.invalidate()
```
- Bun HAS a module cache
- Bun HAS a way to invalidate it (`import.meta.hot` and Bun's bundler API)
- **Unknown**: Does it behave identically under rapid reload cycles?
- **Unknown**: Do dependencies re-execute cleanly?

**Example scenario**:
1. Plugin A registered Cordis service `FooService`
2. Unload: remove from cache, dispose service
3. Reload: re-import Plugin A
4. Plugin A's top-level code runs again
5. Service re-registers

**On Node**: This works reliably (we do it with `node-pty` PTY pools daily).

**On Bun**: Should work, but:
- Module cache eviction API may differ slightly
- Timing of module execution may change
- Top-level side effects (registrations) may execute in different order
- Services with lingering references may not clean up

---

## Cordis's Actual Hot-Reload Code

In `deepseek-harness/packages/core`:

```ts
// When a plugin is unloaded:
1. Call plugin.dispose()            // Stop all services
2. Remove from graph                // Update dependencies
3. Return/revoke service instances  // Cleanup
4. Clear module cache (unclear HOW on Bun)

// When a plugin is reloaded:
1. Re-import the module
2. Reinstantiate the plugin class
3. Call plugin.activate()
4. Re-register services
```

**The risky part**: Step 3 in unload. If module cache isn't fully cleared, the re-import might return the old module instance, causing:
- Services double-register (DI container error)
- Old service instances leak memory
- State from previous load persists (bug)

---

## Bun's Module Hot-Reload API

From Bun docs:

**Invalidate a module**:
```ts
if (import.meta.hot) {
  import.meta.hot.invalidate();
}
```

This tells Bun to clear the module from its cache. Bun will re-load the file on next import.

**Soft reload** (Bun native):
```ts
bun.flushSync();  // Flush file cache
delete Bun.cache[modulePath];  // Remove from bundler cache
```

**Problem**: Bun's exact cache structure and invalidation semantics are not fully documented. Electrobun uses Bun's internals, which may change.

---

## Validation Strategy (3-day spike)

### Day 1: Set up Bun + Cordis

```bash
# Create minimal Bun + Cordis project
mkdir cordis-bun-test
cd cordis-bun-test
bun init

# Install Cordis from deepseek-harness
bun add @deepseek-ai/cordis
```

### Day 2: Implement reload test

```ts
import { Context, Service } from '@deepseek-ai/cordis';

class TestService extends Service {
  counter = 0;
  increment() { this.counter++; }
}

async function loadPlugin(path: string) {
  const module = await import(path);
  return module.default;
}

async function reloadPlugin(path: string, ctx: Context) {
  // Unload
  ctx.registry.remove(...); // Cordis API
  
  // Clear cache
  if (import.meta.hot) import.meta.hot.invalidate();
  
  // Reload
  const module = await import(path + `?t=${Date.now()}`);
  ctx.registry.add(...);
}

// Run 20x: load → use → unload → reload
for (let i = 0; i < 20; i++) {
  await loadPlugin('./test-plugin.ts');
  // Verify service count, no double registration
  await reloadPlugin('./test-plugin.ts', ctx);
  console.log(`Reload ${i}: services=${ctx.registry.size}`);
}
```

### Day 3: Stress test + analysis

```ts
// Simulate rapid plugin toggle (like user clicking "enable" repeatedly)
async function stressTest() {
  for (let reload = 0; reload < 100; reload++) {
    const ctx = new Context();
    
    // Load
    const plugin = await loadPlugin('./acryl-workspace.js');
    ctx.use(plugin);
    
    // Unload
    ctx.dispose();
    
    // Reload (same module)
    const plugin2 = await import('./acryl-workspace.js?bust=' + reload);
    ctx.use(plugin2);
    
    // Check: are we getting fresh instances?
    console.log(reload, ctx.services);
  }
}
```

**Success criteria**:
- [ ] No double-registration errors
- [ ] Service instances are fresh each reload
- [ ] No memory leaks (measure heap growth)
- [ ] No race conditions (async settle properly)

---

## If Spike Fails (Module Cache Issue)

If Bun's cache eviction doesn't work like Node's, three options:

### Option 1: Work around it in Cordis (1-2 weeks)

Patch Cordis to:
- Track module identity separately from cache
- Invalidate services without relying on module cache clear
- Use Bun-specific cache APIs if available

This is **possible but requires Cordis maintainer buy-in** (they maintain deepseek-harness).

### Option 2: Defer hot-reload on Electrobun (breaks MVP)

Ship Electrobun without hot-reload:
- Plugins still load
- Changes require app restart
- Regression from current behavior
- Users accept it for the sake of migration

**Cost**: Feature parity loss.

### Option 3: Keep Electron, add Bun as alternative backend

ACRYL ships two entry points:
- `apps/acryl-desktop` (Electron)
- `apps/acryl-desktop-bun` (Electrobun)

Both run the same Cordis engine. Users choose which launcher to use.

**Cost**: Maintenance burden (two distribution channels).  
**Benefit**: Can iterate on Electrobun without breaking users; easy A/B test.

---

## Most Likely Outcome

**Cordis will work on Bun with no changes to Cordis itself.**

**Why**: 
- Bun was designed for Node compatibility
- Dynamic import + module cache are fundamental Node APIs
- Electrobun is shipping real apps already (it works at that level)
- Hot-reload is table-stakes for plugin frameworks; Electrobun team likely tested this

**But**: It's **not guaranteed** until tested. Module cache behavior under stress is subtle.

---

## What This Means for ACRYL

If migration happens, this is what stays intact:

✅ **Self-extension architecture**: Agent Control, workspace plugins, market plugins, all compose via Cordis.

✅ **Hot-reload workflow**: User enables plugin → Cordis loads it → no restart needed.

✅ **Plugin ecosystem**: Any package in the market can drop in.

✅ **Agent control surface**: Spec 041, 037, 040 all rely on this; they all keep working.

⚠️ **Needs validation**: Run the spike. If it passes, you inherit Bun's stability (pre-1.0, so risk exists). If it fails, you have options (1-2 weeks to patch, or ship with restarts).

---

## Recommendation

**Before committing to Electrobun migration:**

1. **Run the 3-day Cordis + Bun spike** (Week 1 of any migration)
2. **Stress-test reload 100 times**, check for leaks, double-registration, stale references
3. **Profile memory and load time** to establish baseline
4. **Decision gate**: If spike passes cleanly, move forward. If not, pause and decide (patch, workaround, or defer).

This is the single most important validation. It determines whether migration is "doable" or "risky."

---

## Files to Watch

In your spike and any eventual migration:

- `deepseek-harness/packages/core/src/context.ts` (Cordis lifecycle)
- `deepseek-harness/packages/core/src/registry.ts` (service registration)
- `apps/acryl-desktop/src/profile.ts` (how Cordis is instantiated)
- `runtime/acryl-harness-runtime/src/plugin-lifecycle-state.ts` (plugin override logic)
- `plugins/acryl-ui-control/src/host/index.ts` (example of a real plugin)

These show exactly how hot-reload is orchestrated today.
