# The PTY driver (M8, spec 046 T029)

Status: built (steps 1-5), released in 0.10.0. Design, revised after review (SSE transport, typed session kinds, disposal, vendored xterm.js, Windows). Target 2026-10-29 20:00 CET. Builds on the agent panel's headless drivers (`plugins/agent-panel`).

## What it is

A plugin, `driver-pty`, that starts a coding agent (`claude`, `codex`, `pi`, any program) inside a real pseudo-terminal in the app folder. The agent builds through the door (`.acryl/bin/acryl brief|look|act|plugin|tool`) as it does today, but the person sees and types into the agent's own terminal UI instead of a one-shot headless run. The framework packages keep no import of any agent, harness or terminal library; the plugin is one more row in `blend.yaml`.

## Why not widen the headless drivers

The panel's drivers run `claude -p`, `codex exec`, `pi -p`: one message in, one stream out, no approvals, no follow-up. A PTY gives the programs' own interactive mode (permission prompts, slash commands, follow-up turns, their login) without the panel re-implementing any of it. The headless drivers stay: the gates run them, and they need no native module.

## Drivers: one registry, two kinds of session

A service `drivers` (a registry) that the panel injects. A driver is a discriminated union on `kind`:

```ts
type Driver = ChatDriver | TerminalDriver

interface ChatDriver {            // the panel's existing events: text, tool, change, done, error
  kind: 'chat'
  name: string
  start(options: { message: string; signal: AbortSignal }): AsyncIterable<ChatEvent>
}

interface TerminalDriver {        // bytes in, bytes out
  kind: 'terminal'
  name: string
  start(options: { cwd: string; env: NodeJS.ProcessEnv; cols: number; rows: number }): TerminalSession
}

interface TerminalSession {
  readonly id: string
  onData(listener: (chunk: string) => void): () => void
  onExit(listener: (code: number | null) => void): () => void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): Promise<void>          // resolves when the process (group) is gone
}
```

- The headless drivers (`agent`, `claude`, `codex`, `pi`) become `ChatDriver`s with no behaviour change; the future `driver-dsh` (T028) is a `ChatDriver` too. Nothing is forced to speak bytes.
- `driver-pty` registers one `TerminalDriver` per program (`claude`, `codex`, `pi`, extra programs from config), named `pty:claude` and so on.
- The panel lists every registered driver and picks the view by `kind`: the chat view for `chat`, the terminal view (a second tab) for `terminal`.
- **PENDING:** the panel injects `drivers`, and a driver plugin provides entries into it. A panel without `driver-pty` mounted simply lists no `pty:*`; a `driver-pty` without a panel is inert (its endpoints are still mounted but nothing offers them). The registry is created by the panel's own base (`agent-panel` provides `drivers` and registers the headless drivers); `driver-pty` declares `inject: ['drivers', 'router', 'appInstance']` so while the panel is absent it is pending, not failing, and it starts the moment the panel arrives, in the same process.

## Transport: SSE down, POST up

No WebSocket: the door's page channel moved off it (proxies, reconnect, one transport) and the router has no upgrade support yet (spec 047 T009).

- `POST /api/driver-pty/sessions` `{ driver, cols, rows }` starts a session, answers `{ id }`. One session per app at a time; a second start answers 409.
- `GET /api/driver-pty/<id>/output` is a server-sent event stream. Each event is `event: data`, `id: <n>`, `data: <JSON string of the UTF-8 chunk>` (JSON so control characters survive), plus `event: exit` `{ code }`. The server keeps a ring buffer of the last chunks, at least 64 KB (the floor), each with its id. A reconnect sends `Last-Event-ID`; the server replays everything after it, or the whole buffer when the id fell out of it, and the page clears the terminal first in that case.
- `POST /api/driver-pty/<id>/input` `{ data }` writes keystrokes. The page batches them per animation frame, so a held key is one request per frame.
- `POST /api/driver-pty/<id>/resize` `{ cols, rows }`, `POST /api/driver-pty/<id>/stop`.
- Same origin check (`fromOwnPage`), same session token as the panel's `ask`, development only (nothing mounted with `NODE_ENV=production` or `ACRYL_DOOR=off`).
- Audit: start, exit, driver name go to `.acryl/audit/driver-pty.jsonl`. Keystrokes are never logged (they can contain secrets); the door audits what the agent does.
- A page reload re-attaches by id; when a plugin is installed or removed the page reloads as the panel does today, and the session survives it.

## Effects and disposal

The plugin is a Cordis plugin; nothing it starts outlives it.

- Every PTY process is acquired inside one `ctx.effect(...)`. The effect's disposer kills that session: on POSIX the whole process group (`process.kill(-pid, 'SIGHUP')`, then `SIGKILL` after 2 s), on Windows `pty.kill()` (ConPTY has no process groups; the agent's children end with the console). It then closes that session's SSE streams (a final `exit` event) and flushes the audit line (`ask: 'end'`).
- The driver registration itself is also an effect: it leaves the registry when the plugin goes, so the panel stops listing `pty:*`.
- The HTTP routes are mounted through `ctx.router` and leave with the plugin like any route.
- Plugin unload or reload with a session open leaves no process behind. **Test:** start a session running a program that spawns a child, reload the plugin (`ctx.scope.update` / door `plugin reload`), and assert that no process of the session or its children is alive (checked by pid, with `process.kill(pid, 0)` throwing, after the disposer resolved), and that the SSE stream ended and the audit line exists.
- One session at a time; the session also ends when the program exits (the effect is disposed then, not only at unload) or Stop is pressed.

## The native module

`node-pty` (the version ACRYL's workspace pins, `1.2.0-beta.15`) is a native addon with prebuilds for macOS, Linux and Windows. It is an optional dependency of the plugin, never of `acrylblends`; `acrylblends add driver-pty` installs it. A single `spawn` seam (`(program, args, options) -> Process`) is the only place that imports it, so unit tests run on a fake process.

If it fails to load (no prebuilt binary, a sandbox that forbids PTYs, Codex workspace-write), the plugin starts with no driver registered and logs a one-line reason (the error message and platform); the panel then lists no `pty:*`. The real-PTY tests skip with a printed reason on a machine that forbids PTYs, but **on CI they must run, Windows included**: when `CI` is set, a load failure fails the test with the reason instead of skipping.

## Acting through the door

Nothing new is needed: the agent in the terminal reads `AGENTS.md` / `CLAUDE.md` in the folder, which name the door verbs. The plugin puts `.acryl/bin` on the session's `PATH`, so `acryl look` works without the folder prefix.

## Client: xterm.js, vendored

The terminal tab uses xterm.js, vendored into `plugins/driver-pty/client/vendor/` with an exact pinned version recorded in a `VERSION` file, its MIT `LICENSE` next to the file, and an entry in `THIRD_PARTY_NOTICES.md`. Served by `clientModules` (no bundler). ACRYL's server-side screen model is not reused.

## Tests

1. Unit, in process, fake PTY: start, write, resize, exit code, kill escalation, the 409, the same-origin and token refusals, SSE replay from `Last-Event-ID` (including an id that fell out of the buffer), input batching on the route, PENDING (no panel: no `pty:*`; panel arrives: listed).
2. Disposal: reload with a session open leaves zero child processes (above).
3. Real PTY, in `check` on Linux, macOS and Windows: runs a Node program that echoes input and prints its window size; resize is seen; disposal kills it. It fails with the reason on CI when `node-pty` cannot load.
4. Gate `verify:driver-pty`: fresh agent app, plugin added, headless Chrome opens the panel's terminal tab, a scripted program (not a model) runs `.acryl/bin/acryl plugin add ...` inside the PTY, the page reloads and shows the new route. Models stay out of `check`; a manual gate with real `claude`, `codex` and `pi` follows the `verify-coding-agent` pattern.
5. `verify:packed` additionally adds the plugin from the packed tarball in a new app (the installed-package rule).

## Order of work

1. Driver registry and the typed `chat`/`terminal` union in the panel; the headless drivers move behind it (no behaviour change, panel tests stay green).
2. `driver-pty` plugin with the fake-PTY tests, SSE/POST routes, effects and the disposal test.
3. The real `node-pty` seam and the CI-strict load.
4. Terminal tab in the panel client (xterm.js vendored, resize, re-attach).
5. Gate, docs (`docs/plugins.md`, the agent guide), release notes, release.
