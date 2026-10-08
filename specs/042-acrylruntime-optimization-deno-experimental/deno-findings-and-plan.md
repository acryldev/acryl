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
| WebSocket upgrade with `ws` over `node:http` | `plugins/acryl-workspace/src/pty/stream.ts`, `plugins/acryl-agent-control/src/host/stream.ts` | **Confirmed working (F7, 2026-10-08)**, upgrade roundtrip matches Node |
| `node:module` `findPackageJSON`, `registerHooks`, `stripTypeScriptTypes`; `node:util` `getSystemErrorMessage` | ACRYL `package-overlay.ts`, `engine-dsh.ts`; harness `dsh-subprocess-local`, `dsh-code-runtime-worker-thread` | Unverified on Deno |
| Other native modules | `koffi` (8 packages declare it), `sharp` (6), `sherpa-onnx-node` (1), `@xterm/headless` (3) | **Confirmed working (F7, 2026-10-08)**: one real operation each (libc call, resize+PNG encode, native binding load, buffer parse), identical to Node. `sherpa-onnx-node` only loaded its binding; no model was run |
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

**The rest of D3 (all measured, Node 24.19.0 vs Deno 2.9.7, same machine):**

| Probe (`probes/native-modules.mjs`, `probes/e5-ws-worker.mjs`) | Node | Deno |
|---|---|---|
| N1 `koffi` calls libc `strlen` through its FFI | OK | OK |
| N2 `sharp` creates, resizes and PNG-encodes an image | OK | OK |
| N3 `sherpa-onnx-node` loads its native binding (24 exports; no model run) | OK | OK |
| N4 `@xterm/headless` parses ANSI output into a buffer | OK | OK |
| E5a `ws` `noServer` upgrade over `node:http`, echo roundtrip | OK | OK |
| E5b `worker_threads` + `node:vm.runInContext` | OK | OK |

So **`node-pty` is the only D3 failure**. Everything else, including the Node-API addons, matches Node.

**Why `node-pty` fails, and the fix that works (the pty spike).** Split on the raw addon
(`prebuilds/darwin-arm64/pty.node`): both halves are dead on Deno. Reading the master fd through
`tty.ReadStream` delivers nothing, and the addon's native exit callback never fires (Node: both fire).
The master fd is non-blocking, so plain `fs`/`Deno.open` reads return `EAGAIN` rather than waiting;
`net.Socket({fd})` is unimplemented for this on Deno. Instead of patching the addon, `probes/deno-ffi-pty.ts`
(about 130 lines, no `node-pty`) builds a pty from libc through `Deno.dlopen`: `openpty`, `posix_spawnp`
(new session, slave dup2'd to 0/1/2), `poll()` plus `read()` for output, `waitpid(WNOHANG)` for the exit,
`ioctl(TIOCSWINSZ)` for resize. Measured:

| Check | Result |
|---|---|
| F1 output + exit code (`exit 3`) | OK, `{code: 3}` |
| F2 child sees a real tty (`[ -t 0 ]`), `TERM` set | OK |
| F3 interactive: write to the pty, child echoes (`cat`) | OK |
| F3b `kill()` ends the child | OK, signal 15 |
| F4 resize reaches the child (`stty size` -> `40 120`) | OK |
| F5 50 sequential spawns | 50/50, no leaked children |
| Ctrl-C (`\x03`) interrupts a running child | OK, `signal: 2` (SIGINT) |

Two traps found on the way, both Apple arm64 specific, both now handled in the probe and worth knowing
before porting: (1) the `posix_spawn` family takes a pointer *to* the `file_actions`/`attr` handle, not the
handle (passing the value segfaulted, exit 139); (2) `fcntl` and `ioctl` are variadic C functions and on
Apple arm64 variadic arguments go on the stack, so a plain FFI call passes garbage (this showed up as an
infinite hang, not an error). `poll()` is not variadic, so reads use it; `ioctl` gets six dummy register
arguments so the real one lands on the stack.

**What the spike does not cover.** macOS only: Linux needs different flag/ioctl values and its arm64 variadic
ABI is the ordinary one (the stack trick would break there); Windows needs ConPTY through `kernel32`, a
different design. It is a probe, not the adapter: ACRYL's `node-pty-spawn.ts` interface, backpressure, and
UTF-8 chunk boundaries (a multibyte character split across two reads) are not done. The submodule's own
`subprocess-local` terminal also imports `node-pty`; loading it is harmless (the addon loads), only calling it
hangs, and Harness chat mode does not use a pty, but this was not tested through a real Harness session.

### F8. D6-early and D4/D5, measured (2026-10-08, macOS arm64)

**Packaging that works.** A `deno desktop` shell (`probes/d5-desktop-spike/`, 3 KB of TypeScript) starts the real
`apps/acryl-web` host in-process and opens `new Deno.BrowserWindow()` on its authenticated URL. The payload (`lib/` +
production `node_modules`) sits on the **real disk** in `Contents/Resources/payload`, not inside the binary: a
compiled Deno binary embeds `node_modules` in a read-only virtual filesystem, and ACRYL's profile design
symlinks installed packages into the profile, which fails there (`NotSupported: symlink` from the embedded path).
Imported from disk, the same payload boots and answers `GET /` with 404, the Node baseline.

**It renders.** Asking the window itself (`win.executeJs`, so no screenshot of the desktop is involved): title
`ACRYL`, `readyState` complete, 494 DOM nodes, real client UI text ("New chat", "Describe what you want to build,
/ commands, @ files or sessions", "Workspace"), `.xterm` styles present, user agent WebKit. WebKit held 9 parallel
connections to the host. On stop, the port was freed and no process remained. This closes D4 (the client works in
WKWebView at first look; layout was not inspected pixel by pixel) and the core of D5.

**Size (apparent bytes, one machine, ad-hoc signed `.app`; DMG = `hdiutil` UDZO zlib-9).**

| Build | Installed | Compressed DMG |
|---|---|---|
| Electron release `ACRYL-0.1.7-arm64.dmg` (existing artifact; F1 measured the installed app at 500 MB) | 500 MB | **190.6 MB** |
| Deno shell + full-feature payload (type declarations pruned only) | **403.1 MB** | 191.6 MB |
| Deno shell + lean payload (no LibreOffice kit and document preview, no voice, no libvips) | **193.0 MB** | **107.6 MB** |

Where the lean number comes from: `deno desktop` runtime 64.9 MB + payload 128 MB. The web surface's production
closure is 712 packages, 381 MB native-pruned. Removing the three heavy optional packs (LibreOffice kit 146.1 MB plus
document-preview 13.9 MB, `sherpa-onnx` 32.5 MB, `sharp` libvips 17.3 MB) leaves 171 MB, and pruning type
declarations (43 MB, nothing loads them) and non-ACRYL markdown (4 MB) leaves 123.8 MB. Every variant was
boot-tested (listening, `GET /` answered).

**Superseded by F10 below (this table compared against the wrong feature set; the shipped Electron app never contained LibreOffice or sherpa, and the lean build wrongly dropped libvips).** Original text: **Gate verdict (the 200 MB line set before measuring): passes only as the lean build, by 7 MB (3.5%).** With every
feature in, the Deno app is 403 MB installed (about 100 MB below Electron) and downloads at the same size as
Electron's DMG. So the experiment's premise holds *if and only if* LibreOffice document preview, voice and
`sharp`'s native image library become **on-demand downloads**, a product decision, not an engineering one. That
decision is the thing to take to the owner before D7.

Caveats on the number: lean = the web surface's closure, not Desktop's shell code (small, but not zero); the lean
build was boot- and render-tested, not feature-tested without the packs (what each cut feature does when its
pack is absent is untested); one platform; `deno desktop` is experimental. Further cuts exist but were not taken:
the provider SDKs total about 30 MB, and JS minification was not tried.

**Observations for D7 (shell parity).** The `Deno.BrowserWindow` instance exposes `setApplicationMenu`,
`onmenuclick`, `showContextMenu`, `setSize`/`setPosition`/`setTitle`/`setOpacity`/`setAlwaysOnTop`/`setResizable`,
`show`/`hide`/`focus`/`close`, `openDevtools`, `executeJs`, `getNativeWindow`, and the runtime has `Tray` and
`Dock`. No native **dialog** API was found (the directory picker in `apps/acryl-desktop` uses Electron's), so that
one needs FFI or an OS helper. The desktop runtime also **chooses the port** and ignores `ACRYL_WEB_PORT`, waits 15 s
for a `Deno.serve` it never gets before navigating (it still works; the delay is avoidable), and grants nothing by
default: the app needs `-A` or an explicit permission list at build time (a feature to use, not a defect).

### F9. The soft spots closed or measured (2026-10-08)

**Real terminal adapter (closes the "probe is not the adapter" gap, macOS).** `plugins/acryl-workspace/src/pty/deno-ffi-pty-spawn.ts`
implements ACRYL's own `WorkspacePtySpawn` seam (injected, so it is a drop-in for the 13-line `node-pty-spawn.ts`); `select-spawn.ts`
picks it only on a verified host (Deno on macOS), Node keeps `node-pty` untouched. Strict TypeScript, no `any`. Deno tests
(`deno test -A --no-check plugins/acryl-workspace/deno-tests/`, **8/8**): output and exit code; **a multibyte character split
across two reads arrives whole** (streaming UTF-8 decode; euro sign and an emoji); cwd, env and `TERM`; interactive input, resize,
Ctrl-C (SIGINT) and `kill`; **a 20 MB flood arrives complete**; **2 MB written to a child that is not reading never stalls the
event loop** (writes are queued and gated on `POLLOUT`); 100 sequential spawns with no leaked descriptors and no zombies; an
unknown command fails loudly. The tests found a real defect in the first version: with a fixed 10 ms tick the flood ran at
**0.23 MB/s** (a macOS pty read returns 1 KB and the producer refills asynchronously, so a zero-timeout poll saw "empty" and slept a
whole tick); adaptive scheduling (poll again at once while data flows, idle at 10 ms) gives **13 MB/s**. The Node suite for the
package is unchanged: 685/685. **Not done:** Linux (different flag and ioctl values; arm64 variadic ABI differs from Apple's) and
Windows (ConPTY through `kernel32`) are not written because they cannot be tested on this machine and no container runtime was
running; on those hosts the selector keeps `node-pty`. The remaining Linux work is a table of constants plus a CI job; Windows is a
separate adapter of the same shape.

**A real Harness agent turn runs on Deno** (`probes/harness-session.mjs`). The ACRYL engine host boots on Deno, a mock Anthropic-style
Messages endpoint stands in for the model (`DEEPSEEK_BASE_URL`, a fake key: no credential, no network, no cost), and
`ctx.sessionController.create()` then `.prompt()` run through the same service the browser client uses. Result: the session was created,
the prompt was accepted, the Harness LLM adapter issued real streaming requests (2, with **41 tools** offered) carrying the prompt, and
the streamed reply was recorded in the Harness's own session store. Not covered: a tool-call round trip, multi-turn history, a real model.
**The stock Harness CLI on Deno fails at boot** (`dsh headless "..."`: `host preparation failed: node-addon-require-builtin unsupported`),
the same `PluginPackages` throw as F3 with no fallback; ACRYL's own `engine-dsh.ts` fallback is what makes the host boot, so the fallback is
load-bearing, and an upstream change (skip or fall back when the internals are unavailable) would help every Deno user of the Harness.

**sherpa-onnx runs inference** (`probes/sherpa-vad.mjs`). The SenseVoice plugin's own pinned Silero VAD model (1.8 MB, sha256 verified
against its `assets.json`) on real synthesized speech (macOS `say`): identical on Node and Deno, one speech segment at 0.07 s for 4.44 s,
including from the packaged payload's copy of the addon. The full SenseVoice recognizer (hundreds of MB of model) was not downloaded;
the part that matters for a runtime port, onnxruntime executing inside the addon, is exercised.

**D2 met** (`probes/loader-lifecycle.mjs`, the real `@deepseek-ai/cordis-plugin-loader`, 6/6 on both Node 24.19.0 and Deno 2.9.7):
create starts a plugin; `disabled: true` stops it; `disabled: false` starts it again; a config change restarts it with the new config;
removing the entry and creating it again from the edited file (a `?v=2` URL) runs the new code with the old one disposed; remove
stops it. No `--expose-internals`. Two semantics worth knowing, identical on both runtimes: `update` keeps `disabled: true` unless
`disabled: false` is passed, and editing the file does nothing by itself (file watching is `cordis-plugin-hmr`, which needs Node
internals; the explicit reload is the replacement, as F6 found).

**Tier 2 (live package replace) is a bounded port, not a rewrite** (`node:module` hooks probe, scratch). Node's *public*
`module.registerHooks` exists on Deno 2.9.7 and behaves like Node: a `resolve` hook redirects a bare specifier for ESM `import()`,
the redirect table can be swapped in place (generation 1 to 2, seen by the next import), and the same hook serves `require()`.
So `PluginPackages`' interception layer (about 260 lines that monkeypatch Node's private ESM/CJS resolvers) can be rebuilt on public
API reusing the unchanged routing table (`RuntimeResolution.entries`). Not built. Two things stay open: the router's exact routing
rules (installation versus profile scope, peers, `#imports`) live in `dsh-app-boot`'s bundle and would be re-derived; and
**Harness worker threads** install the same interception from `setEnvironmentData`, so on Deno they would throw in the worker (the
code-runtime and PTC workflow workers). `worker_threads` + `vm` themselves work (F7), so this is the same fallback question, untested.

### F10. The like-for-like comparison, the checks asked for, and a correction (2026-10-08)

**Correction to F8.** F8 measured the *web* surface's dependency closure, which includes LibreOffice document preview (146.1 + 13.9 MB), `sherpa-onnx`
voice (32.5 MB) and sharp's libvips. The Electron app that ships today contains **none of LibreOffice or sherpa** (checked inside the 0.1.7 release),
so "the owner must decide whether those become downloads" was a false question, and my "lean" build was wrongly missing libvips, which Desktop does ship
(and ships for four platforms: about 73 MB, three of them foreign). Redone like for like: the same production closure minus only LibreOffice kit, document
preview and sherpa, libvips kept; the Electron release pruned with the same script (`probes/d6-prune.mjs`: other-platform natives, type declarations,
non-ACRYL markdown); one staging method (`ditto`) and the same compressors for all.

| One machine, macOS arm64, ad-hoc signed | Installed | DMG (UDZO zlib-9) | tar + xz -6 |
|---|---|---|---|
| **Deno app** (`deno desktop` shell + payload) | **210.3 MB** | **110.5 MB** | **46.1 MB** |
| Electron release, pruned the same way | 447.1 MB | 216.7 MB | 103.2 MB |
| Electron release as shipped | 529.7 MB | 268.2 MB | 128.0 MB |

Caveats on the table: `hdiutil` gave 200 MB or 268 MB for identical Electron bytes depending on how the folder was staged, so only the `ditto`-staged rows
are comparable to each other; electron-builder's own DMG of the same release is 190.6 MB (a better compressor), so compare ratios, not those absolute
download numbers. Of the Electron app, 273.1 MB is the Electron Framework (Chromium); the Deno runtime is 64.9 MB. **The saving attributable to Deno
is about 237 MB installed (-53%) and about 106 MB of DMG (-49%) against an equally pruned Electron**; 82 MB of the gap to the shipped app is pruning that
Electron can also do. Against the 200 MB line set in advance: **210.3 MB misses "roughly 200" by 5%**, closable (provider SDKs about 30 MB, minification
untested). `deno desktop --compress` (self-extracting xz) was not tried; the xz figure suggests a distributable near 46 MB.

**WebKit, looked at properly.** The window was captured alone (`CGWindowList` id plus `screencapture -l`, never the desktop) and viewed. The ACRYL UI renders
cleanly: sidebar, tabs, composer, model picker, the first-run dialogs. A page-side feature battery: WebGL2, OKLCH, `:has()`, container queries, backdrop
filter, nesting, subgrid, ResizeObserver, IntersectionObserver, drag-and-drop, WebSocket, Web Workers, IndexedDB, clipboard API all present; **37
resources loaded, 0 failed**. Missing: `SharedArrayBuffer`/cross-origin isolation, `requestIdleCallback`, `showDirectoryPicker`/File System Access
(Chromium-only; the directory picker has to be native, as it already is in Electron's route), none of which the load needed. **The terminal works end to end
in that window**: a real `zsh` with the user's own prompt, colors and cursor, rendered by xterm (2 canvases per terminal), a typed command executed and its
output shown, the tab marked "running", over WebSocket through the FFI pty. Not exercised: editor, drag-and-drop of a folder, long sessions.

**Signing.** There is no Developer ID here, so notarization itself was not attempted. Hardened runtime, the part that decides it: with no entitlements the
runtime library does not load (library validation); with `allow-jit`, `allow-unsigned-executable-memory` and `disable-library-validation` (the set Electron
apps use) **the app runs**. The lean payload contains **8 Mach-O files** (two `node-pty` helpers, a ripgrep, koffi, sharp and its libvips, two addon
packages) that each need signing: a short loop. Not tested: a real Developer ID signature, Apple's notarization service, stapling, auto-update.

**Host speed and memory** (same `apps/acryl-web`, isolated, 3 runs each): time to listening **1.5-2.2 s on Node, 1.5-1.7 s on Deno**; idle RSS after 8 s
**340 MB on Node, 276 MB on Deno (-19%)**. No regression.

**Linux terminal (closes F7's Linux gap).** The adapter now has a per-platform table. Run in the official `denoland/deno:2.9.7` image through OrbStack, the 8
Deno tests pass on **Linux arm64 (native) and Linux x64 (emulated)**, as on macOS. The Linux run found and fixed two real defects: `posix_spawn_file_actions_t`
and `posix_spawnattr_t` are structs of about 80 and 336 bytes on glibc (8-byte handles on macOS), so 8-byte buffers corrupted the heap (`corrupted
double-linked list`; buffers are now 1 KB everywhere); and a `dup2`'d slave does not become a controlling terminal on Linux, so Ctrl-C was never delivered
(`setsid -c` now makes it one and `exec`s, preserving pid and exit code, with an up-front executable check so a missing command still fails loudly). Windows
(ConPTY via `kernel32`) and musl/Alpine are not written; macOS x64 is unverified. The whole *app* on Linux was not built (the payload is a macOS payload).

**One side effect to remember.** The terminal's shell reads the user's real zsh config and history regardless of `HOME`; my first terminal runs appended two
test commands to the real `~/.zsh_history` (removed by exact match afterwards). Any terminal test must set `HISTFILE=/dev/null` and `ZDOTDIR`.

## Conclusion of the experiment (2026-10-08)

**Technically sound, and the premise holds, with margins that need honest labels.**

What is established (each measured on this machine):
- The ACRYL host, the Harness (a real agent turn), the Loader, plugin reload, sqlite, sherpa inference, koffi, sharp, ws and workers all behave like Node on Deno.
- Two real incompatibilities were found and fixed in ACRYL's own code with no edit to the Harness submodule: the `PluginPackages` boot interception (a fallback) and
  `node-pty` (a libc-FFI terminal, now on macOS arm64 and Linux arm64/x64, with tests).
- A `deno desktop` window hosts the real client, including a working terminal, and passes hardened runtime with three standard entitlements.
- Size against an equally pruned Electron: -53% installed, -49% download. Memory of the host: -19%. Startup: equal.

What is not established, in the order that can still change the answer:
1. **The shell port (D7)**: 12 Electron modules (menus, tray, dialogs, windows, recovery and profile windows, workspace admission) plus packaging and updates.
   The window API has menus, tray, dock, context menus and window control; it has **no native dialog** (the directory picker needs FFI or a helper). Unmeasured cost.
2. **Windows**: ConPTY terminal, WebView2 behaviour, signing. Nothing run. This is the largest unknown left, and it decides whether "one app on three OSes" survives.
3. **Real notarization and auto-update** of a `deno desktop` app. `deno desktop` is labelled experimental by Deno.
4. **Maintenance**: ACRYL now owns a fallback in `engine-dsh.ts` and a native-FFI terminal per platform, and depends on each Harness update not adding another
   Node-private API (a canary: `probes/d1-deno-host.mjs` and the Deno tests, runnable in CI). Live package replace without a restart (Tier 2) is not built;
   public `module.registerHooks` works on Deno so it is a bounded port; Harness worker threads would hit the same interception and are untested.
5. Smaller: a tool-call round trip and a real model on Deno; the editor and folder drag-and-drop in WebKit; the 5% size gap.

**Recommendation: continue, as a bounded Phase 2 with stop conditions, not as a commitment to ship.** Do first, cheapest and most decisive: (a) a Windows
spike (a `deno desktop` window loading the client in WebView2, plus a ConPTY terminal), because nothing so far touches it; (b) the smallest vertical of D7: app
menu, quit handling, a native folder picker, and removing the 15 s navigate delay; (c) a real Developer ID signature and a notarization submission by someone who
holds the certificate. **Stop the migration if**: WebView2 or the Windows terminal cannot reach parity; notarization rejects the bundle for a reason that is not
fixable; or the D7 port's measured cost per module exceeds what -237 MB of installed size and a 2x smaller download are worth. Keep Option A (Deno shell, Node
host, about 440 MB) only as a fallback; with the measured numbers it saves too little to justify itself alone.

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
| **D2** | Does the Cordis Loader work without Node internals? | With D1 passing, enable and disable a profile row at run time; reload one plugin with a fresh `import()` | **Met (2026-10-08, F9).** The real Loader's create, disable, re-enable, config change, reload-after-edit and remove are identical on Deno and Node (6/6), no `--expose-internals`; the reload mechanism also works inside the packaged binary (F6). Open: the agent-plugin dependency allowlist (F6) |
| **D3** | Do the native and Node-API pieces work? | Run 042's `probes/runtime-compat.mjs` and `probes/e5-ws-worker.mjs` under Deno: `node-pty` events, `node:sqlite`, module re-import, `ws` upgrade, `worker_threads` with `node:vm`; then `koffi`, `sharp` (`probes/native-modules.mjs`) | **Met with one replacement (2026-10-08).** Everything matches Node except `node-pty`, which fails silently; the named replacement is libc FFI (`probes/deno-ffi-pty.ts`), all checks pass on macOS. Linux and Windows pty are not done (F7) |
| **D4** | Does the ACRYL client work in WebKit? | Open the D1 host URL in Safari (same engine as WKWebView); check terminal (xterm, `@xterm/addon-webgl`), editor, layout | **Met (2026-10-08, F10).** Captured window viewed: UI renders cleanly; WebGL2 and the modern CSS used are present; 37 resources, 0 failed; the xterm terminal works end to end. Editor and folder drag-and-drop not exercised |
| **D5** | Does a `deno desktop` window host ACRYL? | A Deno desktop entry that starts the host (Option A: Node child; Option B: in process) and opens a window on its URL | **Met in process (Option B), 2026-10-08 (F8).** Host and window run in one `deno desktop` process; host stopped and port freed on exit. Not done: menus, tray, quit handling, the 15 s navigate delay |
| **D6** | What is the real size? | Build the D5 app with the profile's plugin set included explicitly; then remove dependencies a desktop build does not need | **Measured like for like (2026-10-08, F10): 210.3 MB installed, 110.5 MB DMG, against 447.1 / 216.7 for an equally pruned Electron (-53% / -49%).** Misses "roughly 200 MB" by 5%, closable. (F8's first numbers were for the wrong feature set; see F10) |
| **D7** | Shell parity | Map the 12 Electron modules (menu, tray, dialogs, windows, recovery window, profile window, workspace admission) and the updater, signing and notarization to `deno desktop` | Every Desktop feature has a Deno equivalent or a recorded gap |

Decision after D3 and D6-early (2026-10-08): superseded by the "Conclusion of the experiment" below F10, which uses the corrected measurements.

## D6-early gate (set 2026-10-08, before any measurement)

Size is the premise of the whole experiment, so it is measured before the D7 port is paid for.

- **Pass line: the minimal Deno-hosted app projects at or under roughly 200 MB all-in** (the `deno desktop` runtime,
  every `node_modules` payload it needs at run time, and the app code), measured on disk as the final `.app`.
  Over that, **park the experiment regardless of how clean D7 looks.**
- "All-in" means what a user downloads and installs, not what a static analysis says is reachable: Node-API addons
  need a real on-disk `node_modules` next to a compiled binary (Deno's own error says so), so the closure is measured
  on disk, not assumed.
- Bundled into the same step: a real `sherpa-onnx-node` model run (the last native that has only been *loaded*), so
  a pass on size cannot be followed by a failure on voice.
- Still-soft items the same review listed, tracked below as they close: the real pty adapter (backpressure, split
  multibyte reads), Linux and Windows pty, and a run through a real Harness session.

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
