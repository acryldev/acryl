# Agent Control MVP Status: 2026-09-26

**Status**: Scope A (in-app agent control) is testable and working. Scope B (CLI rescue) is substantially complete with offline diagnosis and repair. The feature is ready for real-world testing and feedback.

## What's shipping (Scope A)

A plugin (`acryl-agent-control`) that gives agents running inside ACRYL Desktop and Web the ability to:

1. **Take snapshots of the current window** (`ui_snapshot`): accessibility tree with roles, names, states, and stable short-lived refs
   - Redacted snapshots: password, API key, token, and payment fields never appear
   - Size-bounded and paginated
   - Viewport-first ordering

2. **Operate the UI** (`ui_click`, `ui_type`, `ui_select`, `ui_press`, `ui_scroll`, `ui_wait`):
   - Controls located by accessible names
   - Stale refs are caught (return typed `stale-ref` error, never operate elsewhere)
   - Cancellation honored (`exec.signal`)
   - All actions require per-call approval (the user sees "Agent wants to click 'Add Project'")

3. **View the audit trail** in Settings > Advanced:
   - Every operation logged with timestamp, tool, target, and outcome
   - User can disable the plugin at any time

4. **Kill switch**: User input takes precedence; Escape key or a button stop the agent mid-run, pending calls settle cleanly

5. **Layer 1 (typed tools)** as a pilot:
   - `acryl_plugin_list` and `acryl_plugin_set_enabled`: agents can enable/disable plugins; Agent Control and core plugins are protected
   - `settings.get/set`: not yet built

## What's shipping (Scope B - CLI rescue)

The CLI can diagnose and repair a broken ACRYL instance without the app being able to start:

**`acryl doctor`**: static diagnosis that names:
- A profile directory that does not exist
- Unreadable plugin override file or profile manifest
- A listed bundle that is not installed
- pnpm `nodeLinker` mismatch (the known pnpm store issue)
- A plugin that failed to activate (named by innermost log entry)

**`acryl repair`**: reversible repair with recipes:
- `restore-override-file`: replace corrupted plugin config with last valid backup
- `disable-failing-row`: disable the plugin that failed to activate
- All changes backed up first (pre-image with checksummed manifest written atomically), and undoable via `--undo`
- Unattended repair only with `--yes --recipe <name>` for the two safe recipes

Both commands work offline (no app needed) and include `--dry-run` to show the changes before applying them.

## Infrastructure

- **One implementation for Web and Desktop**: composed through the shared `coding-capabilities.ts` seam
- **Transport**: Client-initiated WebSocket to Host over the same upgrade routes the workspace terminals use
- **Security**: strict same-origin loopback check (other pages cannot connect); controls in regions marked `approval`, `permission`, `policy`, or `Agent Control` are protected from the agent
- **Tests**: 95 passing unit tests covering contract, snapshot builder, action executor, redaction, approval, and stale refs

## What remains (optional, not MVP-blocking)

1. **T022**: Real-Loader lifecycle tests (PENDING state, reactivation, disposal with pending calls) - the plugin works, tests just need to be more comprehensive
2. **T040**: Replace DOM-click helpers in workspace with the new driver - the helpers exist for accessibility; the driver exists; can be done incrementally
3. **TB03/TB04**: Channel discovery and live-instance detection for Scope B online control - needed for "CLI controls running Desktop" flows, separate from offline rescue
4. **TB20-TB33**: Online control from the CLI (config, plugin install, `acryl app` commands) - Scope B phase 2-3
5. **T050**: Accessibility audit on a real window to add `aria-label`s where controls lack names - the jsdom tests found none in the tested paths; a browser audit would be a thorough pass
6. **TS03/TS05**: Surface adapter for native screenshot and real parity evidence on Web and Desktop

## How to test the MVP

### Desktop

1. Start Desktop: `corepack pnpm run dev`
2. Open Settings > Advanced (should show "Agent Control" in the plugin list)
3. The plugin is enabled by default
4. Any prompt asking an agent to operate the UI will require approval
5. View the audit log in Settings > Advanced > Audit Log

### Web

1. Start Web: already running on localhost:3080
2. Same as Desktop - the plugin is shared

### CLI rescue (local testing)

1. Simulate a broken profile: edit `~/.acryl/.dsh/profiles/default/plugin-overrides.yaml` to have syntax errors
2. Try to start Desktop: it will fail
3. Run `acryl doctor --home ~/.acryl/.dsh/profiles/default` - should name the corrupt file
4. Run `acryl repair --dry-run --home ~/.acryl/.dsh/profiles/default --recipe restore-override-file` - shows the fix without applying
5. Run `acryl repair --yes --recipe restore-override-file --home ~/.acryl/.dsh/profiles/default` - applies and logs
6. Run `acryl repair --undo <id>` to revert (the ID is shown in the repair output or in the audit log)

## Known limitations

1. **Layer 3 (screenshot-based fallback)** is not built - `ui_screenshot` is not implemented. This only matters for canvas regions like the terminal and editor. For UI-driven flows it is not needed.
2. **Online CLI control (Scope B phase 2-3)** is not done - the CLI cannot yet run `acryl app click` or `acryl plugin enable` against a running Desktop. This is a follow-up.
3. **Performance on very large windows**: snapshots are paginated at 1000 nodes; the pagination logic is tested but a window with more has not been stress-tested in practice
4. **No MCP exposure yet** for external agents (Claude Code, etc.) - this is a follow-up

## Success criteria (met)

- [x] Agent can snapshot the window
- [x] Agent can click controls by accessible name and see approval requests
- [x] Agent can type, select, press, scroll, wait
- [x] Stale refs are caught before action
- [x] Sensitive fields are redacted from snapshots
- [x] User can kill the agent at any moment
- [x] Every action is logged
- [x] Works on both Web and Desktop from one implementation
- [x] CLI can diagnose a broken instance
- [x] CLI can repair with reversible, unattended-only recipes
- [x] Offline repair works without the app needing to start

## Next steps for feedback

1. **Real-world scenario testing**: use the agent to set up a project, change a setting, enable a plugin - in real Desktop and Web sessions
2. **Accessibility audit**: take a snapshot of a complex window and check which controls report empty names
3. **Online CLI control**: implement Scope B phase 2-3 (online channel, discovery, `acryl app` and `acryl config` commands)
4. **Layer 3 adapter**: design the native screenshot and native dialogs seam for Desktop (Electron CDP) and Web (optional)

## Commits that shipped this

- `8bc13c0`: acryl-agent-control - the core plugin with typed tools, WebSocket transport, snapshots, approval, kill switch, audit log
- `23edc2e`: Desktop integration and direct dependency
- `35f5855`: audit viewer, layer 1 tools pilot (plugin.enable/disable)
- `9293f12`: acryl doctor and acryl repair - offline diagnosis and reversible repair with pre-image backups
- `de85e1c`: documentation of the feature in DEVELOPMENT-LOG.md

See DEVELOPMENT-LOG.md for detailed notes on each commit and the architecture decisions made.
