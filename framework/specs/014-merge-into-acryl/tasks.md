# 014 tasks

Each task is a branch of ACRYL. A task closes when its evidence exists on that branch and the owner has reviewed it.

- [x] T300 Upgrade planning in `runtime/blends-core` (`planUpgrade`, `applyUpgrade`), built on `resolveDefinition`. Done on the ACRYL
  branch `blends-upgrade-plan` (worktree `.worktrees/blends-upgrade-plan`), commits `dc9eed4` and `953be48`; 14 new tests, package check
  99 green, `check:layout` green. Local only: not pushed, not on `main`, awaiting the owner's review.
- [x] T301 (macOS) Sandbox spike: `--permission` works under Electron-as-Node, identically to Node; see `t301-sandbox-spike.md`.
  Open: Windows and Linux packaged builds, and the `ELECTRON_RUN_AS_NODE` hazard the port must handle.
- [x] T302 `acryl-tool-sandbox` and the sandboxed tool kind, done on the ACRYL branch `tool-sandbox` (worktree `.worktrees/tool-sandbox`), commits
  `5952e954` (package), `fd8c3ee9` (kind in `acryl-extension-context`, opt-in `tool-sandbox` Blueprint row), `2b559c95` (log). Named `toolSandbox` because
  the Harness owns `ctx.sandbox`; composes with it (`confine` read-only, enforcement reported, fail closed); `ELECTRON_RUN_AS_NODE=1` under Electron,
  tested. Proven on a real engine boot (install, call, update, escaping tool refused, remove, restart) and on the real macOS Seatbelt profile.
  Local only: not pushed, not on `main`. Open: Windows and Linux runs, router mention, no network isolation.
- [x] T303 Compare `tasks` with Harness `jobs`; decided, see `t303-jobs-comparison.md`: not ported as a second concept; the durable part,
  if ever wanted, is a second provider of the `JobRegistry` seam; deferred until a consumer needs cross-restart jobs.
- [x] T304 Extension `check` and approval gate: ACRYL already has each part; no port. Two small open items (install-aware prompt text, hosted pending-install queue) in `t304-extension-gate-comparison.md`.
- [ ] T305 Retire aimbrace: README pointer, archive note.

- [x] T306 Container starter pack: `aimbrace init --agent` now writes a `Dockerfile` and `.dockerignore`; `AIMBRACE_HOST` sets the interface (default loopback). Verified in a real container (OrbStack): the agent built and installed a plugin through `/ask`, it survived `docker restart`, and a recreated container on the same volume still served it. See `specs/014-merge-into-acryl/t306-container-starter-pack.md`.
