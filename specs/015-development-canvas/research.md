# Research: Development Canvas

## Decision: Canvas is a standalone Cordis package

**Rationale**: Canvas has an independent Host lifetime, Client lifetime, bundle patch, native PTY dependency, styles, and replacement semantics. Keeping it as a Desktop subpath forced Desktop to import and poll for Canvas. The root workspace and layout gate now recognize `dsh-plugin-development-canvas` explicitly. Desktop declares the small `desktop.main` slot and a conversation fallback; Canvas contributes through that seam.

**Alternatives considered**: Keep the Desktop subpath and hardcoded React import (rejected because it is only nominally independent); `shell.overlay` only (cannot replace the main work area); conversation-node (wrong seam - nodes are chat rows, not a workspace).

## Decision: Chat is a tile, not a mode switch

**Rationale**: Orca keeps conversation beside terminals. Replacing `conversation` outright would hide DSH Chat. Wrapping `renderSlot('conversation')` as a `chat` tile preserves the upstream surface inside the ADE.

**Alternatives considered**: Toggle canvas vs chat (extra mode, easy to lose the transcript); overlay only (chat stays full-bleed, tiles float - fights the ADE metaphor).

## Decision: Terminal tiles own Host processes; UI only observes

**Rationale**: Constitution and orientation spec forbid hiding PTY in React. Desktop already opens an OS terminal via `desktopRuntime.openTerminal()`. That is the wrong shape for in-canvas agents. The implemented slice uses real `node-pty` sessions, bound 1:1 to a tile id and disposed by the Canvas Host plugin's `ctx.effect`.

**Alternatives considered**: Always call `openTerminal()` (native window, not a tile); child-process pipes (not a real TTY); reuse `ctx.terminals` immediately (its current ownership is DSH-Agent scoped rather than a user Canvas tab).

**Cordis follow-up**: The generic Terminal tab may keep this transport. The
hardcoded coding-agent commands are transitional and move to ACR-2's
`acrAgentControl` service/provider seam. That seam should adapt
`ctx.terminals`, `ctx.subagents`, and sandbox/process capabilities where their
contracts fit; raw terminal output must not become canonical room history.

## Decision: File tile is an in-memory editor in this slice

**Rationale**: `ctx.fs` is Host-side and workspace-scoped. A same-origin file read/write API needs path policy. Shipping a buffer editor proves the tile without a second security model.

**Alternatives considered**: Immediate `ctx.fs` routes (needs allowlisted roots); Monaco/CodeMirror (heavy Client bundle for P1).

## Decision: Browser tile is an iframe with http(s) only

**Rationale**: Electron renderer can embed documents without a new Guest WebContents for the first slice. Many sites send `X-Frame-Options`; the tile must survive that.

**Alternatives considered**: `<webview>` / extra BrowserView (true Chromium isolation, COLD-adjacent complexity); Design Mode (Orca-specific, out of scope).

## Decision: Spec Kit milestone 015, Wayfinder destination redraw

**Rationale**: The user named Development Canvas as the first feature to build, overriding the earlier "plan until ACR-1" note. The walking-skeleton map remains for room/relay work; this milestone is the ADE surface.

**Alternatives considered**: Fold canvas into stub `007-acr-6-minimal-ade-ui` (wrong number and still a stub).
