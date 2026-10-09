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

## Not done yet (the remaining Bun gates, in order)

1. **Session storage**: `node:sqlite` in the Harness's session-query package (Harness-owned; needs the sidecar or a provider replacement).
2. **Packaging**: `bun build --compile` for the web host (the Pi route) and the size and cold-start numbers against Node SEA, Deno and the pruned Electron; then a window (Electrobun or another).
3. **Host stop with a live WebSocket** on Bun, and the agent stream (`plugins/acryl-agent-control`) over the same path.
4. **Windows and Linux** (z370n, mbpi9win) for everything above.

Stop condition: if the Node sidecar is still counted in the final size, Bun's case rests on `--compile` for CLI and Web (Pi's use) and not on replacing the Electron desktop. Gates 1 and 2 of the first list (terminal, `ws`) turned out to need no more than an adapter and no change at all, so they no longer stop the experiment.
