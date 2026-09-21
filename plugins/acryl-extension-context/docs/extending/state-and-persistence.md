# State and persistence: where a plugin keeps its data

Pick where the data lives BEFORE writing the plugin. Every option below is available; they differ in who can see the data, what survives, and
which surfaces they work on. If the user did not say, choose from the table and tell them the trade-off in one sentence.

| Option | Lives in | Survives | Shared between | Agent can read it | Surfaces | Example |
| --- | --- | --- | --- | --- | --- | --- |
| Browser `localStorage` | one browser origin | reload, restart (NOT clearing site data) | nothing: Web and Desktop each have their own | no | web, desktop | `client-slot.header-action`, `ui-components.shared-primitives` |
| Host file behind an RPC channel | `<DSH home>/plugin-data/<plugin>/` | everything, incl. clearing the browser | every window, browser and surface using the same ACRYL home | only through your own tool | web, desktop | `state.host-store` |
| Workspace file | `<workspace>/.acryl/` (any file) | everything; can be committed to git | everyone using that project | yes, with its normal file tools | tui, web, desktop | `state.workspace-file` |
| User settings | the user settings document | everything | every surface using the same DSH home | through settings | tui, web, desktop | `settings-section.basic` |
| Harness storage domains (`ctx.storageDomain`) | a routed storage backend | everything | per backend routing | no | tui, web, desktop | none (see below) |
| In memory (a variable in `apply`) | the running process | until the app restarts or the plugin reloads | the process | no | all | any example |

## Choosing

- A UI preference or a scratch list that only matters in this browser: `localStorage`. Simplest. Tell the user it is per browser and per surface.
- Data the user expects to see the same in Web AND Desktop, or that must survive clearing the browser: a host file behind an RPC channel.
- Notes, todos or decisions that belong to a project and that the agent should read and write: a workspace file (plain Markdown or JSON).
- A few named options the user edits (a toggle, a limit, a default): a settings section, not a data file.
- Never keep secrets in `localStorage` or in a workspace file (it can be committed). Use a settings field marked `.role('secret')`.

## Host file behind an RPC channel (`state.host-store`)

Host half: `inject = ['connection', 'webServer']`, then `ctx.connection.rpc.handle(channel, async (endpoint, payload) => result)`. Client half:
`inject = ['slots', 'connection']`, then `ctx.connection.rpc.call(channel, endpoint, payload)`. The channel sits behind the browser
authentication and Host/Origin checks, unlike a bare `webServer.register` route (see `host-route.md`).

Facts measured while building the example (each one cost a failed run):

- A handler MUST return the result envelope: `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`. Any other shape (for example
  `{ notes }` or `{ error: 'x' }`) is rejected as `connection: invalid server-response result`.
- `rpc.call` resolves to that same envelope. Unwrap it once in the client (`ok === false` -> throw `error.message`); rendering `result.error` directly
  crashes React (error #31: an object is not a valid child) and the whole slot disappears.
- Always send an object payload (`call(endpoint, payload ?? {})`). `undefined` is dropped by JSON and the host answers `invalid client-request message`.
- Both `connection` and `webServer` must be in the HOST plugin's `inject` (the connection registers the channel through `webServer`).
- Get the data directory with `ctx.get('dshHomePath')('plugin-data', <plugin name>)`, not a hard-coded `~/.acryl`. Web and Desktop dev runs use different
  homes (`~/.acryl`, `~/.acryl-dev`), so two surfaces share the file only when they run against the same home.
- Write atomically (temp file, then rename), validate every input (the page can send anything), and cap sizes.

## Workspace file (`state.workspace-file`)

The session's workspace is `exec.agent.session.header.cwd` inside a tool's `execute(args, exec)`. Append-only files (one line per note) are safe when
two sessions write at once; whole-file rewrites are not. Refuse to guess a directory when the session has no workspace. The file is normal project
content: the user sees it, git can track it, and the agent can read it with its usual file tools, so no tool is needed to READ it, only to write.

## Settings (`settings-section.basic`)

`ctx.settings.installSection(ctx, NAMESPACE, Config, config, { validate, setSource, onChange })` inside `ctx.inject(['settings'], ...)`. Read the value
through the `setSource` function on every use; never cache it. See `config-schema.md`.

## Harness storage domains (`ctx.storageDomain`)

The harness's own persistence hub (`../reference/subsystems/storage.md`): a domain is declared with `defineDomain` (zod schemas, a version, tables) and
opened with `ctx.storageDomain.open(spec)`; reads are synchronous from memory, writes are queued and drained, and a `domain/changed` event fires. It
is what the harness uses for session projections. There is no example in this pack: it needs a dependency on the harness storage-domain package and
it was not verified from a user plugin. Prefer the options above unless the user needs versioned, schema-checked tables; if you use it, verify with
`acryl_verify_plugin` and a real run before saying it works.

## Related

Host routes: `host-route.md`. Client slots and `localStorage` UI: `client-slot.md`, `ui-components.md`. Session persistence in the harness:
`../reference/subsystems/persistence.md`.
