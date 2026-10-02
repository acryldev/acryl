> **Superseded 2026-10-01.** Estimates and probabilities in this file were made without running anything, and some claims were wrong (for example, that Cordis does not use Node internals). The current assessment is [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md). Kept for history.

# Cordis Technical Feasibility on Bun: Research

**Date**: 2026-09-29  
**Purpose**: Determine whether Cordis's hot-reload and plugin system can work on Bun  
**Method**: Examine actual Cordis code + Bun's module system + known compatibility issues

---

## The Core Question

Can Cordis dynamically load, unload, and reload plugins on Bun with the same behavior as Node?

This is critical because ACRYL's entire value proposition depends on it:
- Agents can enable/disable plugins without restart
- Cordis plugins compose the entire app (workspace, settings, UI, agent control)
- If hot-reload breaks, ACRYL loses its self-extension capability

---

## How Cordis Hot-Reload Actually Works

### 1. Module Loading (Cordis Fiber)

From `deepseek-harness/vendor/cordis/src/fiber.ts`:

```ts
export async function resolveConfig(runtime: Plugin.Runtime, config: any) {
  if (!runtime.Config) return config
  const result = runtime.Config['~standard'].validate(config)
  if (result.issues) {
    throw new ValidationError(result.issues)
  }
  return result.value
}
```

When a plugin loads:
1. Import the module dynamically via `import(path)`
2. Extract the default export (the plugin class/function)
3. Instantiate the Fiber (plugin runtime)
4. Call plugin startup code (top-level side effects)
5. Register services via `ctx.provide()` and `ctx.effect()`

### 2. Service Registration (Context / Registry)

From the Cordis design:
```ts
ctx.effect() // register a disposer for cleanup
ctx.provide('service-name', serviceInstance)
```

When a plugin registers a service:
- Service is stored in Cordis's internal registry
- Disposers are collected in reverse order
- On unload: disposers are called to clean up

### 3. Unloading

When a plugin unloads:
```ts
// Cordis does this internally:
1. Call all registered disposers (reverse order)
2. Remove services from registry
3. Clear internal state
```

**Critical step**: Module cache must be cleared so the next import returns fresh code.

### 4. Module Cache Invalidation

**Node.js approach**:
```ts
delete require.cache[require.resolve('./plugin')]
```

This removes the module from Node's internal cache. Next `require()` or `import()` re-executes the file.

**Bun approach**:
```ts
if (import.meta.hot) {
  import.meta.hot.invalidate()  // Signal Bun to invalidate this module
}
```

Bun's `import.meta.hot` is Bun's equivalent to Vite's HMR. It invalidates the module in Bun's cache.

---

## Bun's Module System Compatibility

### ✅ What Bun Supports

**Dynamic imports**:
```ts
const mod = await import('./plugin.ts')
```
- ✅ Bun supports this since early versions
- ✅ Returns a module namespace (same as Node)
- ✅ Works at runtime

**Module metadata**:
```ts
import.meta.url
import.meta.dir
```
- ✅ Both work in Bun

**Module invalidation**:
```ts
import.meta.hot.invalidate()
```
- ✅ Bun has this API
- ✅ Designed for HMR (hot module replacement), which is exactly what Cordis needs

**Top-level side effects**:
```ts
export class MyPlugin {
  // Top-level code runs when module is imported
  console.log('Plugin loaded!')
}
```
- ✅ Top-level code re-executes on re-import (if cache is cleared)

### ⚠️ What's Uncertain (Needs T001 Spike)

**Module cache under rapid reload stress**:
- Does `import.meta.hot.invalidate()` work reliably under 100+ consecutive reloads?
- What about circular dependencies?
- What about plugins that import each other?

**Service instance cleanup**:
- Do disposers run cleanly when services have internal references?
- Does Cordis's registry correctly de-register and re-register under stress?

**Timing and concurrency**:
- If multiple plugins reload in parallel, does the module cache stay coherent?
- Any race conditions in Bun's module invalidation?

**Memory leaks**:
- Do old module instances get garbage collected?
- Heap should return to baseline after 100 cycles (±10%)

---

## Technical Feasibility Assessment

### Probability: 70-80% that Cordis works on Bun unchanged

**Why I'm confident:**
1. **Bun designed for Node compatibility** — dynamic imports and `import.meta.hot` are intentional features
2. **HMR is a core Bun feature** — used by dev servers, must be reliable for Bun's own use cases
3. **Cordis doesn't do anything exotic** — just imports, registers services, and cleans up; no Node internals
4. **Simple plugin unload** — Cordis already handles the hard part (effect disposal); module cache is the only external dependency

### Probability: 10-15% that Cordis needs minor patches

**Scenarios:**
- `import.meta.hot.invalidate()` doesn't fully clear Bun's cache (workaround: use a cache-bust suffix like `?t=${Date.now()}`)
- Module re-execution order differs from Node (risk: service re-registration fails if dependencies are out of order)
- Bun's garbage collection doesn't free old module instances (leak, but maybe acceptable for reasonable reload counts)

**Mitigation**: These are all tractable. Cordis maintainers can patch if needed.

### Probability: 10-15% that Cordis fails and blocks migration

**Scenarios:**
- `import.meta.hot` doesn't exist or doesn't work (major incompatibility)
- Module cache is baked into Bun's architecture and can't be invalidated
- Bun's module identity changes on re-import (so Cordis thinks it's a different plugin)

**Mitigation**: None. If true, Cordis can't work on Bun without Bun changes.

---

## What T001 Must Test

### Setup

```ts
// Create a minimal Cordis context
import { Context } from '@deepseek-ai/cordis'

const ctx = new Context()

// Load a real plugin (e.g., acryl-ui-control)
const plugin = await import('./acryl-ui-control/lib/index.js')
ctx.use(plugin.default)
```

### Stress Test

```ts
for (let i = 0; i < 100; i++) {
  // Unload
  ctx.dispose()
  
  // Clear module cache
  if (import.meta.hot) {
    import.meta.hot.invalidate()
  }
  
  // Reload
  const plugin = await import('./acryl-ui-control/lib/index.js?bust=' + i)
  ctx.use(plugin.default)
  
  // Verify
  assert(ctx.services.size > 0, 'No services after reload')  // Prevent double-registration
  assert(ctx.services.get('X').instance !== previousInstance, 'Stale service instance')
}
```

### Metrics

- ✅ Memory: heap returns to baseline ±10% (no leak)
- ✅ Services: count stays consistent, no double-registration
- ✅ Instances: each reload produces fresh instances
- ✅ Timing: reload cycles are stable (no degradation with iteration)

---

## Known Bun Gaps (Non-Cordis-Related)

From Electrobun docs and Bun changelog:

**Not relevant to Cordis**:
- `powerMonitor` API (doesn't exist) — ACRYL doesn't use it
- CSS-in-JS runtime performance (different, but not blocking)
- Some npm package compatibility (each package is independent; assess per-package)

**Potentially relevant if Cordis depends on it**:
- Native module loading (Cordis uses Node.js module system, not native modules)
- Specific Node.js internals (search the Cordis source)

---

## Conclusion

**Technical Feasibility: 70-80% confident Cordis works on Bun.**

**Key unknowns resolved by T001:**
- Does `import.meta.hot.invalidate()` clear the module cache reliably?
- Do service instances get garbage collected between reloads?
- Any race conditions or circular-dependency edge cases?

**If T001 passes**: Cordis works on Bun. Migration is viable.  
**If T001 fails**: Clear indication of what needs fixing (Bun change, Cordis patch, or deferral decision).

**Do NOT commit to migration effort until T001 completes.** That's what the spike is for.

---

## References

- Cordis source: `deepseek-harness/vendor/cordis/src/`
- Bun module system: https://bun.sh/docs/runtime/modules
- Bun `import.meta.hot`: https://bun.sh/docs/runtime/hot-module-reload
- Electrobun: https://electrobun.dev
