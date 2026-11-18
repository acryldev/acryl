# The Electron adapter: windows, menus and settings as door verbs

Status: design, 2026-10-29. Target: 2026-11-05 (the workshop is 2026-11-20). Owner: the acrylblends distribution.

## Why

The door lets an agent `look` at the page that is open and `act` on it. In the desktop app that is one page. A desktop app is more than its page: it has several windows, a menu, a settings view, dialogs. The workshop's centre is an agent living in the app that controls it ("click the sidebar, open the settings window, resize this, use the File menu"). Without these verbs the agent can only drive the one page it was started on.

## What the person sees

```
acryl window list                       the app's windows: id, title, path, focused, size, whether the door can drive it
acryl window open [--path /settings]    a new window on a path of the app
acryl window focus --id 2
acryl window close --id 2
acryl window resize --id 1 --width 900 --height 640
acryl menu list                         the application menu as a tree of labels (path, enabled)
acryl menu click --path "File>New Note" press one menu item
acryl look  [--window 2]                look at that window (default: the focused one, as today)
acryl act click --ref 1.4 [--window 2]
```

The same verbs are in MCP and in the in-app agent's tools (one verb table, `host/verbs.ts`, as for every verb). In a browser (no desktop shell) `window` and `menu` answer `unavailable: this app has no desktop shell` and `look`/`act` behave as they do now.

## How it works

The door lives in the app's server process. The Electron main process is the same process when `npm run desktop` starts the app itself, and a different one when it attaches to `npm run dev` (1.0.5). The adapter must work in both, so it does not call Electron from the door. It reaches it the way a page does:

1. **A shell channel.** The door gains `GET /api/acryl-door/shell/events` (an event stream down to the shell) and `POST /api/acryl-door/shell/answer` (results up), the page channel's shape (`host/channel.ts`, `page-routes.ts`), but for one connection, the desktop shell. It is not for pages: it needs the door's secret (`Authorization: Bearer`, from `.acryl/door.json`, which only the person's account can read) and a loopback caller, like the operator routes. A page cannot open it.
2. **The shell side** (`plugins/desktop/door-shell.ts`). The Electron main process reads `.acryl/door.json`, opens the stream, and answers calls with Electron's own API: `BrowserWindow.getAllWindows()`, `new BrowserWindow`, `focus`, `close`, `setSize`, `Menu.getApplicationMenu()`, `MenuItem.click()`. It reconnects with the same window ids when the door restarts (`npm run dev` restarts the server on a change; the Electron window stays).
3. **Verbs.** `window` (`list|open|focus|close|resize`) and `menu` (`list|click`) in the verb table; the door sends the call to the shell channel and renders the answer. Only the shell's answer is trusted for its own windows; a menu `click` runs the item's handler in the main process exactly as a click would, and nothing else is reachable (no arbitrary evaluation).
4. **Window selection for `look` and `act`.** Each Electron window gets a user-agent suffix `AcrylWindow/<id>`; the page script sends it as `shell=<id>` when it opens its channel (`page/index.ts`), and the host remembers which page belongs to which shell window. `--window <id>` picks that window's page instead of the most recently focused one; an unknown or unconnected id is `no-window` with the list of ids. With no `--window` nothing changes.

## Safety

- The shell channel needs the door's secret and a loopback caller. A page, a web site or another user cannot reach it. Development only, like the whole door (`NODE_ENV=production` mounts nothing).
- `window open --path` takes a path of the app, with the same check `act navigate` has (starts with one `/`, names no other site); `will-navigate` and the window-open handler of `main.ts` keep other origins out.
- Menu items are only found by their label path from the application menu; `click` on a disabled item is refused. Each call is audited like the page calls (`.acryl/audit/ui-control.jsonl`: verb, target label, outcome; never typed text).
- Closing the last window ends the desktop process, as now; `window close` on the last window says so and does it only with `--force`.

## Tests

- Unit (vitest, no Electron): the shell channel (attach, call, answer, reconnect, a page refused, no secret refused), the verbs against a fake shell, `--window` selection in `UiChannel`, the verb table comparison test (all faces).
- Unit for the shell side with a fake `electron` module (window list/open/close/resize/menu tree/click, disabled item).
- A gate with a real Electron (macOS and Linux with xvfb, `verify-desktop-door.mjs`): start the app, `npm run desktop`; `window list` sees one window; `window open --path /second`; `window list` sees two; `look --window 2` reads the second page; `act click` on it; `window resize`; `menu list`; `menu click`; `window close`; the app ends with the last window. Plus the attached case (`npm run dev` first).
- By hand in the windows of macOS and Windows (the Windows walk is DS2's), recorded in `docs/plans/door-build-and-check-evidence.md`.

## Not in this design

- Native dialogs (open/save): an Electron dialog is not a page; they stay out until a case needs them.
- A settings view of Electron itself: an app's settings are a page of the app (`window open --path /settings`) or a menu item (`menu click`). No verb of its own.
- Control of other applications (that is the computer-use tool's job).

## Order of work

1. Shell channel in the door and a fake-shell test.
2. `window` and `menu` verbs, MCP and tools registry, the table test.
3. `--window` on `look`/`act`, the `AcrylWindow/<id>` handshake.
4. The shell side in plugins/desktop with the fake-electron tests.
5. The real-Electron gate; by-hand run; docs (`docs/framework/getting-started/desktop.md`, the door README, the agents guide) and the release note for 1.0.6.
