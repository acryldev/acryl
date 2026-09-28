# Blocker report — devin-acp-integration

Written at feature completion (stories 11–14 landed). No story was left
unimplemented; the items below are the known gaps, deferred decisions, and
environment caveats that should accompany the upstream PR.

## Resolved during this pass

- **`AcrAgentControlService.dispatch` rejected lazy `start`/`resume`**
  (`runtimeId === null`). Fixed in story 11: start/resume dispatch without a
  live runtime and merge the transport result into the stored snapshot.
- **`JsonRpcClient` never wrote inbound-request results to the wire** —
  `session/request_permission` was unanswerable. Fixed in story 12
  (handler map → JSON-RPC result / `-32603` / `-32601`).
- **`deepseek-harness` pin drift** — restored to the `upstream.json` commit
  (`5dda764`) in `6b9a98d`.
- **`export { default }` missing from `acryl-control/src/index.ts`** — the
  `acryl-control` Loader row would have mounted a namespace object. Fixed in
  story 11.
- **Transport hardening from reviews** — failed-start worker wedge, missing
  child-process `error` listener (bad `binaryPath` would have crashed the
  host), unbounded `rpc.call`, SIGTERM-ignoring teardown never escalating to
  SIGKILL, scalar-JSON line host crash, permission-option kind/optionId
  spoofing, `providerSessionRef` ignored on resume, `stop` unreachable for
  `runtimeId === null` bindings, concurrent provider `send` races. All fixed
  and test-covered.

## Open item 1 — `ctx.approval` adapter (deferred, by design)

ACP `session/request_permission` is answered today by
`DevinAcpTransportConfig.permissionMode` policy plus the typed
`onPermissionRequest` callback seam — deliberately NOT wired into
`ctx.approval`: the DSH approval service requires a DSH `Agent` identity and
an open-turn context that `AgentSnapshot` bindings cannot satisfy. The
callback is the extension point for a future worker-scoped adapter that
projects ACP permission requests into the existing approval pipeline.

**Follow-up needed:** decide the adapter shape (either teach `ctx.approval` a
provider-neutral principal, or add a narrow `approval.request` variant that
accepts `{providerId, workerId, sessionRef}`). Until then, `permissionMode:
'dangerous'/'bypass'` auto-approves and `'normal'` fails closed — document
this in the PR so reviewers know the interactive-approval UX gap is
intentional.

## Open item 2 — `acp-work` branch reconciliation (user decision pending)

`acp-work` (not merged anywhere) contains four commits:

- `3132bc1`, `f0bb3bc` — **keep**: Direction B, Acryl acting as an ACP server
  for Devin Desktop (orthogonal, complementary to this feature).
- `256e287`, `a78e4b7` — **recommend drop**: the `dsh-subagent-acp` TUI
  integration is a different service seam than `acrAgentControl` and was
  superseded by this feature.

Recommendation: rebase `acp-work` to drop the two subpar commits, keep the
Direction-B pair for its own PR. Not executed here — it rewrites a branch the
user owns and is unrelated to this feature's mergeability.

## Open item 3 — deferred follow-ups (intentional)

- **Renderer UI wiring** for `dsh-desktop.devin-acp` settings — the settings
  section parses and composes the Loader patch today; a settings-tab control
  is a separate story.
- **Interactive `authenticate` method** — the transport still throws for ACP
  interactive auth; `devin auth login` store / `WINDSURF_API_KEY` cover real
  use. Wired when needed.
- **Real `devin acp` smoke** — `runtime/acryl-control/tests/devin-acp-smoke.spec.ts`
  exists but is gated behind `DEVIN_ACP_SMOKE=1` and requires a logged-in
  `devin` CLI; CI does not run it.

## Environment caveats (not regressions)

- `pnpm install` stalled inside one subagent sandbox; verified clean in a
  normal shell (`--lockfile-only` regenerated the identical lockfile, real
  install was a no-op). Lockfile is correct.
- Cyclic workspace *devDependency* edges
  (`acryl-agent-devin` → `acryl-control` → `acryl-harness-runtime` →
  `acryl-agent-devin`) are inherent to the required dep directions; pnpm
  warns but installs correctly.
- `acryl-web` `pnpm publish` rewrites `workspace:*` deps — the new package
  must be published (or excluded) before a web release; same latent class as
  existing unpublished workspace deps.
- Pre-existing upstream failures unchanged: `apps/acryl-cli` direct.spec 5s
  flake under parallel load; `apps/acryl-desktop`
  plugin-lifecycle-controller.spec references removed
  `acryl-development-canvas`; `plugins/acryl-ui` provenance byte-identity
  drift; `acryl-harness-runtime` extension-context / system-prompt-shape /
  cold-start env failures.
