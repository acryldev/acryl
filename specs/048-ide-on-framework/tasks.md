# Tasks 048 - The ACRYL IDE on the ACRYL Framework

Each task is one slice and one commit (see `plan.md`, "The slice method"). Earlier IDs: spec 046 `tasks.md` T021-T027 and spec 047
`plan.md` T016-T017 moved here.

- [x] T001 `acryl-workspace` onto the router (was 047 T016 and 046 T021). Commit `16fe8aff906a2a96e05a00cecda9f453f8332f3c`, on `main`
  since `064efb53`. Evidence: full gate; CI run 40076441073 green; isolated Web run (`live-run --no-key`, `acryl.ide`) with 18 HTTP
  checks (projects, files, git, 405/403/413, the event stream following a change, a live terminal over the WebSocket, the architecture
  page) and screenshots of the IDE; isolated Desktop run with the same checks inside the Electron renderer and a window screenshot (the
  sidebar showing the project and its git badge), Electron user data in the throwaway root, ports free, real homes untouched. Measured:
  call sites 30 -> 19 (workspace 12 -> 1), DSH import lines 133 -> 133. Changed answers recorded: 413, 405 with `Allow`, agent-hook token
  401. Found and fixed: the router's mount label grew with the app and broke the plugin-admin architecture page (500).
- [x] T002 `acryl-agent-control`, the door, onto the router (was 046 T024). Commit `4d0cf1352b37e75f68c3fded816259a541770427`. Trust model unchanged
  (operator refusals stay 403 `forbidden`). Evidence: full gate; route tests over a real socket through the real adapter; plugin tests on
  real Cordis with the real router; isolated Web run (`live-run --no-key --copy-home` with the online channel on in the profile patch):
  `acryl control snapshot` read 26 controls of the live page (headless Chrome), `acryl control tool list` and `tool call
  acryl_list_plugins` answered through the gateway, no-auth and wrong-secret calls 403, a GET on the online call 405 `Allow: POST`; port
  free and real homes untouched afterwards. Measured: call sites 19 -> 14 (agent-control 6 -> 1, the page channel upgrade), DSH import
  lines 133 -> 133. Found and fixed: a workers request from neither the page nor an operator answered 500 instead of 403. Found, ticketed
  as T011: `acryl control` finds no app started by `pnpm web`, Desktop or the npm CLI.
- [x] T003 `apps/acryl-desktop`: the settings, preferences, renderer boot report and directory picker and validator routes (was 046 T023).
  Commit `bd0b10303c799dda11133cbf66e463a65319b6c1`, in its own row `acryl-desktop/api` (the row-id exception named in `plan.md`,
  slice 4). Evidence: full gate; CI, Windows, Desktop on Linux and Data green; a real-Loader test with three router reloads (one
  registration per prefix each time, the shell never disposed); isolated Desktop run (`live-run --no-key --copy-home ~/.acryl-dev`) from
  a profile written 2026-10-20 without the router rows: the renderer booted and reported its health through the new route, settings and
  preferences 200, the validator 200 and 415, the picker and boot report 405 with `Allow`, a foreign origin and no origin 403, Settings >
  Desktop rendered from the moved API; port free and real homes untouched. Measured: call sites 14 -> 9, DSH import lines 135 -> 135.
  acrylblends 0.9.2 taken into the lock.
- [x] T004 `acryl-sign-in`: its five sign-in routes; the checks stay exactly (was part of 046 T025).
  Commit `35921763e3ece10637e1db21d07aca669a889062` (`plan.md` slice 5). Evidence: full gate; CI, Windows, Desktop on Linux and Data
  green; a plugin test on real Cordis with the real router over a loopback socket; an isolated Web run answered every route as recorded
  and Settings > Models rendered the sign-in card from its own calls (200). Measured: call sites 9 -> 8, DSH import lines 135 -> 135.
- [x] T005 Find the terminal's PATH without blocking (was 047 T017): ask the login shell asynchronously once, cache the promise, and make
  the callers that need it (`start`, `canRun`) wait for it, so activating the workspace never blocks the Host's event loop (about 1.2 s
  with an interactive zsh today, on every activation). Planned right after T002.
  Commit `22018414409da0eed9d33137f5a699355ba84ac5` (`plan.md` slice 3), on the flake fix `1b5e5575781b8c9cb7220555e600dad6eebd6b50`
  (Desktop's port-retry rule as `bindDesktopPort`, tested without real ports; the real-socket test holds both ports itself). Evidence:
  full gate; all four workflows green; five tests with a fake login shell, among them a timer that keeps firing while the shell answers.
  Measured: call sites 8 -> 8.
- [x] T006 `acryl-plugin-admin` and `acryl-support` (was part of 046 T026).
  Commit `602b375b6fa61344440f321203cea2397dbdab56` (`plan.md` slice 6). Evidence: full gate; all four workflows green; plugin tests on
  real Cordis with the real router over a loopback socket; an isolated Web run of `acryl.ide` (`live-run --no-key`): architecture,
  lifecycle and diagnostics 200, a foreign origin 403, PUT 405, an invalid reload body 400, a text body 415; port free and real homes
  untouched. Measured: call sites 8 -> 5.
- [x] T007 WebSocket upgrades on the router (spec 047 T009), then the workspace terminal stream and the door's page channel move off
  `registerUpgrade`. The door's page channel no longer upgrades, so the terminal stream was the only user left. Done with T008 in one commit
  that lowers T009's ceiling to 0.
  Commit `f01f3da2457f2bea4c89dd7768a0f132bc27969d` (`plan.md` slice 9), on acrylblends 0.11.0. Evidence: full gate; all four workflows green; the stream's tests on the
  framework's real `UpgradeHub` and the plugin's on a real shell through the real `router` and `routerHttp`; live in isolated homes on Web
  (a scripted page client: output, resize, reconnect from a cursor, 403/403/400 refusals, 4404) and in the Desktop window (a terminal tab
  before and after a reload). Measured: call sites 3 -> 0.
- [x] T008 Remove the `acrylWeb` carrier's registration methods and the `engine-web.ts` delegate once nothing registers through them (was
  046 T022, rescoped: the composition root stops handing the server to plugins).
  Commit `f01f3da2457f2bea4c89dd7768a0f132bc27969d`, with T007: `AcrylWeb` is `host` and `port`, and `engine-web.ts` delegates those two only. `WEB_REGISTRATION_CEILING` is 0.
  The live check exposed an isolation gap in the run launcher, fixed in `f8f903db58d90f6b0efed0ed3e94d9b9d6955127`: an isolated run passed the caller's `ZDOTDIR`
  through, so its terminal loaded the real `~/.zshenv` and `~/.zshrc`. The Windows workflow then found the plugin's real-terminal test
  waiting for POSIX arithmetic that cmd.exe does not do; fixed in `a09fefc2836fe0d47f6e5cbeeb31778cee7473a2` with a mark every shell prints.
- [x] T009 Ratchet: the call-site count becomes a layout gate in `scripts/verify-layout.mjs`, like the DSH import ceiling (was 046 T027).
  Commit `9073312d7afb7803cefa7157ae765fac8c5b8fac` (`plan.md` slice 8): `WEB_REGISTRATION_CEILING = 3`, failing above and below. Evidence:
  full gate (its line reads "webServer registration call sites 3"); all four workflows green; both failures run once on a probe copy.
  T007 and T008 lower it to 0 in their commit.
- [x] T010 The agent-facing plugin docs and example in `acryl-plugin-context` teach the router, not `webServer` (the item left open in
  046 T020).
  Commit `f6538891199a6618b313b041aaeeac4247c31ec4` (`plan.md` slice 7). Evidence: full gate; all four workflows green; the example gate
  gets `ok` from the example's route on the real socket and a non-200 after it unloads; the install lint refuses `acrylblends` under
  `dependencies`. Measured: call sites 4 -> 3.
- [x] T011 `acryl control` can discover every running app, not only `pnpm blank` ones. Since `1b10c17c` (2026-09-27) the running-app
  registry (`runtime/acryl-harness-runtime/src/instance/registry.ts` `announce`) is written only by `scripts/lib/instances.mjs`
  `claimInstance`; the Web launcher, Desktop and the npm CLI never announce, so `acryl control list` says "no ACRYL app is running" while
  one runs with its online channel on (reproduced in the T002 live run, which wrote the pointer by hand to reach the door). Each composition
  root should claim and announce its instance with its real port once it listens, and withdraw on exit.
  Found again 2026-10-27 (spec 049 slice 17, the DSH door live check, AcrylImplementer): every run of `scripts/live-run.mjs` starts the
  app with an explicit `ACRYL_HOME` (`apps/acryl-web/lib/bin.js`, Desktop's `launch-dev.mjs`), so no isolated live check can reach its
  app through `acryl control`; the check called `POST /api/acryl-agent-control/online/call` with the secret read from
  `<home>/agent-control-secret` instead. Done when a live run of Web and of Desktop with `acryl-agent-control`'s `online` on answers
  `HOME=<run home> acryl control list` with its instance and `acryl control snapshot` and `click` reach the page, the list is empty after
  the run stops, and the real `~/.acryl-instances` is unchanged.
  Commit `d1725c87b528f17c2efb2b48e90b2aa1b5d48bba`. The process that serves an app is the holder: `announceSelf` (new,
  `runtime/acryl-harness-runtime/src/instance/announce-self.ts`) takes the run lock and writes the Registry entry with the port the server
  really bound, and its `release()` withdraws both. `serveWeb` announces once the Web carrier listens (the `--json` probe does not claim),
  Desktop's Host plugin announces `ctx.webServer`'s port, `runAcrylTui` announces the terminal surface with no port, and `scripts/blank.mjs`
  no longer claims or announces - it refuses early from the Registry and lets the app's own claim settle a race. Desktop quits the process
  without unloading the Loader, so its announcement also ends on the process's own `exit` and on the `SIGINT`/`SIGTERM` the launcher handles;
  until those existed, a stopped Desktop app left its entry for a reader to prune. Evidence: full gate; `tests/announce-self.spec.ts` (five:
  real port in the entry and the lock, idempotent release, a live second app refused and nothing changed, a dead holder replaced and an older
  release not clearing a newer claim, a same-process re-announce); the existing instance and bulkhead specs, the web serve, CLI host/run and
  desktop plugin specs, and the launcher script tests. Live checks with `scripts/live-run.mjs ... --no-key --keep` (isolated HOME, ACRYL_HOME
  and Electron user data): Web - while it ran, `HOME=<run home> acryl control list` answered `pinned-... web pid ... port 3292`, and after
  SIGTERM the kept run root's `.acryl-instances/.running` was empty; Desktop - while it ran, the same command answered
  `pinned-... desktop pid ... port 3295`, the Electron process held that port, and after quitting the command answered "no ACRYL app is
  running" with the port free and nothing under the real `~/Library/Application Support/ACRYL*` changed. A group kill that reaches the app
  with a second signal can still outlive the withdrawal; the Registry's own rule (an announcement whose process is gone is dropped when read)
  covers that, and the next `acryl control list` removes it. The real `~/.acryl-instances/.running` was never written by a gate (watched
  through a whole gate run). Found and fixed on the way: the desktop loader and profile smokes boot a real Desktop root and wrote the real
  registry - both now boot inside a throwaway `HOME`, and the desktop plugin fixture reports no `appInstance` rather than a catch-all stub.
  Measured: DSH import lines 135 -> 135.

- [ ] T012 When the DSH engine stops being the plugin host (DSH demoted to one chat driver), remove `ProfilePluginPackages`
  (`runtime/acryl-harness-runtime/src/profile-resolution/`, the 2026-10-25 port of DSH's profile package resolution): its two direct DSH
  imports (`resolver.ts` takes DSH's resolution types, `service.ts` subclasses DSH's `PluginPackages`) raised the DSH import ceiling in
  `scripts/verify-layout.mjs` from 133 to 135, and removing them is the path back to 133.
- [x] T013 `acryl-plugin-context`'s startup-hold route (`index.js`, the `STARTUP_PATH` route of specs/001 `tasks.md` T097) onto the
  router. Found while counting for T003: it is one of the nine remaining call sites and no slice above names it.
  Commit `f612cc60112cc2cfc2cfc12619d577a76ce2b3fb` (`plan.md` slice 6b). Evidence: full gate; all four workflows green; a unit test of the
  route (a page that leaves releases the hold at once) and the real-engine `web-startup-hold.spec.ts` on the router. Measured: call
  sites 5 -> 4.
- [ ] T014 (low priority) A Desktop boot from the owner's dev home (the T003 live run) warns `patch: entry "desktop-development-canvas"
  not found`: something stored still names the Development Canvas by its row id from before the rename to `acryl-development-canvas`
  (the anti-pattern the row-id rule in `CLAUDE.md` names). Not in the profile's own `cordis.patch.yml`, the source or the launcher
  scripts; likely a stored home or profile file (a `cordis.yml`, a Blend's manifest). Find it, and fix it in the read-time rename table
  (`RENAMED_BLUEPRINT_ROW_IDS` and its kin), not in anyone's home. Done when that boot logs no such warning and a test pins the rename.

Next: the drivers (spec 046 Phase 9, T028 `acryl-driver-dsh` and T029 `acryl-driver-pty`) act through the door T002 moves, and get their
own spec when this one reaches T007.
