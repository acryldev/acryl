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
- [ ] T003 `apps/acryl-desktop`: the settings, preferences, renderer boot report and directory picker and validator routes (was 046 T023).
- [ ] T004 `acryl-sign-in`: its five sign-in routes; the checks stay exactly (was part of 046 T025).
- [ ] T005 Find the terminal's PATH without blocking (was 047 T017): ask the login shell asynchronously once, cache the promise, and make
  the callers that need it (`start`, `canRun`) wait for it, so activating the workspace never blocks the Host's event loop (about 1.2 s
  with an interactive zsh today, on every activation). Planned right after T002.
- [ ] T006 `acryl-plugin-admin` and `acryl-support` (was part of 046 T026).
- [ ] T007 WebSocket upgrades on the router (spec 047 T009), then the workspace terminal stream and the door's page channel move off
  `registerUpgrade`.
- [ ] T008 Remove the `acrylWeb` carrier's registration methods and the `engine-web.ts` delegate once nothing registers through them (was
  046 T022, rescoped: the composition root stops handing the server to plugins).
- [ ] T009 Ratchet: the call-site count becomes a layout gate in `scripts/verify-layout.mjs`, like the DSH import ceiling (was 046 T027).
- [ ] T010 The agent-facing plugin docs and example in `acryl-plugin-context` teach the router, not `webServer` (the item left open in
  046 T020).
- [ ] T011 `acryl control` can discover every running app, not only `pnpm blank` ones. Since `1b10c17c` (2026-09-27) the running-app
  registry (`runtime/acryl-harness-runtime/src/instance/registry.ts` `announce`) is written only by `scripts/lib/instances.mjs`
  `claimInstance`; the Web launcher, Desktop and the npm CLI never announce, so `acryl control list` says "no ACRYL app is running" while
  one runs with its online channel on (reproduced in the T002 live run, which wrote the pointer by hand to reach the door). Each composition
  root should claim and announce its instance with its real port once it listens, and withdraw on exit.

Next: the drivers (spec 046 Phase 9, T028 `acryl-driver-dsh` and T029 `acryl-driver-pty`) act through the door T002 moves, and get their
own spec when this one reaches T007.
