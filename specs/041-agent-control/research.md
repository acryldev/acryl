# Research: Agent Control (spikes T001 to T004, answered by building)

Answers are from the code that shipped on 2026-09-27 (`plugins/acryl-ui-control`), not from guesses.

## T001: how a Host-side tool reaches the page

**Verdict: a Client-initiated WebSocket to the Host.** The Host web server already supports exact-path upgrade routes (`ctx.webServer.registerUpgrade`, the same mechanism the workspace terminals use). The page opens `wss://<host>/api/acryl-ui-control/channel`; the Host tools send `{t:'call', id, request}` and the page answers `{t:'result'|'error', id, ...}`. No Harness change was needed, nothing is Electron-IPC-only, and a Desktop window is just a page served by the same Host, so **one implementation serves Web and Desktop**.
- The upgrade uses the same strict same-origin loopback check as every private route (`runtime/acryl-loopback-http`), with the exact `Origin` required, so another web page cannot connect (tested against a real socket).
- Only the window a call was sent to may answer it (a second window cannot forge a result).
- Calls have a timeout, honour cancellation, and settle as `unloaded` when the plugin is disposed and as `no-window` when the page goes away.

## T002: accessibility quality

The snapshot builder lists interactive controls, headings, landmarks, status regions and dialogs with role, name and state. A control with no accessible name is listed with an empty name and is still operable by its ref, but an empty name makes approval prompts and audit lines weak. The audit is therefore a standing task: components in `@acryl/ui` and the workspace need `aria-label`s where a control is an icon. Tracked as T050 below; measured on the real tree in a browser pass, not in jsdom.

## T003: approval and policy

**Verdict: the Harness's own pre-execute policy does it, per call.** A `tools/pre-execute` hook can return `{kind:'ask', reason}`; the harness then makes one `ctx.approval` request, and only `allowed-once` proceeds (`rejected`, `cancelled` and `unavailable` deny). The plugin's hook asks for `ui_click`, `ui_type`, `ui_select` and `ui_press` every time, in words that name the control ("Click the button \"Delete project\"") using the refs of the latest snapshot. It calls `next()` first, so another plugin's denial still wins. Verified against the real engine: with nobody to answer, a click is denied and never reaches the page. `ui_snapshot`, `ui_scroll` and `ui_wait` only look, so they are not asked about.
- Tool names use underscores (`ui_click`), matching the harness's own tools, not the dotted names in the first draft of the spec.
- Self-protection lives in the driver and is enforced by rule: controls inside regions named approval, permission, policy or Agent Control, or marked `data-acryl-no-agent`, are listed as `protected` and never operated. The indicator's own buttons carry that mark.

## T004: multi-window and Web behaviour

Each window announces itself (`hello`, then `focus` events); the agent drives the window the user focused last. Layer 3 (`ui_screenshot`) is not built: it needs a native or canvas capture and stays a typed adapter with a declared absence on Web (see tasks).
