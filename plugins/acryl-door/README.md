# acryl-door

The Door of a framework app, as one Cordis plugin (spec 049 slice 9). An agent working in the app folder can do three things through it:
look at the running page, act on it, and add, remove or reload plugins while the app runs. Everything else (reading and writing files,
running tests, git) it does with its own file tools and shell.

```yaml
- id: acryl-door
  name: acryl-door
  config:
    tools:
      expose: [add]   # app tools from the `tools` service the door offers; none by default
```

The row needs `router`, `appInstance` (with the app folder as `root`) and `nodeServer`, and stays PENDING until all three exist. The
`extensions` and `tools` services are optional: without them the plugin and tool verbs answer `unavailable`. Mount the row only in
development builds; the template's row decides that, not a config option.

## The page

The page loads one script, `<script type="module" src="/api/acryl-door/page.js"></script>`. It keeps an event stream open to the Host
(`GET /api/acryl-door/channel`), receives each call on it and posts the answer back (`POST /api/acryl-door/channel/answer`). The Host
sends a `ping` every 15 s. A page that hears nothing for 45 s, or whose stream closes, opens a new one with the same window id. A call in
flight when its page drops settles at once as `disconnected`.

While the agent works, a bar at the bottom of the page says what it is doing. Its **Stop** button (or Escape) ends the act in progress as
`killed` and refuses every later one until the person presses **Allow again**. The agent cannot see or press the bar.

Only the app's own page reaches the channel: a request must come from loopback to the app's port and carry that origin
(`Origin`, or `Sec-Fetch-Site: same-origin` with a `Referer` from it). Another site, another loopback port and a script with no browser
headers get 403.

## The operator

The running door writes `<app>/.acryl/door.json` with its loopback URL, this run's secret and its pid, and the folder's own command,
`<app>/.acryl/bin/acryl` (`acryl.cmd` on Windows). The command runs this package's client with the Node that runs the app, pinned to
this folder (`--dir <app>`), so it reaches only the app running from here: never another app's door, never an `acryl` on PATH. The
client sends each verb to `POST /api/acryl-door/call` with the secret as a Bearer token:

```sh
.acryl/bin/acryl brief
.acryl/bin/acryl look
.acryl/bin/acryl act click --ref 3.1
.acryl/bin/acryl plugin add plugins/pomodoro
.acryl/bin/acryl tool call --tool add --args '{"a":2,"b":3}' --json
```

The command is written each time the app starts (a moved folder or a new Node is picked up) and stays when it stops. The package's own
`acryl-door` binary is the same client; without `--dir` it finds the app by walking up from the current folder.

`acryl verbs` lists the verbs, `--dir <folder>` names the app folder, and `--json` prints the value instead of the text. The exit code
is 0 for done, 1 when the verb failed (its code and message go to stderr), 2 for a usage error and 3 when no app is running in the folder.
The ACRYL Host's `acryl control ...` forms are accepted too.

- `.acryl/` is `0700` and `door.json` `0600` on macOS and Linux. On Windows the file keeps the ACL of the user's profile (the user, SYSTEM
  and Administrators). The folder has its own `.gitignore` of `*`, so the secret is never committed.
- Each run makes a new secret. Disabling the row removes the file, but only if it is this run's.
- A file left by a process that is gone is replaced. If another live process already serves the folder's door, the row fails and the
  file is left alone.
- `plugin add` takes only a folder inside the app.
- Every look and act is written to `.acryl/audit/ui-control.jsonl`, without the text that was typed.

## One verb list: CLI, MCP and the built-in chat

The verbs are one table, `src/host/verbs.ts`, and each face reads it, so a verb is in all three or in none:

- The CLI is `.acryl/bin/acryl <verb>`, as above.
- MCP is `POST /api/acryl-door/mcp`, with the same guard as the operator: loopback, and the secret from `.acryl/door.json` as a Bearer
  token. It is streamable HTTP in its request/response form, with no event stream. Each verb is a tool under its own name (`look`,
  `plugin-add`), taking the arguments the CLI sends. A failed verb is a tool result with `isError` and the line the CLI prints,
  `<code>: <message>`.
- The built-in chat reads the app's `tools` registry (acrylblends' `agent` plugin). While both are up, the door registers each verb
  there as `door_<verb>` (`door_look`, `door_plugin_add`), and removes them when either stops. A tool answers the verb's text. A failed
  verb throws `<code>: <message>`. `tools.expose` refuses `door_` names, so the door never offers its own verbs back as app tools.

`tests/host/verbs.spec.ts` lists the verbs from each face of a running app and compares them.
