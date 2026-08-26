# Feature Specification: Development Canvas

**Feature Branch**: `015-development-canvas`
**Created**: 2026-08-23
**Status**: Draft
**Input**: User asked for an ADE canvas inspired by Orca (onorca.dev): press "+" to open a native PTY (other coding agents), open a file to edit, or open a browser. First serious plugin after the Cordis Hello World guide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a canvas and add tiles (Priority: P1)

A developer using DSH Desktop in advanced mode sees Development Canvas replace the entire main content area (Orca-style). Chat is the first tab. A top tab strip plus "+" is the only chrome. Choosing Terminal, File, Browser, or a coding agent opens a new tab that fills the main pane. Other tabs stay in the strip but do not tile the stage.

**Why this priority**: This is the product surface the user named as the first feature. Without "+", there is no ADE.

**Independent Test**: Launch advanced Desktop (or mount the canvas in a headless client test with a fake conversation slot). Click "+". Add each of the three tile kinds. Confirm each tile is visible and can be closed. Confirm the conversation tile still renders the existing chat surface.

**Acceptance Scenarios**:

1. **Given** advanced Desktop with a workspace session, **When** the window loads, **Then** the main area is Development Canvas: Chat fills the stage and a tab strip with "+" is visible.
2. **Given** the canvas, **When** the user presses "+" and chooses New Terminal or an agent, **Then** that tab becomes the only visible stage and Chat remains as a background tab.
3. **Given** the canvas, **When** the user presses "+" and chooses New File, **Then** a file tab fills the main pane with a path field and an editor.
4. **Given** the canvas, **When** the user presses "+" and chooses New Browser Tab, **Then** a browser tab fills the main pane with an address bar and a document view.
5. **Given** two or more tabs, **When** the user closes the active one, **Then** the neighbor becomes active and fills the stage. Closing Chat is allowed; "+" still works.
6. **Given** compatibility mode, **When** the app loads, **Then** the upstream default client is unchanged (no canvas).

---

### User Story 2 - Run another coding agent in a PTY tile (Priority: P1)

The Terminal tile is how ACR hosts agents that are not the DSH-native loop: Claude Code, Codex, OpenCode, Gemini CLI, Pi, or a plain shell. The user picks an agent (or shell) from the tile, the Host starts a process, and input/output appear inside the tile. Closing the tile stops the process.

**Why this priority**: The orientation spec and the user both require native PTY / CLI agents as first-class actors. A fake terminal that cannot run `claude` does not prove the ADE thesis.

**Independent Test**: Add a Terminal tile, select Shell, send a command that prints a known string, observe the string. Select an allowlisted agent command; if the binary is missing, the tile shows a clear error instead of hanging. Dispose the plugin or close the tile and confirm the child process is gone.

**Acceptance Scenarios**:

1. **Given** a Terminal tile, **When** the user starts Shell and types a command, **Then** stdout/stderr from that process appear in the tile.
2. **Given** a Terminal tile, **When** the user chooses Claude Code / Codex / OpenCode / Gemini / Pi, **Then** the Host spawns that allowlisted command (or reports that it is not installed).
3. **Given** a running PTY tile, **When** the user closes the tile, **Then** the Host session is disposed and the process does not leak.
4. **Given** compatibility mode or Linux advanced restrictions, **When** canvas is not mounted, **Then** no canvas PTY sessions exist.

---

### User Story 3 - Edit a file and browse a page (Priority: P2)

The File tile lets the user open a text file in an editor. The Browser tile loads a URL the user typed, so they can watch a local app while an agent works.

**Why this priority**: Orca's ADE loop is agent + editor + browser. P1 already proves the canvas; these tiles make it usable.

**Independent Test**: Create a File tile, type content, keep it across tile reflow. Create a Browser tile, enter `https://example.com` or a loopback URL, see the document. Sites that refuse iframes show an explanatory empty/error state rather than a crash.

**Acceptance Scenarios**:

1. **Given** a File tile, **When** the user types, **Then** the buffer updates and is still there after adding another tile.
2. **Given** a Browser tile, **When** the user submits a URL, **Then** the tile navigates to that URL in an embedded document view.
3. **Given** a URL that cannot be framed, **When** navigation fails to display, **Then** the tile remains usable (address bar still works).

---

### Edge Cases

- "+" menu dismisses on outside click and Escape.
- Duplicate Chat tiles are not created; Chat is at most one tile.
- Rapid add/close of Terminal tiles must not leak processes.
- Unload of the advanced shell (mode switch / generation restart) disposes every canvas PTY session.
- Empty canvas (user closed every tile) still shows "+" and a calm empty state.
- Browser tiles only accept `http:` and `https:` URLs.

## Requirements *(mandatory)*

- **FR-001**: Advanced mode MUST present Development Canvas in the main work area.
- **FR-002**: Compatibility mode MUST NOT register the canvas.
- **FR-003**: Users MUST be able to add Terminal, File, and Browser tiles from a "+" control.
- **FR-004**: Chat MUST remain available as a canvas tile that renders the existing conversation surface.
- **FR-005**: Tiles MUST be closable and MUST reflow without reloading the whole window.
- **FR-006**: Terminal tiles MUST start an allowlisted Host-owned process and stream input/output into the tile.
- **FR-007**: Closing a Terminal tile MUST dispose its Host process.
- **FR-008**: File tiles MUST provide an in-tile text editor.
- **FR-009**: Browser tiles MUST navigate `http`/`https` URLs in an embedded view.
- **FR-010**: Canvas behavior MUST be expressed as the independently activatable `dsh-plugin-development-canvas` Host/Client package row, not as a Desktop subpath, second Electron plugin system, or unconditional desktop-shell feature.
- **FR-011**: Disabling or unloading the Development Canvas row MUST restore the ordinary advanced conversation surface, remove Canvas routes, and dispose every Canvas-owned PTY.
- **FR-012**: Headless unit tests MUST cover tab state, plugin lifecycle, and PTY session disposal without launching a GUI.

## Success Criteria *(mandatory)*

- **SC-001**: A new user in advanced mode can add Chat + Terminal + File + Browser tiles in under 60 seconds without reading a manual.
- **SC-002**: After adding three tiles, all three remain visible and independently closable.
- **SC-003**: 100% of Terminal tiles closed in tests leave zero child processes.
- **SC-004**: Compatibility mode screenshots/tests match the upstream default client (no canvas chrome).
- **SC-005**: Users can run a shell command in a Terminal tile and read its output without leaving the canvas.

## Key Entities

- **Canvas**: the advanced-mode main work surface; owns an ordered list of tiles.
- **Tile**: a closable pane with a kind (`chat`, `pty`, `file`, `browser`) and kind-specific state.
- **PTY session**: Host-owned process bound to one Terminal tile; disposed with the tile or the plugin fiber.
- **Agent command**: allowlisted executable name the Terminal tile may spawn.

## Assumptions

- Canvas ships as the neighboring `dsh-plugin-development-canvas` workspace and package. Desktop owns only the `desktop.main` slot contract and default conversation contribution; Canvas owns its Host and Client implementations.
- Full Ghostty-class WebGL terminal, git worktrees, Design Mode click-to-inspect, and mobile companion are out of scope (Orca product, not this slice).
- Terminal/agent tabs use `node-pty` and xterm.js so interactive coding-agent TUIs receive a real terminal, byte-level input, ANSI rendering, and resize events. Persistent file load/save against the DSH filesystem seam remains a follow-up.
- Advanced mode remains macOS/Windows as today.

## Notes

Inspired by Orca ADE: one scene, many actors, terminals / editor / browser side by side. ACR law: agents are disposable; the canvas/room is persistent. Do not hide PTY ownership in React.
