# Build, then check it through the door, in one run: the recorded run

`node scripts/verify-build-and-check.mjs --driver codex`, 2026-10-29, on 1.0.4 (the branch that became it), macOS, Node 24.19, Codex 0.163. A manual gate: it runs a real agent, so it is not part of `pnpm run check`.

**What it does.** A fresh agent-template app with the panel; a real (headless) Chrome opens the app's page; the message is typed into the panel and sent, as a person does:

> Do it now, without asking for approval. Add a Notes page to this app at /notes: a heading "Notes", a text box labelled "Note", a Save button, and a list; saving adds the note to the list on the page (a small script in the page is fine). Build it as a plugin in plugins/notes and install it into the running app. Then check your own work the way a person would, in this same run: with the door (.acryl/bin/acryl, see AGENTS.md) go to /notes, type a note, press Save, look at the page and confirm the note is listed. Tell me what you saw.

**What came out (171 s).** The gate reads what the door audited (`.acryl/audit/ui-control.jsonl`), not what the agent says:

```
act navigate:ok | look:ok | act type textbox "Note":ok | look:ok | act click button "Save":ok | look:ok
| look:ok | act type textbox "Note":ok | look:ok | act click button "Save":ok | look:ok
```

The agent installed the plugin, went to `/notes` with `act navigate`, looked, typed a note, pressed Save and looked again (and did it a second time after its own tests), then reported: typed `Buy oat milk`, clicked Save, confirmed it appears in the list; `npm test` 14/14, `npm run check`, plugin reload active. The panel showed the question and the report again after the page had reloaded several times during the run (the door reloads the pages after the plugin install, `act navigate` moves the page): the run belongs to the app, not to the page.

**What failed before, and why this run is the proof.** Three earlier tries, each kept honest here:

1. Through the panel's API with no page watching (a script, not a person's page): the agent built the feature but could not see it, because the open page was not refreshed until the run ended and the door had no reload verb (`act press Control+R` and `F5` do nothing). It killed the Electron process and ended without checking. Fixed by `act reload`, `act navigate` and the reload after a live plugin change.
2. With a page that carried no door tag: `look` said no page was open. Fixed by the door adding its script to every HTML page in development, through the new `ctx.router.wrap` (a plain middleware only wraps the routes mounted after it, and a plugin loaded at boot is mounted before the door).
3. In a real page, the same task: the audit showed the whole check, but the panel reported nothing and the run was cancelled when the agent's own navigation reloaded the page, because the run was tied to the page that asked. Fixed: runs belong to the app, a page that loads follows the latest one (`GET /api/agent-panel/run`), and only Stop (`POST /api/agent-panel/stop`) cancels.

Codex needed "Do it now, without asking for approval": with the owner's own global skills it stopped to present a design (see the facilitator notes).

## The app's own agent, with a real model (no login to a coding agent)

`node scripts/verify-inapp-agent.mjs` (a manual gate: it calls DeepSeek; the key is read from the usual place into the server's environment only and is never printed or written into the app). The panel's built-in `agent` driver, not Codex or Claude, with `ACRYLBLENDS_MODEL_URL`, `ACRYLBLENDS_MODEL` (`deepseek-chat`) and `ACRYLBLENDS_MODEL_KEY` set for the server. A plugin loaded at boot serves a counter page with no door tag; headless Chrome opens it; from the panel:

> Use your door tools. Look at the page that is open, press the button "Add one" twice (look again before each press, the refs change), then look once more and tell me the number shown after "Count:".

Result (7 s): the agent called `door_look`, `door_act`, `door_look`, `door_act`, `door_look` (the door audited 5 calls: look, click "Add one", look, click "Add one", look) and answered: *I pressed "Add one" twice, and the page now shows "Count: 2".* This is the path for an attendee with no Codex or Claude login: a DeepSeek key in the environment is enough.

What the first run found, and what changed:

1. The panel did not appear on a plugin's page that loaded at boot, for the same ordering reason as the door's script: its middleware only wrapped routes mounted after it. It now uses `ctx.router.wrap` too.
2. The model sent one `door_act` with no `op`: the tool was described to it only as "an object". The tools registry now carries each tool's JSON Schema (`parameters`), the door registers its verbs with the schema MCP lists, and the openai plugin sends it; the malformed call went away.
3. The run stopped "after 6 steps without an answer": looking, pressing and looking again takes six steps before the answer. The agent template's `steps` parameter now defaults to 12.

## The desktop window attached to a running dev server (by hand, 1.0.5, macOS)

A fresh `acrylblends init app --template agent --desktop`, `npm install`, then:

1. `npm run dev` in one terminal: `app listening on http://127.0.0.1:3591`.
2. `npm run desktop` in another: it printed `desktop: attached to the app already running from this folder at http://127.0.0.1:3591 (its server keeps running when the window closes)` (on 1.0.4 it failed with "another process serves the door"), and an Electron window opened on the dev server.
3. Through the door, from the folder: `acryl look` read the window's page (heading "app", 6 elements), `act click --ref 1.1` answered done, `act reload` and `act navigate --path /` both answered "the page is back", and a second `look` saw the page again.
4. The window was closed by stopping the desktop launcher (SIGTERM, which quits Electron): the dev server still answered 200 on `/` and `.acryl/door.json` was still there. A second `npm run desktop` attached again and the door worked as before.

Found on the way, not fixed in 1.0.5 (it belongs to the Electron adapter, C): `act navigate --path /extra` to a path the app does not serve leaves the window on a page without the door's script, and every door call after that answers `no-window` until the window is opened on a real page again. The same page also still said "add the chat panel with `npx acrylblends add agent-panel`"; the agent template's home page now says the panel is on the page.

## A live install under `npm run dev` (1.0.5)

`node scripts/verify-dev-install.mjs` (in `pnpm run check`): a fresh agent app under `npm run dev`; a plugin is installed with `.acryl/bin/acryl plugin add plugins/board`, changed and reloaded, then the app's own `src/main.ts` is changed. On 1.0.4 the gate fails: `node --watch` watches every module the process imported and keeps watching the paths of earlier runs, so deleting a staged copy (the old version after a reload, a copy a refused install left) restarts the app, and each start stages the extensions again and prunes the older copies: a restart loop, with the door answering "no running app" in between (four restarts in a row in the first reproduction). Now: an unchanged source reuses its staged copy (copies are made under a temporary name and renamed, so a final name is whole), and under the watcher (`WATCH_REPORT_DEPENDENCIES=1`, which Node sets) staged copies are not deleted; a start without the watcher prunes. The gate sees no restart for the install or the reload, the door up throughout, and exactly one restart, with the plugin back, for a change of `src/main.ts`.

## A mistyped path (1.0.5)

The hand test above stranded the Electron window: `act navigate --path /extra` to a path the app does not serve left it on a bare 404 with no door script, and every call after answered `no-window`. Fixed at the cause: in development the door's `router.wrap` turns a 404 for a page request (Accept lists `text/html`, the body is not JSON) into a small HTML page that names the path, links back and carries the script; `act navigate` reports what the app answered. `verify:door` (a real headless Chrome) now navigates to `/nope`, gets `404 at /nope`, looks (`404 Not Found`), clicks "Back to the app", navigates to `/p1` (`200 at /p1`) and looks. Unit tests: `plugins/acryl-door/tests/host/door.spec.ts` (the 404 page, a script `fetch` and an app's JSON 404 untouched) and `reload.spec.ts` (the status text).

The same sequence by hand in the Electron window attached to `npm run dev` (the app of the hand test above, its door upgraded from this checkout): `look` (heading "app"); `act navigate --path /nope` answered `going to /nope; 404 at /nope: the app serves no page there, look at what is shown and navigate to a path it does; the page is back`; `look` read the window (`Page: 404 Not Found`, heading "404 Not Found", the path `/nope`, link "Back to the app"); `act click` on the link brought the app's page back (`look`: heading "app"); `act navigate /nope` then `/` answered `404 at /nope` and `200 at /`, and `look` saw the app again. The window behaves as headless Chrome does, and the dev server answered 200 throughout.
