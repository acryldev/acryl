# 03 — Runtime Boot: `bootAcrylHarnessProfile()` Deep Dive

Source: `acryl-harness-runtime/src/index.ts` (plus `@deepseek-ai/dsh-app-boot` internals
and `@deepseek-ai/dsh-base`'s bundle patch). This is the function that turns "a package
name and a profile name" into a live Cordis root Context.

## The function

```ts
export async function bootAcrylHarnessProfile(
  options: BootAcrylHarnessProfileOptions,   // { profile: string; prepare?: (ctx) => void }
): Promise<AcrylHarnessRuntime>              // { ctx, profileDirectory, dispose() }
```

`BootAcrylHarnessProfileOptions.prepare` runs inside `boot()` after Loader installation
and before any config-tree entry mounts — the standard DSH host-setup hook (used by the
web variant to provide `cmdline`; the TUI variant passes nothing).

## Step by step

### 1. Resolve the profile directory

```
resolveProfileDir('acryl')  →  $DSH_HOME/profiles/acryl
```

- `$DSH_HOME` defaults to `~/.dsh` (env `DSH_HOME` overrides; the Desktop distribution
  uses its own `~/.dsh-acryl` home, the TUI uses the shared one).
- Profile names are validated (no `/`, `\`, `.`, `..`, `node_modules`).

### 2. `initProfile(dir, DEFAULT_PROFILE_BUNDLES)` — idempotent seeding

Creates, if missing (never overwrites):

- `package.json` — manifest `{"name":"dsh-profile-acryl", "private":true,
  "dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"]}}}` (`DEFAULT_PROFILE_BUNDLES`
  is exactly `["@deepseek-ai/dsh-base"]`; the shipped templates for `web`/`headless`
  differ but `acryl` has none, so it gets the default).
- `cordis.patch.yml` — the **user patch layer**, seeded as `[]`.
- `pnpm-workspace.yaml` — pnpm settings so out-of-tree plugins can install.

On this machine `~/.dsh/profiles/acryl/` exists with exactly that minimal manifest and
an empty user patch layer.

### 3. `healProfilesModuleFallback(dshInstallAnchor)`

Ensures `~/.dsh/profiles/node_modules/` exists and symlinks the app manifest's dependency
closure into it — the *installation fallback* the profile loader uses to resolve bundle
packages (`@deepseek-ai/dsh-base` etc.) even though the profile directory itself declares
no dependencies. Broken/wrong links are repaired; real directories throw loudly.

### 4. `loadProfile('acryl', 'acryl', dshInstallAnchor)`

Loads the profile definition: its bundle list, each bundle's **layers** (the include
trees and patches shipped by `@deepseek-ai/dsh-base`), and the profile's own user patch
layer. Returns `{ dir, layers: [...], patches: [...] }`.

### 5. Write the root config, compose the patch pipeline

```ts
writeFileSync(join(profile.dir, 'cordis.yml'), '[]\n')   // the Cordis ROOT is empty
const patches = structuredClone([
  ...profile.layers.flatMap(layer => layer.patches),      // bundle layers (dsh-base's giant insert)
  ...createAcrylCodingCapabilityPatches(new Set(['tui'])),// ACRYL capability rows
  ...profile.patches,                                     // user cordis.patch.yml
])
```

Key point: the root config is empty; **everything is expressed as ordered patch
entries** applied by the Loader over the empty root. `dsh-base`'s bundle patch is one
giant `insert` (see [04-service-composition.md](04-service-composition.md)); ACRYL's
capability patch then overrides two rows by id and inserts three; the user layer wins
last per row (patch replaces a row's whole `config`, it does not merge).

### 6. The HMR guard

```ts
const hmr = composeEntries([patches]).find(entry => entry.id === 'hmr')
if (hmr?.disabled !== true && !process.execArgv.includes('--expose-internals'))
  throw new Error('ACRYL profile enables Cordis HMR and must be launched with Node --expose-internals')
```

`dsh-base` mounts `@deepseek-ai/cordis-plugin-hmr` (root: `['.']`) in its insert, so the
guard fires unless the CLI was relaunched with `--expose-internals` (which
`bin.ts`/`node-launcher.ts` always does — see [01-launch-chain.md](01-launch-chain.md)).

### 7. `await boot('acryl', rootConfig, patches, options.prepare)`

The DSH boot sequence: install the Loader, apply patch entries, activate every row
**service-availability driven** (row order carries no load semantics — a row activates
when its dependencies exist), mount the include tree, and run `prepare` in the host
phase. The result is one `Context` (Cordis root) with all services resolvable via
`ctx.get(name)` and typed convenience accessors (`ctx.agents`, `ctx.tools`, …).

### 8. Install the ACRYL workspace-status tool

```ts
if (ctx.tools) installAcrylWorkspaceStatusTool(ctx)
```

`plugin-acryl-workspace-status.ts` is ACRYL's first real **model-facing tool**: an
ordinary Cordis plugin that `inject`s `tools`, registers via
`ctx.tools.register(defineTool(...))` with tool name `acryl_workspace_status`, declares a
canonical typed output schema and a separate `render(...)` for model-facing content,
honors `exec.signal`, and disposes cleanly with its Fiber. It reports the workspace
context (`cwd`, DSH home, profile) — ACRYL-owned context, deliberately *not* a
re-implementation of any DSH file/shell/web tool.

### 9. Return a frozen runtime handle

```ts
{ ctx, profileDirectory, dispose() /* idempotent; awaits ctx.fiber.dispose() */ }
```

`ctx.fiber.dispose()` unmounts every plugin in dependency order — watchers, timers,
sessions, persistence — which is what makes `acryl tui --json` a clean boot-and-probe.

## What the TUI checks after boot

```ts
runtimeState = ctx.get('sessions') && ctx.get('agents') ? 'ready' : 'unavailable'
```

Everything else (`llm`, `settings`, `credentials`, `tools`, `loader`, …) is probed
lazily at point of use so a reduced profile degrades to error notices instead of
refusing to start.

## Boot sequence diagram

```
bootAcrylHarnessProfile({profile:'acryl'})
  │
  ├─ resolveProfileDir ──────────── ~/.dsh/profiles/acryl
  ├─ initProfile ────────────────── manifest + cordis.patch.yml + pnpm-workspace.yaml
  ├─ healProfilesModuleFallback ─── profiles/node_modules symlinks healed
  ├─ loadProfile ────────────────── bundles=[dsh-base]; layers; user patches
  ├─ write cordis.yml = [] ──────── empty Cordis root
  ├─ patches = [ dsh-base layers → acryl capability rows → user layer ]
  ├─ HMR guard ──────────────────── requires --expose-internals (relaunched ✓)
  ├─ boot('acryl', …) ───────────── Loader install → patch apply → activation
  │                                  (service-availability driven)
  ├─ installAcrylWorkspaceStatusTool(ctx)
  └─ { ctx, profileDirectory, dispose }  →  handed to startDirectHost
```
