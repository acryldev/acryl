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
- [ ] T002 `acryl-agent-control`, the door, onto the router (was 046 T024). In progress on branch `048-ide-on-framework`. Keeps the
  loopback-only rule, the per-run secret file and every-call approval exactly; operator refusals stay 403 (`acryl control` reads them).
  Proof required: route tests over a real socket, a plugin test on real Cordis with the real router, and `acryl control snapshot` plus one
  `acryl control tool call` end to end against an isolated app. The `agent-control-ui` capability declares that it needs the router, and
  Blueprint parsing refuses it without the `framework-kit` row (the workspace's check from T001, generalized).
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

Next: the drivers (spec 046 Phase 9, T028 `acryl-driver-dsh` and T029 `acryl-driver-pty`) act through the door T002 moves, and get their
own spec when this one reaches T007.
