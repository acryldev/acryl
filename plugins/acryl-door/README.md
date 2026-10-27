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

The running door writes `<app>/.acryl/door.json` with its loopback URL, this run's secret and its pid. The client finds it by walking up
from the current folder, and sends each verb to `POST /api/acryl-door/call` with the secret as a Bearer token:

```sh
acryl-door brief
acryl-door look
acryl-door act click --ref 3.1
acryl-door plugin add plugins/pomodoro
acryl-door tool call --tool add --args '{"a":2,"b":3}' --json
```

`acryl-door verbs` lists the verbs, `--dir <folder>` names the app folder, and `--json` prints the value instead of the text. The exit code
is 0 for done, 1 when the verb failed (its code and message go to stderr), 2 for a usage error and 3 when no app is running in the folder.
The ACRYL Host's `acryl control ...` forms are accepted too.

- `.acryl/` is `0700` and `door.json` `0600` on macOS and Linux. On Windows the file keeps the ACL of the user's profile (the user, SYSTEM
  and Administrators). The folder has its own `.gitignore` of `*`, so the secret is never committed.
- Each run makes a new secret. Disabling the row removes the file, but only if it is this run's.
- A file left by a process that is gone is replaced. If another live process already serves the folder's door, the row fails and the
  file is left alone.
- `plugin add` takes only a folder inside the app.
- Every look and act is written to `.acryl/audit/ui-control.jsonl`, without the text that was typed.
