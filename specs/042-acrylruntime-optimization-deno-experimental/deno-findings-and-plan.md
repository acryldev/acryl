# 042 Deno: measured findings and the experiment ladder

**Date**: 2026-10-07. **Status**: experimental. A research-to-decision ladder, not a migration commitment.
**Method**: measurements on this machine (macOS arm64) with Deno 2.9.7 (V8 15.0.245.2, TypeScript 6.0.3) and Deno
2.7.14, the installed `/Applications/ACRYL.app`, and the existing 042 probes run under Deno. Every number below was
measured; every claim not measured is marked **unverified**.
**Builds on**: [findings-rewrite-vs-reuse.md](./findings-rewrite-vs-reuse.md) (the Bun and Electrobun measurements of
2026-10-01). Those findings stay valid for Bun; this page adds Deno.
**Owner's research**: [research/denojs_for_acryl_overview.md](./research/denojs_for_acryl_overview.md) (why Deno:
`deno desktop` with the OS webview, Node and npm compatibility, permissions, built-in toolchain, celld).

## Why Deno, and the goal

The goal is a smaller, simpler ACRYL: drop the bundled Chromium (Electron) and ship a 100 to 200 MB application. Deno
is the candidate because `deno desktop` is part of the Deno runtime (since 2.9), uses the operating system's webview by
default (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), and the same runtime brings TypeScript without a
build, `fmt`/`lint`/`check`/`test`, a permission model, and `deno compile`.

## Findings

### F1. Size (measured)

| What | Size |
|---|---|
| Installed `ACRYL.app` today | **500 MB** |
| of which Electron (`Electron Framework.framework`, Chromium) | 228 MB |
| of which `Resources/app.asar.unpacked/node_modules` (ACRYL and Harness dependencies) | 263 MB |
| of which `app.asar` plus ACRYL `lib/` and the rest | about 9 MB |
| Minimal `deno desktop` app (`Deno.serve` hello page), Deno 2.9.7 | **65 MB** (`libruntime.dylib` 64.5 MB, `laufey_webview` 0.4 MB) |

Projected (arithmetic, not built):

| Shape | Projected size |
|---|---|
| Option A: Deno desktop window, host stays on Node (a bundled Node binary of about 110 MB) | about 440 MB |
| Option B: window and host both on Deno, dependencies unchanged | about 330 MB |
| Option B with dependencies cut to about 100 MB | about 165 MB (inside the 100 to 200 MB goal) |

So the size goal needs **Option B** (the host on Deno) **and** a dependency cut. Option A alone saves about 60 MB.

The 263 MB of dependencies is a long tail; the largest entries:

| Package | Size |
|---|---|
| `@deepseek-ai/*` | 26.6 MB |
| `@opentelemetry/*` | 19.4 MB |
| `@img/sharp-libvips-darwin-arm64` (sharp) | 17.0 MB |
| `openai` | 13.5 MB |
| `@shikijs/*` | 13.3 MB |
| `pnpm` (bundled) | 12.6 MB |
| `acryl-workspace` | 12.1 MB |
| `@google/genai` | 11.9 MB |
| `@anthropic-ai/sdk` | 10.9 MB |
| `web-streams-polyfill` | 8.6 MB |

`deno desktop --exclude-unused-npm` embeds only packages reachable from the static module graph. ACRYL loads most of its
plugins at run time through the Cordis Loader, so a static cut will not find them on its own: the profile's plugin set
has to be passed explicitly (`--include npm:<pkg>`) or bundled per profile.

### F2. `deno desktop` (measured)

- Built in to the Deno CLI: `deno desktop -o App.app main.ts`. Output formats include `.app`, `.dmg`, `.AppImage`,
  `.deb`, `.rpm`, `.msi`. Options include `--backend` (system webview, or CEF), `--engine` (V8, or the smaller
  experimental QuickJS), `--hmr`, `--icon`, `--target`, `--exclude-unused-npm`, `--include`.
- The hello-world bundle built and was ad-hoc code-signed in one command.
- Deno labels `deno desktop` **experimental** (also stated in the owner's research).
- **Unverified**: window behaviour, menus, tray, dialogs, auto-update, notarization, Windows and Linux builds, and the
  ACRYL client rendering in WebKit (042 E1 was never done either).

### F3. The ACRYL host on Deno (measured, 042 probe `e4-driver.mjs` and a serving variant)

Every run used a throwaway `HOME` and `ACRYL_HOME`, and a spare `ACRYL_WEB_PORT`. No file in `~/.acryl`, `~/.acryl-dev`,
`~/.dsh` or `~/Library/Application Support/ACRYL` changed (checked with `find -mmin -5`). The owner's running
`acryl-web` on port 3080 (Node) was not touched.

| Run | Result |
|---|---|
| `deno run -A probes/e4-driver.mjs` (boot, report, dispose) | Printed `BOOTED {"url":"http://127.0.0.1:3080"}`. **False positive**: 3080 is `serveWeb`'s fallback when neither `webServer` nor `webStartup` is provided (`apps/acryl-web/src/serve.ts`, `port = listening?.port ?? startup?.port ?? 3080`). The web server never started |
| Serving mode, plain `deno run -A` | Exits at once: `TypeError: Import "@deepseek-ai/dsh-tools" not a dependency`. Deno's npm resolver does not resolve the plugin packages that ACRYL materializes into profile folders with pnpm (the same class as 042 E4 item 5 on Bun) |
| Serving mode, `deno run -A --node-modules-dir=manual` | The process stays up and prints `ACRYL web: http://127.0.0.1:3080` (the fallback again). It listens on no port; the spare port refuses connections. The throwaway home holds a created `profiles/web` (`cordis.yml`, `cordis.patch.yml`, `package.json`, `pnpm-workspace.yaml`) but no installed plugin packages. No error was printed |

**2026-10-07 follow-up, root cause found (probe `d1b-diagnose-fibers.mjs`).** The earlier conclusion ("neither
installed nor resolved... the failure is silent") was imprecise on both points; corrected below.

- **Package resolution is not the blocker.** `materializeProfilePackage()` (`engine-dsh.ts:511`) already symlinks
  ACRYL-owned packages into the profile's `node_modules` from the `dsh` install anchor (`apps/acryl-web`'s own,
  already pnpm-installed `node_modules`), and this works unmodified under `deno run -A --node-modules-dir=manual`
  (confirmed directly: a scratch two-package symlink chain, including a nested undeclared-dependency case, resolved
  correctly with no `package.json` "dependencies" entry needed - Deno's manual node_modules mode walks directories
  the same way Node does). Symlinking the two pinned Harness bundle packages the `web` profile needs
  (`@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`) into the profile the same way, sourced from `apps/acryl-web`'s
  own installed copies, also resolves without error. Neither package install nor resolution is what's failing.
- **The failure is not silent - it is a Cordis fiber in FAILED state that `serveWeb()`'s own wrapper never
  inspects.** `serveWeb()` only reads `ctx.get('webServer')`/`ctx.get('webStartup')` after boot; it never checks
  fiber state, and a child fiber's failure does not reject the host's own boot promise (Cordis stores it on the
  fiber and moves on - the project's own "PENDING is valid state" rule generalizes to "a failed fiber doesn't crash
  its parent" too). Walking `ctx.registry` directly (every `Plugin.Runtime`'s `fibers`, each with a public `.state`
  and a TS-private-but-JS-readable `._error`) surfaces it immediately: the `mountDshEngine` plugin fiber is
  `FAILED` with this error, from inside the pinned Harness's own `@deepseek-ai/dsh-app-boot` package:

  ```
  Error: node-addon-require-builtin unsupported: Unsupported/no-context (required V8 current-context symbols were not found)
      at Object.requireBuiltin (node-addon-native-custom-loader/lib/index.js:572:28)
      at Object.requireBuiltin (node-addon-require-builtin/lib/index.js:13:16)
      at internalModules (@deepseek-ai/dsh-app-boot/lib/index.js:1576:26)
      at installRuntimeInterception (@deepseek-ai/dsh-app-boot/lib/index.js:1642:80)
      at new PluginPackages (@deepseek-ai/dsh-app-boot/lib/index.js:3215:24)
  ```

  `dsh-app-boot`'s `PluginPackages` class - the component that resolves a profile's bare-specifier plugin imports at
  run time - uses `node-addon-require-builtin` (via `node-addon-native-custom-loader`) to reach the same class of
  Node-internal machinery as the already-known `--expose-internals` gap (F4's first row), but as a **native addon**
  that calls into specific V8 internal context symbols, not a CLI flag. Deno's V8 build does not expose them, so
  the addon throws at construction, `PluginPackages` never exists, `mountDshEngine`'s fiber fails, and every row
  beneath it (`webServer`, `webStartup`, `connection`, the served client) never even registers as a child fiber -
  not PENDING, not FAILED, simply never created. This is the real reason nothing listens and nothing is logged.

**D1 exit criterion: not met.** This is a harder blocker than "run an install step": it is a hard dependency on
Node-specific V8 internals inside the pinned `deepseek-harness` submodule's own `@deepseek-ai/dsh-app-boot`
package, which this repository must not edit. Per F4, the fallback-to-plain-`import()`
path (`vendor/loader/src/config/tree.ts:154-160`) exists for when the internal loader is *absent*, but
`PluginPackages` here doesn't check for absence - it tries the native addon unconditionally and only an absent/failing
*flag* (`--expose-internals`) is handled as "absent" elsewhere; a present-but-throwing native addon is a different,
unhandled failure mode.

**2026-10-07, D1 closed - a Tier 1 fix, entirely in ACRYL's own code.** `PluginPackages`'s constructor
(`dsh-app-boot`'s own code) already no-ops cleanly when its config carries no `resolution`
(`if (config.resolution === void 0) return`), and `mountDshEngine` (`engine-dsh.ts:229`, ACRYL's own
package, not the submodule) already had the matching `if (composition.runtimeResolution !== undefined)`
guard - both already built for exactly this kind of graceful skip, just never exercised. The fix:
wrap the `ctx.plugin(PluginPackages, ...)` call in a try/catch; on failure (confirmed only ever the
native-addon throw above - the existing Node test suite, 22 tests across 4 spec files, passes
unmodified, so this never engages under Node), materialize every entry in
`composition.runtimeResolution.entries` (the exact package table `PluginPackages` would otherwise have
routed to - `{name, packageDir}` pairs, already computed regardless) as a real `node_modules` symlink in
the profile, via the same idempotent symlink helper `materializeProfilePackage` already uses for
ACRYL-owned packages (refactored out as `linkPackageInto`, shared by both). Plain Loader `import()`
resolution then finds every package the profile needs, the same way it already finds ACRYL's own.

Verified end to end (3 clean runs, fresh throwaway profile each time, spare port, real listening socket
confirmed and freed afterward): `GET /` without a token now returns **404**, matching the Node baseline
exactly (this doc's own earlier D1 criterion). The real `apps/acryl-web` build had to be rebuilt too -
its `tsdown.config.ts` sets `noExternal: ['acryl-harness-runtime']`, so it bundles the package rather
than importing it live; a probe or diagnostic that imports `acryl-harness-runtime` directly (like
`d1b-diagnose-fibers.mjs`) will show a fix before `apps/acryl-web`'s own build does.

**What this does not restore:** `PluginPackages.replace()` - installing or updating a profile package
live, without a process restart (Market install, plugin hot-swap). That capability needed the native
interception; the fallback only covers initial resolution. See "Tier 2" below for what closing that gap
would actually require.

**Tier 2 scope (not started): replacing `PluginPackages`'s live interception itself.** Read through
`dsh-app-boot`'s compiled source to scope this concretely rather than guess:
- **Stays as-is, no Deno problem:** the data layer - `collectInstallationScopePackages`,
  `createRuntimeResolution`, `compileResolution` (profile dependency-closure traversal and the package
  table itself) is plain JS, no native internals, already proven to work (it's what both this fix and
  the original failing path both consume).
- **The actual Node-internals-dependent part:** `internalModules()` + `installRuntimeInterception`
  (~250 lines) monkeypatch Node's private ESM loader (`loader.resolveSync`) and CommonJS resolver
  (`cjs._resolveFilename`) so that *any* bare specifier, anywhere in the process, routes through the
  table live - including a `replace()` that swaps the table for a newly-installed generation without
  touching physical `node_modules` - plus `registerWorkerResolution` (~10 lines) propagating the same
  table into Harness worker threads via `node:worker_threads`' `setEnvironmentData`.
- **Candidate replacement, not yet investigated:** Node's own *public*, documented loader-hooks API
  (`node:module`'s `register()`), as opposed to the private internals this addon reaches for instead.
  If Deno supports that public hook API for this purpose, the same `ResolutionRouter`/table logic could
  likely be re-wired through it - a moderate, scoped job, not a redesign. If Deno does not support it
  either, the realistic fallback is coarser: make a live install/update actually rewrite the
  `node_modules` symlinks on disk (same mechanism as this fix, just triggered by `replace()` instead of
  only at boot) rather than swap resolution in-process - workable, but a behavior change (no longer a
  pure in-memory swap) that needs its own design pass, and worker-thread consistency would need a
  separate answer (e.g. re-deriving the symlink target from the shared `node_modules` directory itself,
  since workers already see the same filesystem).
- **Verdict:** closing Tier 2 fully is a scoped investigation plus implementation, not a one-line patch
  and not an open-ended rewrite either - realistically a design spike (confirm or rule out the public
  hook API under Deno) followed by an implementation sized to whichever path that spike finds. Not
  started; D1's exit criterion does not require it.

### F4. Known gaps carried over from the Bun work (not yet retested on Deno)

| Gap | Where | Deno status |
|---|---|---|
| Cordis Loader and HMR use Node's private ESM loader (`--expose-internals` or `node-addon-require-builtin`) | `deepseek-harness/vendor/loader/src/internal.ts`, `vendor/hmr/src/index.ts`; ACRYL checks the flag in `runtime/acryl-harness-runtime/src/index.ts:222` | **Confirmed failing, not just unverified (F3 2026-10-07 follow-up).** `@deepseek-ai/dsh-app-boot`'s `PluginPackages` uses `node-addon-require-builtin` unconditionally (no absent-internals fallback) and throws under Deno's V8 (`Unsupported/no-context`), failing the whole engine fiber. This is D1's actual blocker, not a resolution or install gap |
| Terminal: `node-pty` (native addon) | `plugins/acryl-workspace/src/pty/node-pty-spawn.ts`; harness `packages/subprocess/subprocess-local/src/terminal.ts` | **Confirmed failing (F7, 2026-10-08).** The addon loads and `spawn()` returns a live pid with no error, but `onData`/`onExit` never fire - the native PTY I/O pump itself is not integrated with Deno's event loop. Not a resolution/throw problem like D1; no equivalent fallback found yet |
| Session query store: `node:sqlite` | harness `packages/session-query/session-query-sqlite` | **Confirmed working (F7, 2026-10-08).** `import('node:sqlite')` succeeds |
| WebSocket upgrade with `ws` over `node:http` | `plugins/acryl-workspace/src/pty/stream.ts`, `plugins/acryl-agent-control/src/host/stream.ts` | Unverified on Deno |
| `node:module` `findPackageJSON`, `registerHooks`, `stripTypeScriptTypes`; `node:util` `getSystemErrorMessage` | ACRYL `package-overlay.ts`, `engine-dsh.ts`; harness `dsh-subprocess-local`, `dsh-code-runtime-worker-thread` | Unverified on Deno |
| Other native modules | `koffi` (8 packages declare it), `sharp` (6), `sherpa-onnx-node` (1), `@xterm/headless` (3) | Unverified on Deno |
| Shell rewrite | 12 modules import `electron` (listed in findings-rewrite-vs-reuse.md); packaging, signing, notarization and updates (`electron-builder`, `src/updates/`) | Must be rewritten for any non-Electron shell |

Several of these sit in the pinned `deepseek-harness/` submodule, which this repository must not edit. They need an
ACRYL-owned replacement plugin (provider replacement through profile composition) or an upstream change.

### F5. What already works on Deno (measured in the AIMBRACE repository, same machine)

- `npm:@deepseek-ai/cordis@4.0.4` (the Cordis ACRYL runs on): plugins, `provide`/`get`, `inject` pending and start,
  `effect` cleanup, events with listeners removed on dispose, child fibers, typed services by `Context` augmentation.
- A Cordis app on `Deno.serve`, tested with `Deno.test` under Deno's resource and op sanitizers, run with
  `--allow-net=127.0.0.1` and nothing else.
- Re-loading a plugin with a fresh `import()` is the planned replacement for HMR there (AIMBRACE spec 012, Phase 2).

### F6. Plugin hot reload inside a packaged `deno desktop` app (measured)

Question: once ACRYL ships as a `deno desktop` binary, can an agent still write its own Cordis plugin at run time and
hot-reload it, the way `cordis-plugin-hmr` does today?

Tested under `deno run`, `deno compile`, and the actual `deno desktop` binary (`laufey_webview`), with a throwaway
scratch project (deleted after, no leftover processes):

| What was tried | Result |
|---|---|
| Write a plugin `.ts` file at run time, `import(file?v=1)`, mount with `root.plugin(mod)`, dispose with `fiber.dispose()`, rewrite the file, `import(file?v=2)`, remount | Works in all three: `deno run`, `deno compile`, and the packaged `laufey_webview` binary. Output confirmed both versions ran and both disposed cleanly: `{"ok":true,"results":["hello from version 1","hello from version 2"],"disposed":[1,2]}` |
| What a run-time-written plugin can `import`, tested under `deno compile` with an empty `DENO_DIR`/`HOME` (simulates a user machine, no cache to fall back on) | Embedded `@deepseek-ai/cordis` (bare specifier): works. Embedded `npm:@deepseek-ai/cordis@4.0.4`: works. A sibling file written next to the plugin: works. An npm package **not** in the build (`npm:is-odd@3.0.1`): fails, `Could not find constraint 'is-odd@3.0.1' in the list of packages`. A JSR package **not** in the build (`jsr:@std/assert@1.0.19`): fails, `Module not found` |

Conclusion:

- **Reload itself works**, including in the packaged desktop binary: fresh `import()` plus Cordis's own
  `dispose()`/remount cycle replaces what `cordis-plugin-hmr` does today, with no file-watching and no Node
  internals. This is the same mechanism as AIMBRACE spec 012 Phase 2, so D2 there and D2 here share one answer.
- **The limit is dependencies, not reload.** A `deno compile` / `deno desktop` binary is a closed module graph: a
  plugin an agent writes at run time can import Cordis, any npm or JSR package the build already embedded, and its
  own sibling files, but **not** a new npm or JSR package absent from the build. There is no `npm install` inside a
  compiled binary.
- `cordis-plugin-hmr` (chokidar file-watching, `--expose-internals`) does not apply here and is not needed: the
  reload path is explicit (the plugin host calls `import()` again), not a filesystem watcher.
- Old module versions stay resident in memory after a reload (V8 does not unload a module namespace); not measured,
  expected fine for a single editing session, cleared by an app restart. Unverified as a long-running-session
  concern.
- Not yet run: the import-limit probe (new npm/JSR package test) against the actual `deno desktop` binary, only
  against `deno compile`. Expected to be identical since both are the same compiled-binary module resolver, but
  unverified.
- Implication for D2 and the eventual Cordis builder (AIMBRACE spec 012 Phase 2, and any ACRYL Development-Canvas
  agent authoring loop): the dependency set an agent-written plugin may use has to be decided and bundled at build
  time, not discovered at run time. Options, none chosen yet: ship a curated dependency allowlist via
  `--include npm:<pkg>` per profile (same mechanism F1 already needs for the Loader's own profile plugins); restrict
  agent-authored plugins to the embedded set plus plain TypeScript; or ship an unpacked `node_modules` next to the
  binary that `--node-modules-dir=manual` can resolve from, at the cost of the size goal in F1. Also scope
  `--allow-write` to the plugin directory only, not the whole app.

### F7. D3 (native/Node-API pieces): first pass, `probes/runtime-compat.mjs` (2026-10-08)

Ran unmodified except a mislabeling fix (the probe's own runtime-detection checked `process.versions.node`
before `typeof Deno`, and Deno's own Node-compat shim also sets that field, so every Deno run printed
"node" - fixed to check `Deno` first). Side-by-side against real Node on the same machine:

| Probe | Node 24.19.0 | Deno 2.9.7 |
|---|---|---|
| P1 `node-pty` data+exit events | OK | **FAIL** - no data, no exit event |
| P2 `node:sqlite` available | OK | OK |
| P3 re-import: file URL `?v=i` | 50/50 | 50/50 |
| P3 re-import: bare path `?v=i` | 50/50 | 50/50 |
| P3 re-import: `require.cache` eviction | 1/50 (expected - not the mechanism ACRYL uses) | 1/50 |
| P4 Cordis apply/dispose x500 | OK | OK |

**P1 (`node-pty`) is the serious result, and it is a different *kind* of failure than D1's.** It is not a
throw to catch: `require('node-pty')` succeeds, `pty.spawn(...)` returns without error and a real, live
pid (`process.kill(pid, 0)` does not throw), but `onData`/`onExit` never fire - not within 4 seconds for a
command (`echo hello-from-pty; sleep 1`) that completes in about 1 second under Node. The native addon's
own low-level PTY I/O polling is not integrated with Deno's event loop; the child process plausibly ran
and even plausibly produced output, but nothing pumps it to the JS side, and nothing reaps its exit.
Confirmed with a dedicated diagnostic (`d3-pty-diagnose.mjs`, scratch, not committed - the three
observations above are the reproducible result). Unlike D1, there is no equivalent "catch and fall back to
plain JS" option available here: PTY allocation has no portable pure-JS substitute, and the native addon
not throwing means feature-detection can't even catch this one at the usual place - a plugin or terminal
service that calls this would hang, not fail loudly.

This directly affects: ACRYL's own embedded terminal (`plugins/acryl-workspace`), and, per the 3rd-party
marketplace survey the same day, several real published plugins (`dsh-TUI`, `dsh-tianshu-tui`,
`DSH-better-sidebar`) that are terminal-shaped and almost certainly depend on this same package.

**Not yet run:** `koffi`, `sharp`, `sherpa-onnx-node`, `@xterm/headless`, the `ws`-over-`node:http` upgrade,
and `probes/e5-ws-worker.mjs` (worker threads with `node:vm`). P1's failure mode (native addon loads,
no error, but the actual I/O/event delivery is silently absent) is now a known pattern to specifically
check for in each of these, not just "does it throw."

## Options

- **Option A, Deno desktop as shell only.** The host stays on Node as a child process; the webview loads its local URL
  (Desktop already loads the host's own URL today). Lowest risk, but ships Node next to Deno: about 440 MB. Does not
  meet the size goal.
- **Option B, host on Deno.** Meets the size goal only with a dependency cut. Needs every gap in F3 and F4 closed.

The ladder below tests Option B step by step and keeps Option A as the fallback.

## The experiment ladder

Each step has an exit criterion. Stop at the first failing step, record the result in this file, and decide before
going further. All runs follow the probe safety rules at the end.

| Step | Question | How | Exit criterion |
|---|---|---|---|
| **D1** | Can Deno install and resolve a profile's plugin packages? | Find where the profile install runs (pinned pnpm) and why it does not run or does not report under Deno; then make the Loader's imports resolve from the profile folder (`--node-modules-dir=manual` with an installed profile, or an import map generated from the profile). Probes: `probes/d1-deno-host.mjs` (serving-mode run), `probes/d1b-diagnose-fibers.mjs` (fiber-state dump - use this one when `d1-deno-host.mjs` prints "no answer" with nothing else, since a failed child fiber does not reject `serveWeb()`'s own promise) | **Met (2026-10-07).** `GET /` returns 404 without a token, matching the Node baseline, confirmed over 3 clean runs. Fixed in ACRYL's own `engine-dsh.ts` (not the submodule): catch `PluginPackages`'s native-addon failure and materialize its package table as `node_modules` symlinks instead (F3's "Tier 1" fix). Existing Node test suite (22 tests, 4 spec files) passes unmodified. Live package replace without a restart is not restored - see F3 "Tier 2 scope" |
| **D2** | Does the Cordis Loader work without Node internals? | With D1 passing, enable and disable a profile row at run time; reload one plugin with a fresh `import()` | Enable, disable and reload all take effect; no `--expose-internals`; HMR replacement designed (F6 already verifies the reload mechanism itself, including inside the packaged binary; shared with AIMBRACE 012 Phase 2). Remaining open item: decide and bundle the agent-plugin dependency allowlist (F6) |
| **D3** | Do the native and Node-API pieces work? | Run 042's `probes/runtime-compat.mjs` and `probes/e5-ws-worker.mjs` under Deno: `node-pty` events, `node:sqlite`, module re-import, `ws` upgrade, `worker_threads` with `node:vm`; then `koffi`, `sharp` | Each item passes, or has a named replacement (for example `Deno.Command` with a PTY, `jsr:@db/sqlite`, `Deno.upgradeWebSocket`) |
| **D4** | Does the ACRYL client work in WebKit? | Open the D1 host URL in Safari (same engine as WKWebView); check terminal (xterm, `@xterm/addon-webgl`), editor, layout | Usable without layout or rendering defects, or a list of fixes |
| **D5** | Does a `deno desktop` window host ACRYL? | A Deno desktop entry that starts the host (Option A: Node child; Option B: in process) and opens a window on its URL | The window shows the authenticated client; Ctrl+Q stops host and window cleanly; port freed |
| **D6** | What is the real size? | Build the D5 app with the profile's plugin set included explicitly; then remove dependencies a desktop build does not need (unused provider SDKs, telemetry exporters, bundled pnpm, `sharp` if unused) | Measured `.app` size; target 100 to 200 MB |
| **D7** | Shell parity | Map the 12 Electron modules (menu, tray, dialogs, windows, recovery window, profile window, workspace admission) and the updater, signing and notarization to `deno desktop` | Every Desktop feature has a Deno equivalent or a recorded gap |

Decision after D3: if the gaps are closable without editing `deepseek-harness/`, continue with Option B; otherwise
continue D4 to D7 with Option A, accept the size, and revisit when Harness or Deno change.

## Probe safety rules

- Always set `HOME` and `ACRYL_HOME` (and `DSH_HOME` when used) to a fresh `mktemp -d` folder, and `ACRYL_WEB_PORT` to a
  spare port. Never let a probe default to `~/.acryl`, `~/.dsh` or port 3080.
- Do not trust a printed URL: check the process's real listening sockets (`lsof -a -p <pid> -iTCP -sTCP:LISTEN`) and
  request the spare port.
- Stop every probe process, confirm its port is free, and delete its throwaway home afterwards.
- After each run, confirm no file in the real homes changed (`find <home> -mmin -5`).

## Relation to AIMBRACE

AIMBRACE (separate repository) already runs Cordis on Deno and needs the same loader replacement for its builder.
Solving D2 there first gives ACRYL a tested reload mechanism to adopt.
