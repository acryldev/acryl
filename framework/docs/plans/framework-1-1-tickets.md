# After 1.0: tickets

Status of each item is what the repository holds today. The order is the coordinator's (2026-10-28); a ticket does not start before the ones above it are done, and nothing here is built ahead of its turn. Item numbers are the coordinator's, kept so a message can name them.

## 1.0.1 (security fix, in release)

The `agent` template left its agent, builder and extensions rows mounted with `NODE_ENV=production`. 1.0.1 leaves them out like the door, with `ACRYL_PRODUCTION_KEEP=agent,builder,extensions` as an explicit opt-in per row and a `WARNING` line at start for each row kept. Covered by the template tests and the cross-plugin production test; said in `docs/release-notes/1.0.1.md`. Status: built; published when the release checklist is complete.

Same-shape check (a template or built-in row that stays mounted in production and gives a visitor power over the app or the model key):

| Where | Result |
| --- | --- |
| `blank`, `todo` | no development rows |
| `nodejs`, `notes`, `chat` | already leave `extensions` out in production, and the door |
| `agent-panel`, `driver-pty`, `driver-acp`, `acryl-door` | gate themselves on `NODE_ENV=production` / `ACRYL_DOOR=off` |
| `acryl-state` | exposes cells only for what is mounted |
| `chat` template's chat endpoint | open by design (a chat app answers its visitors with the model key); not changed, said in the 1.0.1 notes: put a login in front |

## 1.0.2 (workshop fixes, in release)

From DS_Fork3's macOS walk and Fork3's Linux walk (`docs/plans/workshop-readiness.md`), ahead of the 1.1 list because they stand between a newcomer and the 2026-11-20 workshop. Built and in `docs/release-notes/1.0.2.md`: B1 `create-acrylblends --from <id | source>` with `--registry`, registry `runtime` field and badge, three acrylblends starters; B2/L3 `npx acrylblends@latest upgrade`; C1 `add agent-panel` mounts or refuses; C2 login documented; C3 pi detection; C4 todo URL; C5 node-pty approval text; cosmetics (one `Next:`, `--desktop` wording); L1 Linux sandbox launcher; L2 Node 22.19 preflight; the chat template closed in production. Not in 1.0.2: Windows findings (DS2's walk is not in yet), the workshop registry repo (designed, not created).

## 1.0.3 and 1.0.4

1.0.3 (built, published with this note): Node 26 in CI and the adapter's body read, relative paths in manifest rows (`add db`, `add kv` mount), a pasted GitHub address as a source, two flakes fixed at the root. 1.0.4: the Windows walk (DS2) when it lands. The original `ECONNRESET` in the node-server websocket test never reproduced (0 failures in about 135 runs under load); the flake found and fixed instead was the shared static fixture.

## 1.1, in order

| Order | Item | Priority | Status |
| --- | --- | --- | --- |
| 1 | **2.** macOS and Windows coverage for `acrylblends upgrade` and the `driver-acp` tests (the upgrade fixtures and the process-group tests run on Linux only today in some jobs; make all three systems run them) | high | not started |
| 2 | **4.** Install and discovery polish, including the `node-pty` allow-scripts warning (pnpm's build-script approval hides the native module) | high | not started |
| 3 | **8.** Release-notes pages for the versions that have none: 0.5.1, 0.6.0, 0.6.2, 0.6.3, 0.6.4 (generated from the tags, so the sites list a complete history) | medium | not started |
| 4 | **3.** `acrylblends doctor` (what is installed, which rows are on, which are development-only, whether `NODE_ENV=production` would leave them out) | medium | not started |
| 5 | **5.** A docs coverage test: every PUBLIC subpath has a page that names it; docs for the tasks recorder and its conformance suite | medium | not started |
| 6 | **14.** DONE in 1.1.0: a page follows state with `watch(key, fn)` of `/api/state/client.js`, over one WebSocket (`GET /api/state/ws`) with the event stream as the fallback (one console warning), no-`Origin` callers allowed only with a loopback `Host`; gates: `verify:door` section G (six held connections, real Chrome) and `verify:desktop` (eight board windows, real Electron). Was: the state client's live events stop counting against the browser's six connections per host. Today each cell a page reads (`/api/state/<cell>/events`) holds its own event stream; sharing one stream per page is not enough (8 windows of a board is still 8), so the events should travel over a WebSocket, like the door's and the panel's (1.0.8), with the stream as the fallback. Found on macOS with 8 board windows (windows past the sixth loaded only partly). The door and the panel use none | high | not started |
| 7 | **15.** The panel lies beside the page (1.0.7), but an element the page fixes to the window (`position: fixed` to the right edge) can still sit under it. Reserve the panel's width for fixed elements too, without a transform on the root (which would move the panel) | low | not started |

## P1, below the workshop capability work

| Item | Priority | Status |
| --- | --- | --- |
| **13.** DONE in 1.0.10: `acrylblends` no longer declares `vitest` as a peer (it was for the two conformance suites, `acrylblends/db/conformance` and `acrylblends/kv/conformance`, not for `acrylblends/testing`, which never imported it). A production install no longer pulls vitest, vite, rolldown or lightningcss; the suites still run in a provider's own project, which has vitest as its dev dependency. `verify:vitest-peer` checks the manifest, the closure of a `pnpm install --prod` with vitest in the workspace beside it, and a provider's suite under pnpm. | P1 | done |

## Next release that ships

| Item | Priority | Status |
| --- | --- | --- |
| **6.** A scripted real-agent release routine (one command runs the real-agent gates and writes the evidence page), with per-driver version notes (which version of each agent CLI was run) | high | not started; goes in with the next release |

## After 1.1

| Item | Priority | Status |
| --- | --- | --- |
| **7.** `acrylblends upgrade`, second pass (the app's own files such as the agent template's `src/app.ts`; today it only replaces library plugins, which is why 1.0.1 asks 1.0.0 apps to paste the new lines) | medium | not started, after 1.1 |
| **11.** Promote Bun from experimental | low | not started, after 1.1 |

## When something else allows

| Item | Condition | Status |
| --- | --- | --- |
| **12.** The Claude row (a third real-agent run on the whole starter set) | when the model quota allows | waiting |
| **10.** Other runtime adapters as plugins (`aws-lambda`, `cloudflare-*`, `netlify`, `vercel`, ...) | parked until M9 | parked |

## M9 (WebBoxes hosting)

Needs a per-app production switch and a manifest field for what an app exposes. The coordinator brings the design; nothing is built ahead of it. `ACRYL_PRODUCTION_KEEP` (1.0.1) is the template's switch for its own rows, not that design.
