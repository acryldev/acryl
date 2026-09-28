# Research: Agent Control (spikes T001 to T004, answered by building)

Answers are from the code that shipped on 2026-09-27 (`plugins/acryl-agent-control`), not from guesses.

## T001: how a Host-side tool reaches the page

**Verdict: a Client-initiated WebSocket to the Host.** The Host web server already supports exact-path upgrade routes (`ctx.webServer.registerUpgrade`, the same mechanism the workspace terminals use). The page opens `wss://<host>/api/acryl-agent-control/channel`; the Host tools send `{t:'call', id, request}` and the page answers `{t:'result'|'error', id, ...}`. No Harness change was needed, nothing is Electron-IPC-only, and a Desktop window is just a page served by the same Host, so **one implementation serves Web and Desktop**.
- The upgrade uses the same strict same-origin loopback check as every private route (`runtime/acryl-loopback-http`), with the exact `Origin` required, so another web page cannot connect (tested against a real socket).
- Only the window a call was sent to may answer it (a second window cannot forge a result).
- Calls have a timeout, honour cancellation, and settle as `unloaded` when the plugin is disposed and as `no-window` when the page goes away.

## T002: accessibility quality

The snapshot builder lists interactive controls, headings, landmarks, status regions and dialogs with role, name and state. A control with no accessible name is listed with an empty name and is still operable by its ref, but an empty name makes approval prompts and audit lines weak. The audit is therefore a standing task: components in `@acryl/ui` and the workspace need `aria-label`s where a control is an icon. Tracked as T050 below; measured on the real tree in a browser pass, not in jsdom.

**Measured (2026-09-27), jsdom of a composed real scene** (`ProjectsSidebar` with two worktrees and one running session, `TabStrip` with a Claude tab plus File, Browser, Diff, Kanban and Doc tiles - a first-order approximation of a real window, not the full app with Settings, the palette or the terminal dock open):

| metric | value |
| --- | --- |
| real accessible nodes (`snapshot.total`) | 29 |
| nodes at `maxNodes: 1000` | 29 (no truncation this small) |
| nodes at the default cap (300) | 29 |
| rendered text size (`renderSnapshot`) | 1,207 characters |
| JSON size (`JSON.stringify`) | 2,311 characters |
| interactive controls with an empty accessible name | 0 |
| roles present | `button` 18, `tab` 9, `tablist` 2 |

A scene this size (29 nodes) sits nowhere near `MAX_SNAPSHOT_NODES` (1000) or the default page size (300), so pagination is not yet exercised by a real window; a larger scene (Settings open, the palette open, a long Projects list) would be needed to measure that path, and is deferred to the real-browser pass (T050) rather than approximated further in jsdom. Zero unnamed interactive controls in this scene is consistent with T050's own finding ("the jsdom scenarios found none in the Projects path form and the + menu"), extended here to the wider tab strip and sidebar - encouraging, but still not the same claim as a clean real-browser audit.

## T003: approval and policy

**Verdict: the Harness's own pre-execute policy does it, per call.** A `tools/pre-execute` hook can return `{kind:'ask', reason}`; the harness then makes one `ctx.approval` request, and only `allowed-once` proceeds (`rejected`, `cancelled` and `unavailable` deny). The plugin's hook asks for `ui_click`, `ui_type`, `ui_select` and `ui_press` every time, in words that name the control ("Click the button \"Delete project\"") using the refs of the latest snapshot. It calls `next()` first, so another plugin's denial still wins. Verified against the real engine: with nobody to answer, a click is denied and never reaches the page. `ui_snapshot`, `ui_scroll` and `ui_wait` only look, so they are not asked about.
- Tool names use underscores (`ui_click`), matching the harness's own tools, not the dotted names in the first draft of the spec.
- Self-protection lives in the driver and is enforced by rule: controls inside regions named approval, permission, policy or Agent Control, or marked `data-acryl-no-agent`, are listed as `protected` and never operated. The indicator's own buttons carry that mark.

## T004: multi-window and Web behaviour

Each window announces itself (`hello`, then `focus` events); the agent drives the window the user focused last. Layer 3 (`ui_screenshot`) is not built: it needs a native or canvas capture and stays a typed adapter with a declared absence on Web (see tasks).

## Scope B spikes (TB01, TB02), answered by building `acryl doctor` and `acryl repair`

**TB01: what a static diagnosis can conclude.** From files and recent logs only, without starting anything, `inspectProfile` (`runtime/acryl-harness-runtime/src/profile-repair/`) recognizes: a profile with no directory; an unreadable plugin override file; an unreadable profile manifest; a listed bundle that is not installed; a pnpm layout that disagrees with what is installed (`nodeLinker`); a plugin that failed to activate, named by the **innermost** `failed to apply loader entry <row>` in the recent logs (the outer rows only say their child failed, as in the `acryl-engine` → `include` → `webserver` chain seen when port 3080 was taken); and the pnpm store mismatch symptom ("package manager did not complete successfully"). A failure inside an engine row (`acryl-engine`, `include`, `webserver`) is reported with guidance and no recipe, because disabling the engine fixes nothing.

**TB02: the CLI runs when the Desktop bundle is broken.** `apps/acryl-cli` depends on `acryl-harness-runtime` and `acryl-control`, never on `acryl-desktop` or `acryl-web`, and `doctor`/`repair` import only the runtime's `profile-repair` module (no plugin, no engine boot). Proven by the tests, which run them against temporary homes with a plugin that cannot activate.

**Recipes.** Exactly two can run unattended, and only when named with `--yes --recipe`: `restore-override-file` (replace an unreadable override file with the last valid backed-up copy, or an empty one, keeping the damaged bytes) and `disable-failing-row` (record the failing row as disabled through the same lifecycle state file every surface uses; nothing is uninstalled). Every change is preceded by a pre-image backup with a checksummed manifest written last, so an interrupted repair leaves nothing that looks valid; a failure after the backup is rolled back; `acryl repair --undo <id>` puts every file back and removes what a repair created. A dry run names each file and row before anything is written.

## TB03: channel discovery and auth for the outside operator (threat model)

The CLI, run by the same user from a terminal, needs to find a running app instance and open an authenticated control channel to it (TB30/TB31). This
threat model is written against the merged spec 036 `AppInstance`/Registry/offline-lock design (`runtime/acryl-harness-runtime/src/instance/`), not a
guess at it, and reuses mechanisms already built and shipped rather than inventing new ones.

**Discovery is already solved.** The Registry (`instance/registry.ts`) already answers "which apps are running, where": each app announces itself into
`~/.acryl-instances/.running/<id>.json` (home, pid, surface, port), the directory is `0o700` and each file `0o600` - readable only by the OS user that
started it, the same access control every local secret file in this design already relies on (the offline lock file is `0o600` the same way). `acryl ps`
already reads it. Nothing new is needed for "which app, which port" - the open question is only "how does the CLI prove it is allowed to control the one
it picked."

**The channel itself should reuse the exact pattern `acryl-agent-control`'s own status route already proves in production** (`plugins/acryl-agent-control/src/agents/status/route.ts` pattern, generalized): one loopback-only HTTP(S) endpoint the running app's Host already serves, guarded by a
per-instance secret, checked with `timingSafeEqual` so response-time does not leak how much of the token matched.

- **Where the secret lives**: a new file next to the run lock (`<home>/.dsh/control-secret` or similar - exact path decided when TB30 is built), written
  once at Host startup with `randomBytes(24)`, mode `0o600`, in the same directory the run lock and Registry entry already live in. It is never placed in
  the Registry entry itself (which is meant to be a listing, and its exact read-permission story for "other tools that shell out to `acryl ps`" is looser
  than a secret should get).
- **How the CLI gets it**: the CLI is running as the *same OS user*, so it can simply read the file - no handshake, no prompt, matching how Docker's own
  CLI trusts a local socket it can open, and how Jupyter's own token file works. This is the same trust boundary the Registry and the offline lock already
  accept: **same OS user, unauthenticated between processes; a different OS user is refused by filesystem permissions,** full stop. This is deliberately
  not a stronger boundary than that - building session-level auth between two processes the OS itself already lets read each other's files would be
  security theatre.
- **The network boundary**: `isLoopbackAddress`/`isSameOriginLoopbackRequest` (`runtime/acryl-loopback-http`, already used by every private route in this
  codebase) refuses anything not from `127.0.0.1`/`::1`. This is the one boundary that matters for a *different* machine or a browser tab from another
  origin: the secret alone is not the only gate, the socket has to be local too - matching Scope A's own in-page channel, which already binds to loopback
  before it even looks at a token.
- **Loopback vs. a Unix socket**: a Unix socket with filesystem-permission-gated access (`0o600`, same user) would remove the "guess the token" attack
  surface entirely (no listening TCP port at all), at the cost of Windows support (named pipes would be the equivalent there, a second code path). Given
  every other private route in this codebase already uses loopback HTTP with a same-origin/token check and works on Windows today, **recommendation: stay
  with loopback HTTP and a token**, for one implementation across platforms, consistent with the rest of the codebase's own choices - not a Unix socket,
  unless a concrete problem with the token approach shows up in practice.

**What this explicitly does not defend against**, named plainly rather than glossed over:

- **A malicious process running as the same OS user** (a compromised npm postinstall script, a malicious VS Code extension) can read the secret file and
  the Registry exactly as the legitimate CLI does. This is not a gap specific to this design - it is the same boundary every local dev tool on the machine
  already accepts (an attacker with same-user code execution can already read `~/.ssh`, browser cookies, and every other local secret file). Scope A's own
  in-page channel and the offline lock already made this same acceptance; TB03 does not attempt to raise the bar past it, and doing so (OS keychain-backed
  secrets, hardware-bound tokens) would be disproportionate to what a local dev tool needs.
- **A port-scanning attacker from a different machine on the same LAN** is stopped at the loopback check, not the token - the token is defense in depth
  for anything that somehow reaches the loopback interface (a misconfigured proxy, a container network quirk), not the primary control.
- **A stale secret after a crash** is handled the same way the offline lock already handles a stale holder: the secret file's lifetime is tied to the
  `AppInstance`'s run lock, so a crashed app's secret is orphaned the same way its lock is, and a fresh start writes a fresh one (TB30 needs to actually
  wire this rotation in; noted here so it is not missed).

**Recommendation for TB30**: the in-app authenticated endpoint is one `ctx.effect()` in a Host plugin (the same shape `acryl-agent-control` already
uses for its status route), reusing `acryl-loopback-http`'s existing helpers, writing its secret next to the instance's `runLockFile`. No new
cryptographic primitive, no new transport, no new trust boundary beyond what the Registry and the offline lock already accept - this is wiring a fourth
consumer onto patterns TB10-TB13 and Scope A already proved, not a new design.
