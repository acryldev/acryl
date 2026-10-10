# 042 Bun experiment: findings and plan

**Branch**: `042-acrylruntime-optimization-bun-experimental` (from the Deno branch after the milestone folder lost "deno" from its name). **Runtime**: Bun 1.3.14, macOS arm64. **Method**: the same as the Deno experiment: boot the real web engine host on the runtime, then run `probes/live-install.mjs` (install an agent-written plugin into a running host, change it, install again). Throwaway homes only.

Why this experiment: Pi (earendil-works) ships Bun `--compile` binaries next to its Node build, and the capture notes ("Bun Deno and TypeScript Compilers for ACRYL", "Pi.dev Durable Objects And ACRYL Comparison") ask whether Bun is the better runtime or distribution backend for ACRYL and Blends. The Deno conclusion (a Node sidecar is needed anyway, so the host-on-runtime size advantage mostly disappears) is the bar to compare against.

## B1. Host boot and live plugin install on Bun (2026-10-09)

| Step | Result |
|---|---|
| Real host, unpatched | **FAIL at import**: `node:module` has no `registerHooks` and no `findPackageJSON` (named imports are link errors on Bun). Same as the 2026-10-01 E4 notes |
| After `node-module-compat.ts` (ACRYL-owned; native function on Node and Deno, a small equivalent on Bun) | Host boots on Bun and serves its URL. Services present |
| `dsh plugin add` with Bun as `process.execPath` | **FAIL**: the Harness's own `dsh` CLI needs `node:sqlite`, which Bun does not have (`No such built-in module: node:sqlite`). The code is in the pinned Harness, which this repository must not edit. **Same wall as Deno: a real Node sidecar is required** |
| With a Node sidecar: install | Passes |
| With a Node sidecar: activation | **FAIL**, "plugin ... did not activate", the same symptom as Deno F14 (the Cordis Loader imports a bare name from its own place, and the profile is not on that path) |
| Deno's fix, a resolve hook | **Not possible on Bun 1.3.14** (measured in isolation): a runtime `Bun.plugin` `onResolve` is called for the entry file only, never for imports made inside modules. `NODE_PATH` set at runtime is ignored; set at start it works for packages that exist at start only. A tsconfig `paths` wildcard behaves the same. A failed resolution is cached |
| What works | Control: a package added at runtime to an ordinary `node_modules` above the importer resolves. Virtual modules (`build.module(name, load)`) can be registered at any time, answer a later bare dynamic `import(name)` from any file, and a later registration under the same name wins |
| Fix (ACRYL-owned): `bun-profile-resolution.ts` | The profile's packages are exposed as virtual modules: all at boot, and one more each time the live activation service (`CliLiveActivationService` and `WebLiveActivationService`) is about to activate a package. Entry resolved from the manifest, not `require.resolve` (after a virtual module exists, Bun resolves the name to itself and the exposure would import itself) |
| `probes/live-install.mjs` | **ALL PASS on Bun 1.3.14**, Node 24.19.0 and Deno 2.9.7 (Bun and Deno with a Node sidecar as `process.execPath`). 3 Bun tests in `runtime/acryl-harness-runtime/bun-tests/`, 3 Deno tests still pass |

Freshness on re-install comes from the path, as on Node: the installer stages changed host code at a new path, and Bun, like Node, caches a module by its path.

## What is the same as Deno, and what is not

- Same: host code runs, a real Node is required for every child the Harness spawns as "node" (`dsh`, pnpm, MCP servers), so **the bundled Node sidecar (+88 to +118 MB) is not avoidable on Bun either**. The Harness uses `node:sqlite`, `node:module` loader internals and `getSystemErrorMessage`/`stripTypeScriptTypes` (Harness-owned; the 2026-10-01 notes found the last two).
- Different: Bun needs a registration seam (explicit exposure at activation) where Deno needed a hook. That is more fragile: any code path that activates a plugin without going through the two live-activation services would not be covered.
- Different: Bun binary is smaller than Deno's runtime per the reference sizes (Bun 63 MB, Node 121 MB, `alternatives-shell-options.md`).

## B2. Terminal on Bun (2026-10-09)

`node-pty` returns a pid and no events on Bun (2026-10-01 P1). `plugins/acryl-workspace/src/pty/bun-terminal-spawn.ts` maps `Bun.spawn({ terminal })` onto `WorkspacePtyProcess`; `select-spawn.ts` picks it on Bun (macOS, Linux). It is about 90 lines, against the 280 of the Deno libc FFI adapter: Bun already does the pty, the session and the resize.

`bun test bun-tests` in the workspace plugin, mirroring the Deno suite: output and exit code, a multibyte character split across reads, cwd/env/TERM, input, resize, SIGTERM, Ctrl-C (signal 2), a 20 MB flood arriving complete, a 2 MB write to a child that is not reading without stalling the event loop, 100 sequential spawns with no descriptor leak, and a missing command failing. **8 of 8 pass.** The Node suite for the package (685 tests) and the typecheck are unchanged.

Not done: Windows (Bun has no `terminal` there; the ConPTY route would need the same kernel32 FFI as Deno), and Linux has not been run yet.

## B3. WebSocket upgrade on Bun (2026-10-09)

**The 2026-10-01 E5a conclusion ("`ws` upgrade FAILS on Bun") was wrong for the code ACRYL runs.** The probe loaded the real `ws` package by file path. The host code imports `ws` by its bare name, and Bun answers a bare `import 'ws'` with its own built-in implementation, which does the handshake over a `node:http` server correctly. Measured with the real code, nothing faked: `bun-tests/terminal-over-websocket.test.ts` runs the real `WorkspacePtyRegistry` and `createWorkspacePtyStream` on a `node:http` server, a real shell behind `Bun.spawn({ terminal })` and a `ws` client: keystrokes in, output back, resize applied (`stty size` reports it), exit code reported, reconnect from a cursor without repeating output, a late attach told of the exit, a nonsense frame closed with 1008, an unknown session with 4404. **3 of 3 pass.**

What does not work, and matters:

- **A write to a `node:http` upgrade socket never reaches the client on Bun** (`socket.write` and `socket.end` both; measured with a raw TCP client, Node delivers the bytes). Only the built-in `ws` handshake gets through. The stream's refusals (`403` for another origin, `400` for a malformed request) therefore arrive as a closed connection, not as a status line. The page is still refused and never upgraded; what is lost is the diagnosis. Any plugin that answers an upgrade by hand would be affected.
- `ws.WebSocket` `unexpected-response` is not implemented in Bun's `ws`, so a client cannot read the refusal status either.
- A server with upgraded sockets does not finish `server.close()` until they are destroyed (the Harness web server destroys the sockets it tracked, as the test does). Not yet checked against the real host stop.

### B3b. The same through the real host (2026-10-09)

`probes/terminal-e2e.mjs` boots the real web engine host on a free port and uses nothing but its own routes: `POST /api/acryl-workspace/pty` starts a shell, the WebSocket route `/api/acryl-workspace/pty/stream` attaches through the Harness web server's upgrade routing, a typed `echo` comes back, a resize shows in `stty size`, `exit 4` is reported as exit code 4, and the host stops (WebSocket closed, 281 ms on Bun). **ALL PASS on Bun 1.3.14, Node 24.19.0 and Deno 2.9.7** (Bun and Deno with the Node sidecar). The host runs the built `lib/` of the plugin: the first Bun run failed with no output because `lib/` still held the old `node-pty` selector, until the plugin was rebuilt.

## B4. `bun build --compile` of the web host (the Pi route), macOS arm64 (2026-10-09)

`bun-app/main.ts` is a 50-line launcher (own home `~/.acrylbun`, `process.execPath` pointed at the payload's Node, `serveWeb` with `--no-open --port 0`, so never 3080); `bun-app/build.sh` makes the payload with the existing `deno-app/make-payload.sh` (it is not Deno specific) and compiles with `bun build --compile --compile-autoload-package-json`. Compiling takes 0.3 s.

**Two traps, both hit:**

1. **A compiled executable does not resolve bare package names from `node_modules` on the real disk** unless it is built with `--compile-autoload-package-json` (measured with a probe: absolute-path imports work, `import 'pkg'` from a file in the payload fails with `Cannot find module`; cwd and `NODE_PATH` do not help). ACRYL needs it: the Cordis Loader imports every plugin by name from the payload and the profile.
2. **`apps/acryl-web/lib` bundles the runtime** (`noExternal: ['acryl-control', 'acryl-harness-runtime']`), so a payload made after a runtime change but before `acryl-web` was rebuilt carries the old code (here: the named `registerHooks` import that Bun cannot link). Rebuild the runtime and `acryl-web` before making a payload.

**Results** (one machine: MacBook, macOS arm64, Bun 1.3.14, Node 24.18.1 sidecar, throwaway homes, first start of each fresh home, 6 runs each, alternating):

| | Bun compiled host | the same payload on its Node sidecar |
|---|---|---|
| Time to a served URL | 1.34 to 1.86 s (median about 1.4 s) | 1.29 to 3.77 s (median about 1.4 s; the 3.77 s is the first, cold-cache run) |
| Memory of the host process, 3 s after start | 357 to 360 MB | 329 to 331 MB (one run 248 MB) |
| Size on disk | executable 61 MB + payload 322 MB = **383 MB** | payload 322 MB (it already holds the 115 MB Node) |

- **The runtime's own startup advantage (Pi's 185 ms vs 79 ms) is invisible here**: the host spends its 1.4 s loading Cordis plugins, not starting a runtime.
- **Compiling the host onto Bun makes it 61 MB larger and 28 MB hungrier than running the same payload on Node**, because the Node sidecar has to be there anyway. The Bun executable earns its place only where Node is not otherwise shipped, i.e. a build that needs no `dsh plugin add`, no pnpm and no MCP servers.
- Everything the product is for works inside the compiled executable (run with `ACRYLBUN_DEBUG_SCRIPT=<probe>`, the repo's freshly built packages rather than the payload's copy, because the payload does not hold `acryl-harness-runtime` as a package): `probes/live-install.mjs` **ALL PASS** (install, change, re-install, both files fresh) and `probes/terminal-e2e.mjs` **ALL PASS** (shell over the real WebSocket route, resize, exit code, stop in 279 ms). The compiled host also starts a terminal session through its own `POST` route, answers a tokened request, stops on SIGTERM and frees its port.

## B5. Linux x64 (z370n, Ubuntu, 2026-10-10)

Everything built on the Mac and copied into a scratch folder (Bun 1.3.14 linux-x64 from the official release, SHA-256 checked; the payload from `make-payload.sh linux x64`; the executable cross-compiled with that Bun as `--compile-executable-path`), removed afterwards. Nothing was installed on the machine.

- `bun test` of the terminal adapter: **8 of 8 pass** (the same suite as macOS, 20 MB flood and 100 spawns included).
- The compiled host, its own payload, a Node client from outside (`probes/terminal-client.mjs`): start a shell, WebSocket attach, typed command, resize, exit code: **ALL PASS**; the host stops on SIGTERM and frees its port.
- `probes/live-install.mjs` inside the compiled executable: **ALL PASS** (the `acryl-harness-runtime` package was overlaid on the payload for this probe only; the measured payload does not hold it).
- Start and memory, 4 first-run samples each, alternating: Bun compiled **1.51 to 1.62 s, 272 MB**; the same payload on its Node sidecar 1.45 to 1.61 s, 314 to 316 MB. Memory is 43 MB *lower* on Bun here (it was 28 MB higher on macOS); start time is the same.
- Size: executable 104.5 MB (90 MB on disk; Bun's Linux binary is larger than the macOS one) + payload 324 MB.

## B6. Windows 10 x64 (mbpi9win, 2026-10-10)

Same recipe (`bun-windows-x64`, checksum verified, payload `win32 x64`, cross-compiled), in `C:\Users\alexa\scratch042\bun`.

- **Bun's `terminal` option works on Windows (ConPTY) in 1.3.14, although its documentation lists Linux and macOS only.** No FFI port was needed; `bun-terminal-spawn.ts` allows win32 x64.
- Two Windows-only fixes found by the tests: `proc.kill('SIGHUP')` throws `ENOSYS` (Windows has no signals, so it calls `kill()` bare), and **a Ctrl-C written to the terminal did nothing** until the adapter calls `SetConsoleCtrlHandler(NULL, FALSE)` once before the first child (through `bun:ffi`). A process started over ssh carries the inherited "ignore Ctrl-C" flag and passes it to every child; node-pty and the Deno adapter do the same restore. The same flag is probably set for any Windows service-started host.
- `bun test` of the Windows suite (`cmd.exe`: output and exit code, cwd/env, input then kill, resize through `mode con`, Ctrl-C on `ping -t`, 20 MB flood, 50 spawns, missing command): **8 of 8 pass**.
- The compiled host plus `terminal-client.mjs` with `cmd.exe` commands: **ALL PASS**; live install inside the compiled executable: **ALL PASS**.
- Before the adapter was enabled, the host **died** on the first terminal attach: `node-pty` on Bun/Windows raised `ERR_SOCKET_CLOSED` as an uncaught error, which ends the process. (A terminal that fails should not be able to take the host down; this is the same on Node for any uncaught error and is not Bun specific, but it is how the failure showed.)
- Size: executable 98.5 MB + payload 326.7 MB (88 MB of it Node). Start time and memory not measured on Windows.
- Housekeeping: one folder under `scratch042\bun` could not be deleted afterwards ("being used by another process"; no process of mine was found), so it remains for the user to remove.

## Where the Bun experiment stands (2026-10-10)

Working on Bun 1.3.14, on macOS arm64, Linux x64 and Windows 10 x64, in a compiled executable: the real host, the web server with WebSocket upgrades, the terminal, and installing an agent-written plugin into a running host. What it takes: a Node sidecar (Bun cannot run `dsh`/pnpm), ACRYL's own `node:module` compat layer, a virtual-module seam for profile packages, a 90-line terminal adapter, and one compile flag.

What it does not give: no size win (the sidecar is still there, so the Bun executable is +61 MB over the same payload on Node on macOS), no start-time win (the host's 1.4 s is plugin loading), and memory is -43 MB on Linux and +28 MB on macOS. What it would give is the **single-file CLI and Web launcher** story Pi uses, if the sidecar can be avoided for a build that never installs plugins.

## Not done yet (the remaining Bun gates, in order)

1. **Session storage**: `node:sqlite` in the Harness's session-query package (Harness-owned; needs the sidecar or a provider replacement).
2. **A window**: Electrobun or another shell (the compiled host above has none), then the size against Deno and the pruned Electron on the same machine.
3. **Host stop with a live WebSocket** on Bun, and the agent stream (`plugins/acryl-agent-control`) over the same path.
4. **Windows and Linux** (z370n, mbpi9win) for everything above.

Stop condition: if the Node sidecar is still counted in the final size, Bun's case rests on `--compile` for CLI and Web (Pi's use) and not on replacing the Electron desktop. Gates 1 and 2 of the first list (terminal, `ws`) turned out to need no more than an adapter and no change at all, so they no longer stop the experiment.

## B7 - Electron window onto the Bun host (probe 1, 2026-10-10)

Decision (owner): stay on Electron, try Bun as the host runtime only; Electrobun stays an option, not a commitment (it is a point of no return, and stock DeepSeek's Desktop keeps the host inside the Electron main process, so a Bun child host is a permanent divergence from upstream).

`probes/electron-window/` is a throwaway Electron 43.0.0 shell (macOS arm64) that only loads the URL of the compiled Bun host (`bun-app`) and screenshots it; the Desktop code is untouched. Measured with throwaway homes:
- The window loads in under 1 s and renders the real ACRYL UI (Chromium 150, no webview differences, nothing to port).
- Memory: Electron tree 617 MB for both hosts; the host 464 MB on Bun vs 353 MB on Node 24 (same payload).
- Size: the Electron app already ships Node (`ELECTRON_RUN_AS_NODE`), so a Bun host adds its whole executable (about 61 MB on macOS) with nothing removed.

**Finding: on Bun the host boots but 18 Harness rows never activate, so no agent session can be created.** The first session fails with `agent-preset/invalid: tool-bash ... waiting for shell`; the Node host does not. `probes/d1b-diagnose-fibers.mjs` (state 0 = PENDING) shows rows waiting for the `subprocess`, `sandbox`, `sandboxPolicy` and `shell` services whose providers are not in the tree at all, with no FAILED row: a plugin whose import throws a link-time error is skipped silently.

`probes/bun-import-census.mjs <deepseek-harness/packages>` imports every Harness package's built entry under Bun (311 of 316 import; Node imports all):
- `subprocess/subprocess-local` (provides `subprocess`: shell, fs-search, terminal, workspace-changes and more depend on it): `node:util` has no `getSystemErrorMessage` in Bun 1.3.14. It is used only to word a Linux `execve` error.
- `ptc-runtime/ptc-runtime-node`: `node:module` has no `stripTypeScriptTypes`.
- `skill/skill-office`: no `node:sea`.
- `storage/storage-sqlite`: no `node:sqlite` (already known; Node sidecar or a provider).
- `test-support/client-runtime`: test support only.

A fix that does not edit the Harness submodule works: a Bun `onLoad` plugin that rewrites the one missing named import in the built file (tested on `subprocess-local`: it then imports). It has to answer every load with an object (returning `undefined` is an error in a runtime plugin). Earlier B-gates (terminal, live install) did not see this because they never created an agent session; the census is the check that would have.
