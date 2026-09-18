# 01 — The Launch Chain: `pnpm acryl` → Running TUI

This file traces every hop from the shell command to a mounted terminal UI, with the
exact files involved and the decisions each hop makes.

## Step 0 — `pnpm acryl` (root `package.json`)

The root package's `scripts` map:

- `pnpm acryl` → `node acryl-cli/bin/dev-run.mjs`
- `pnpm tui` → same launcher (alias)

There is no preinstalled `acryl` binary on PATH; the workspace runs the CLI from source
through this launcher. The launcher lives **inside `acryl-cli/`**, next to the code it
launches (domain-driven layout): each surface owns its launcher; the root `scripts/`
directory holds only infrastructure tooling (release, packaging, upstream sync, layout
and architecture gates — see `scripts/verify-layout.mjs`).

## Step 1 — `acryl-cli/bin/dev-run.mjs` (rebuild-if-stale launcher)

The compiled entry lives at `acryl-cli/lib/bin.js`, but a fresh checkout or a source edit
leaves it missing or stale. The launcher makes `pnpm acryl` forgiving in a dev loop:

1. **Staleness check (mtime-based):** walk `acryl-cli/src/**` for the newest
   `.ts/.tsx/.mts` mtime. If it is newer than `lib/bin.js`'s mtime — or `lib/bin.js`
   doesn't exist — the lib is stale.
2. **Rebuild if stale:** run `corepack pnpm --filter acryl-cli run build`
   (which is `tsdown && tsc --emitDeclarationOnly`).
3. **Exec the real CLI:** `spawn(process.execPath, [lib/bin.js, ...args])` with
   `stdio: 'inherit'` from the repo root, and exit with the child's exit code.

Consequence: `pnpm acryl` always runs the current source (at the cost of one build when
you just edited `acryl-cli/src`), and never rebuilds when you didn't.

## Step 2 — `acryl-cli/src/bin.ts` (compiled entry)

`acryl-cli/package.json` declares `"bin": {"acryl": "./lib/bin.js"}` and
`"main": "lib/index.js"`. When executed as an entrypoint, `bin.ts`:

1. **Entrypoint check** — compares `process.argv[1]` against `import.meta.url` using
   `realpathSync` on both sides, so the file also works through symlinks (portable
   archives, `/tmp` → `/private/tmp`).
2. **`relaunchWithExposedInternals()`** — see step 3.
3. If already relaunched, call **`runAcryl(process.argv.slice(2))`**.
4. **Error unwrapping** — walks the `cause` chain of any thrown error and, when it finds
   an `AggregateError`, prints each member's original stack (the TSX/loader wraps plugin
   load failures one level down; this surfaces the real plugin error).

Exports (`parseAcrylArgs`, `runAcryl`, types) make the same logic importable as a library.

## Step 3 — `acryl-cli/src/cli/node-launcher.ts` (the `--expose-internals` relaunch)

The ACRYL profile enables **Cordis HMR** (`@deepseek-ai/cordis-plugin-hmr` is mounted by
`dsh-base`), and Cordis HMR requires Node's internal module hooks.

- `exposedInternalsInvocation()` returns `['--expose-internals', ...execArgv, script, ...args]`
  if `--expose-internals` is not already present, otherwise `undefined`.
- `relaunchWithExposedInternals()` spawns that child with `stdio: 'inherit'`, forwards its
  exit code, and returns `true` so the parent stops. The child re-enters `bin.ts`,
  now sees `--expose-internals` in `process.execArgv`, and proceeds.
- `bootAcrylHarnessProfile()` independently **guards** this: if the composed patches
  enable `hmr` and the process was not launched exposed, it throws before booting.

So the process you interact with is *always* a child of the launcher, running with
`--expose-internals`.

## Step 4 — `acryl-cli/src/cli/run.ts` (`runAcryl`)

`runAcryl(args, supplied?)` parses arguments via `cli/grammar.ts`
(`parseAcrylArgs`) and dispatches:

| Invocation | Behavior |
|---|---|
| `acryl` / `acryl tui` | Interactive TUI (default command). |
| `acryl --help` / `-h` | Prints help: *"ACRYL — Agent Context Relay Yielding Lifecycles"*. |
| `acryl --version` / `-v` | Prints `ACRYL_VERSION` (read from `acryl-cli/package.json`, currently `0.1.31`). |
| `acryl tui --json` | Headless readiness probe: boot the host, print `{mode:"direct", profile, generationId}` as JSON, dispose. |
| `acryl --profile <name>` | Use a named DSH profile (default `acryl`). |
| `acryl tui --resume <id>` | Resume a durable session. |
| `acryl web` / `acryl gui` | **Deliberately rejected.** The CLI is the terminal surface only; `web`/`gui` are separate distributions. |

**TTY gating:** interactive mode requires *both* `stdin.isTTY` and `stdout.isTTY`;
otherwise it prints a hint to use `acryl tui --json` and exits 1. This keeps the
pi-tui alternate-screen shell from being mounted into a pipe.

**Dependency injection:** `runAcryl` takes `supplied: Partial<AcrylCliDependencies>`
(`startDirectHost`, `runTui`, `exit`, `write`), so tests can stub the host and TUI
without spawning anything. The defaults are the real implementations.

## Step 5 — `acryl-cli/src/tui-app/session.ts` (`runAcrylTui`)

The TUI session driver. For each interactive run it:

1. **Boots the runtime** — `startDirectHost({profile})` (step 6).
2. **Attaches a session** — `attachSession(host, resumeId?)`:
   - `createAcrylSessionBridge(host.ctx, {profile, generationId, attachment:'owner', cwd})`
   - `bridge.open(resumeId)` → opens or resumes a **durable DSH session**
   - seeds `TuiStore` from `bridge.snapshot(id)`
   - subscribes to live events: every `SessionEvent` → `store.appendEvent(event)`,
     and each event triggers a fresh `bridge.snapshot()` to refresh status lines
3. **Mounts the UI** — `mountTui(...)` runs the pi-tui shell (`@earendil-works/pi-tui`).
4. On normal exit prints the resumption hint: `resume with: acryl tui --resume <id>`.
   (`/clear` flushes the session and re-attaches a fresh one; durable history stays on disk.)

Details of this layer are in [05-session-bridge-and-tui.md](05-session-bridge-and-tui.md).

## Step 6 — `acryl-cli/src/host/direct.ts` (`startDirectHost`)

The ownership boundary between surface and runtime:

```ts
const runtime = await bootAcrylHarnessProfile({ profile: options.profile })
const ctx = runtime.ctx
runtimeState = ctx.get('sessions') !== undefined && ctx.get('agents') !== undefined
  ? 'ready' : 'unavailable'
```

- **One process, one Cordis root.** No HTTP/WS loopback, no server. The comment in the
  source is explicit: *"A local surface owns its normal DSH/Cordis root. Durable DSH
  sessions, not `.acryl/control` experiments, provide continuity across later launches."*
- **Readiness = two services present.** `sessions` (durable session log) and `agents`
  (agent handles) are the minimal contract the TUI needs; anything else is probed
  lazily at point of use and degrades to an error notice.
- `dispose()` is idempotent (a `disposed` flag) and disposes the Cordis root Fiber —
  every plugin's disposer runs in dependency order.

What `bootAcrylHarnessProfile` actually composes is the subject of
[03-runtime-boot.md](03-runtime-boot.md).

## Timeline at a glance

```
shell: pnpm acryl
  │
  ├─ acryl-cli/bin/dev-run.mjs .... stale? ── build acryl-cli ──┐
  │                                                            │
  ├─ node acryl-cli/lib/bin.js ... entrypoint? ──┐             │
  │                                              │             │
  ├─ node --expose-internals ... relaunch ───────┘             │
  │                                                            │
  ├─ runAcryl(args) ... parse, TTY gate ───────────────────────┤
  │                                                            │
  ├─ runAcrylTui({profile:'acryl'})                            │
  │    ├─ startDirectHost ── bootAcrylHarnessProfile           │
  │    │     ├─ resolveProfileDir('acryl') ~/.dsh/profiles/... │
  │    │     ├─ initProfile + loadProfile + patches            │
  │    │     ├─ boot() → Cordis root Context (dsh-base tree)   │
  │    │     └─ installAcrylWorkspaceStatusTool(ctx)           │
  │    ├─ createAcrylSessionBridge(ctx) ── open()/resume       │
  │    ├─ TuiStore ← snapshot + subscribeEvents                │
  │    └─ mountTui() ... interactive loop until /exit          │
  │                                                            │
  └─ exit: dispose fiber ── print "resume with: acryl tui …" ──┘
```
